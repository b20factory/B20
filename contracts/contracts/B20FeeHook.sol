// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";

/**
 * @title B20FeeHook
 * @notice B20factory's Uniswap V4 swap-fee hook with a Clanker-style DYNAMIC fee.
 *         Fee is always paid in native ETH (buys charged on input in beforeSwap,
 *         sells on output in afterSwap; exact-input only). Per pool the fee floats
 *         between a `baseFeeBps` and a `maxFeeBps` (both within [1%, 5%]):
 *           - calm market -> fee sits at the base;
 *           - volatile market (snipers / dumps moving price hard) -> fee scales up
 *             toward the max, protecting LPs and taxing volatility, capped at maxFee.
 *         Volatility is measured by how many ticks the previous swap moved the price
 *         (|tickDelta|): the more the last swap moved price, the higher the fee on the
 *         next one, ramping fully to max at VOL_FULL_TICKS.
 *
 *         Worst case a buy/sell simulator can ever observe is maxFee (<= 5%), so the
 *         token is never honeypot-flagged (unlike OriginPad's 80% anti-sniper decay).
 *         The paired B20 token has no transfer tax.
 * @dev Address must be CREATE2 mined so low bits encode beforeInitialize (0x2000) +
 *      beforeSwap (0x80) + afterSwap (0x40) + beforeSwapReturnDelta (0x08) +
 *      afterSwapReturnDelta (0x04) = 0x20CC. Pools are native-ETH / TOKEN
 *      (currency0 = ETH). beforeInitialize gates pool creation to the factory.
 */
contract B20FeeHook is BaseHook {
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    uint256 public constant MIN_FEE_BPS = 100; // 1% floor
    uint256 public constant MAX_FEE_BPS = 500; // 5% cap (Clanker-style)

    // Tick movement (abs) of the previous swap at which the variable fee reaches its
    // full (maxFee - baseFee) span. ~600 ticks ~= 6% price move => max fee.
    int24 public constant VOL_FULL_TICKS = 600;

    address public immutable owner;
    address public factory;

    // poolId => recipient that collects this pool's ETH fees (a splitter)
    mapping(PoolId => address) public feeRecipient;
    // poolId => base (resting) fee in bps, charged in calm markets
    mapping(PoolId => uint256) public baseFeeBps;
    // poolId => max fee in bps, the ceiling the dynamic fee ramps to
    mapping(PoolId => uint256) public maxFeeBps;
    // poolId => pool tick after the previous swap (volatility reference)
    mapping(PoolId => int24) public lastTick;
    // poolId => abs tick movement of the previous swap (drives the current fee)
    mapping(PoolId => uint256) public lastTickDelta;

    event FactorySet(address indexed factory);
    event PoolRegistered(PoolId indexed poolId, address recipient, uint256 baseFeeBps, uint256 maxFeeBps);
    event FeeTaken(PoolId indexed poolId, uint256 amount);

    constructor(IPoolManager _manager, address _owner) BaseHook(_manager) {
        owner = _owner;
    }

    function setFactory(address _factory) external {
        require(msg.sender == owner, "not owner");
        require(_factory != address(0), "zero factory");
        factory = _factory;
        emit FactorySet(_factory);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Called by the factory once per pool. `baseFeeBps` is the resting fee,
    ///         `maxFeeBps` the dynamic ceiling; both in [MIN_FEE_BPS, MAX_FEE_BPS] and
    ///         maxFeeBps >= baseFeeBps. Pass maxFeeBps == baseFeeBps for a flat fee.
    function registerPool(PoolKey calldata key, address recipient, uint256 _baseFeeBps, uint256 _maxFeeBps) external {
        require(msg.sender == factory, "not factory");
        require(recipient != address(0), "zero recipient");
        require(key.currency0.isAddressZero(), "currency0 not native");
        require(_baseFeeBps >= MIN_FEE_BPS && _baseFeeBps <= MAX_FEE_BPS, "base out of range");
        require(_maxFeeBps >= _baseFeeBps && _maxFeeBps <= MAX_FEE_BPS, "max out of range");
        PoolId id = key.toId();
        require(feeRecipient[id] == address(0), "registered");
        feeRecipient[id] = recipient;
        baseFeeBps[id] = _baseFeeBps;
        maxFeeBps[id] = _maxFeeBps;
        // Reference tick = the pool's starting tick, so the first swaps sit at base.
        (, int24 tick,,) = poolManager.getSlot0(id);
        lastTick[id] = tick;
        emit PoolRegistered(id, recipient, _baseFeeBps, _maxFeeBps);
    }

    /// @notice The fee in bps applied right now: base + a variable part that scales
    ///         with the previous swap's price movement, capped at maxFee.
    function currentFeeBps(PoolId id) public view returns (uint256) {
        uint256 base = baseFeeBps[id];
        uint256 mx = maxFeeBps[id];
        if (mx <= base) return base;
        uint256 d = lastTickDelta[id];
        uint256 full = uint256(uint24(VOL_FULL_TICKS));
        if (d >= full) return mx;
        return base + ((mx - base) * d) / full;
    }

    /// @dev Record the price move of the swap that just happened so it drives the fee
    ///      on the next swap (realized-volatility dynamic fee).
    function _updateVol(PoolId id) private {
        (, int24 tick,,) = poolManager.getSlot0(id);
        int24 prev = lastTick[id];
        int24 diff = tick > prev ? tick - prev : prev - tick;
        lastTickDelta[id] = uint256(uint24(diff));
        lastTick[id] = tick;
    }

    /// @dev Gate pool creation to the factory. The pool key is deterministic and the
    ///      token address is predictable, so without this anyone could front-run
    ///      `initialize` on a pending launch's pool (at a junk price) and make the
    ///      launch seed-less / untradeable. Only the factory may initialize a pool.
    function _beforeInitialize(
        address sender,
        PoolKey calldata,
        uint160
    ) internal view override returns (bytes4) {
        require(sender == factory, "only factory init");
        return BaseHook.beforeInitialize.selector;
    }

    /// @dev Buy = ETH (currency0) in. Take the ETH fee from the input.
    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // I-1: exact-input only — by design, not a limitation. The fee is charged on the
        // specified (input) side; allowing exact-output would let a buyer specify output
        // and bypass the input-side fee. Reverting exact-output closes that bypass.
        require(params.amountSpecified < 0, "exact-input only");
        if (!params.zeroForOne || params.amountSpecified >= 0) {
            return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }
        PoolId pid = key.toId();
        address recipient = feeRecipient[pid];
        if (recipient == address(0)) {
            return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        uint256 inputAmount = uint256(-params.amountSpecified);
        uint256 feeAmount = (inputAmount * currentFeeBps(pid)) / 10000;
        if (feeAmount == 0) {
            return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        poolManager.take(key.currency0, recipient, feeAmount);
        emit FeeTaken(pid, feeAmount);
        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(int128(int256(feeAmount)), 0), 0);
    }

    /// @dev Sell = ETH (currency0) out. Take the ETH fee from the output, then update
    ///      the volatility reading from this swap (for both buys and sells).
    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        PoolId pid = key.toId();
        int128 feeReturn = 0;

        // Sell fee (token -> ETH), charged on the ETH output using the current fee.
        if (!params.zeroForOne && params.amountSpecified < 0) {
            address recipient = feeRecipient[pid];
            if (recipient != address(0)) {
                int128 ethOut = delta.amount0();
                if (ethOut > 0) {
                    uint256 feeAmount = (uint256(uint128(ethOut)) * currentFeeBps(pid)) / 10000;
                    if (feeAmount > 0) {
                        poolManager.take(key.currency0, recipient, feeAmount);
                        emit FeeTaken(pid, feeAmount);
                        feeReturn = int128(int256(feeAmount));
                    }
                }
            }
        }

        // Update realized volatility from this swap's tick movement.
        if (feeRecipient[pid] != address(0)) _updateVol(pid);

        return (BaseHook.afterSwap.selector, feeReturn);
    }
}
