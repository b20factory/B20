// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Minimal local mirror of Uniswap V4 PoolKey (ABI-encodes identically to the router's).
struct SplitPoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

interface IB20SwapRouter {
    function swapExactIn(
        SplitPoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minOut,
        address recipient
    ) external payable returns (uint256);
}

/**
 * @title B20FeeSplitter
 * @notice One per launched token. Receives the swap fee in native ETH from the
 *         B20FeeHook and splits it between the creator and the platform
 *         (`creatorBps` of 100 to the creator, the rest to the platform).
 *         distribute() is permissionless.
 *
 *         The creator chooses how THEIR share is delivered (feeReceiveType):
 *           0 = ETH only   (native ETH, default)
 *           1 = TOKEN only (buy the token back with the ETH, send token)
 *           2 = BOTH       (half ETH, half bought-back token)
 *         The PLATFORM is ALWAYS paid in ETH. The token buyback routes through the
 *         B20 swap router; if it ever fails (no router/pool/slippage) the creator is
 *         paid ETH instead, so distribute() can never brick.
 * @dev `creatorBps` and `feeReceiveType` are IMMUTABLE per token, set at launch.
 *      L-1: a failed ETH push is parked as a pull balance (pending + withdraw())
 *      instead of reverting, so one bad recipient can't lock the other's funds.
 */
contract B20FeeSplitter is ReentrancyGuard {
    address public immutable creator;
    address public immutable platform;
    uint256 public immutable creatorBps; // out of 100 (e.g. 55 => platform gets 45)

    // Buyback config (set once by the factory at token deploy).
    address public immutable token;        // this token (currency1)
    address public immutable router;       // B20 swap router (0 = buyback disabled)
    address public immutable feeHook;      // hook in the pool key
    uint8 public immutable feeReceiveType; // 0=ETH, 1=TOKEN, 2=BOTH

    int24 internal constant TICK_SPACING = 60; // matches the factory pool

    // L-1: parked balances for recipients that rejected a push.
    mapping(address => uint256) public pending;

    event Distributed(uint256 toCreator, uint256 toPlatform);
    event Parked(address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    constructor(
        address _creator,
        address _platform,
        uint256 _creatorBps,
        address _token,
        address _router,
        address _feeHook,
        uint8 _feeReceiveType
    ) {
        require(_creator != address(0) && _platform != address(0), "zero addr");
        require(_creatorBps <= 100, "bps>100");
        require(_feeReceiveType <= 2, "bad fee type");
        creator = _creator;
        platform = _platform;
        creatorBps = _creatorBps;
        token = _token;
        router = _router;
        feeHook = _feeHook;
        feeReceiveType = _feeReceiveType;
    }

    receive() external payable {}

    /// @notice Split the accumulated ETH fees. Anyone can call. Creator buyback is
    ///         unprotected here (try/catch -> ETH fallback); use the minOut overload
    ///         from a keeper/oracle to bound slippage.
    function distribute() external nonReentrant { _distribute(0); }

    /// @notice Same, but with a slippage floor on the creator's token buyback so it
    ///         can't be MEV-sandwiched.
    function distribute(uint256 minCreatorOut) external nonReentrant { _distribute(minCreatorOut); }

    function _distribute(uint256 minCreatorOut) private {
        // Only the not-yet-parked balance is distributable.
        uint256 bal = address(this).balance - pending[creator] - pending[platform];
        require(bal > 0, "nothing to distribute");
        uint256 toCreator = (bal * creatorBps) / 100;
        uint256 toPlatform = bal - toCreator;

        _pay(platform, toPlatform);            // platform ALWAYS ETH
        _payCreator(toCreator, minCreatorOut); // creator per chosen type

        emit Distributed(toCreator, toPlatform);
    }

    /// @notice Withdraw a parked balance (recipient that previously rejected a push).
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        require(amount > 0, "nothing pending");
        pending[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amount);
    }

    function _payCreator(uint256 amount, uint256 minOut) private {
        if (amount == 0) return;
        if (feeReceiveType == 1) {            // TOKEN only
            _buybackToCreator(amount, minOut);
        } else if (feeReceiveType == 2) {     // BOTH: half ETH, half token
            uint256 half = amount / 2;
            _pay(creator, amount - half);
            _buybackToCreator(half, minOut);
        } else {                              // ETH only (default)
            _pay(creator, amount);
        }
    }

    /// @dev Buy the token with `ethIn` and send it to the creator. On any failure
    ///      (no router/token, pool not ready, slippage) fall back to paying ETH.
    function _buybackToCreator(uint256 ethIn, uint256 minOut) private {
        if (ethIn == 0) return;
        if (router == address(0) || token == address(0)) { _pay(creator, ethIn); return; }
        SplitPoolKey memory key = SplitPoolKey({
            currency0: address(0), currency1: token, fee: 0, tickSpacing: TICK_SPACING, hooks: feeHook
        });
        try IB20SwapRouter(router).swapExactIn{value: ethIn}(key, true, ethIn, minOut, creator) returns (uint256) {
            // token delivered to the creator by the router
        } catch {
            _pay(creator, ethIn); // buyback failed: pay ETH instead
        }
    }

    /// @dev Try to push ETH; on failure park as a claimable balance (never reverts).
    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount, gas: 30000}("");
        if (!ok) { pending[to] += amount; emit Parked(to, amount); }
    }
}
