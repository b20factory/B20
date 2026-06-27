// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./B20FeeSplitter.sol";
import "./B20Vesting.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {CurrencySettler} from "./lib/CurrencySettler.sol";

interface IB20FeeHook {
    function registerPool(PoolKey calldata key, address recipient, uint256 baseFeeBps, uint256 maxFeeBps) external;
}

/// @notice Singleton B20 factory precompile introduced by the Base Beryl upgrade.
///         B20 tokens are native (Rust precompile), a superset of ERC-20.
interface IB20Factory {
    enum B20Variant { ASSET, STABLECOIN }

    struct B20AssetCreateParams {
        uint8 version;       // encoding version, currently 1
        string name;
        string symbol;
        address initialAdmin; // address(0) = admin-less (no mint/pause/freeze authority)
        uint8 decimals;       // [6, 18]
    }

    function createB20(B20Variant variant, bytes32 salt, bytes calldata params, bytes[] calldata initCalls)
        external payable returns (address token);
    function getB20Address(B20Variant variant, address sender, bytes32 salt) external view returns (address);
    function isB20Initialized(address token) external view returns (bool);
}

/// @notice Minimal B20 / ERC-20 surface this factory needs.
interface IB20Token {
    function mint(address to, uint256 amount) external;       // gated by MINT_ROLE; bypassed for initCalls
    function updateSupplyCap(uint256 newSupplyCap) external;  // bypassed for initCalls
    function balanceOf(address account) external view returns (uint256);
}

// Used to fetch a collection's launch config at bonding time.
interface IRecomNFTForDecay {
    function launchpad() external view returns (address);
}

interface IRecomLaunchpadForDecay {
    function collectionDecay(address collection) external view returns (uint256);
    function collectionFeeType(address collection) external view returns (uint8);
    function collectionStartMc(address collection) external view returns (uint256);
    function collectionPairUSDC(address collection) external view returns (bool);
}

/**
 * @title B20TokenFactory
 * @notice B20factory's per-collection token deployer. Drop-in replacement for
 *         OriginPad's RecomTokenFactory (identical `deployToken` signature so the
 *         existing RecomNFT bonding flow calls it unchanged), but the token is a
 *         NATIVE B20 ASSET minted via the Base Beryl factory precompile instead of
 *         an EVM ERC-20.
 *
 *         Anti-honeypot design (the whole reason for B20factory):
 *           - token is created ADMIN-LESS (initialAdmin = address(0)): no one can
 *             ever mint more, pause, freeze, or blacklist;
 *           - supply cap is locked to TOTAL_SUPPLY and the full supply is minted at
 *             creation, so it is provably not mintable;
 *           - the pool slice (supply minus vesting) is seeded single-sided into the
 *             V4 pool and left here with no removal path -> locked forever;
 *           - the vesting slice (default 20%) goes to a B20Vesting contract that only
 *             releases on a fixed monthly schedule (no early-release / rug path);
 *           - no transfer tax (B20 is a clean ERC-20); the only fee is the 1%-5%
 *             swap fee charged by B20FeeHook and paid out as ETH to the splitter.
 *         Result: a buy/sell simulator sees a clean, low-tax, non-mintable token.
 */
contract B20TokenFactory is Ownable, ReentrancyGuard, IUnlockCallback {
    using CurrencySettler for Currency;

    // Base Beryl singleton B20 factory precompile (same address on Base + Base Sepolia).
    IB20Factory public constant B20 = IB20Factory(0xB20f000000000000000000000000000000000000);
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1B, fully minted & capped
    uint8 public constant DECIMALS = 18;

    address public platformTreasury;
    address public airdropVault;
    address public kasWallet;

    IPoolManager public immutable poolManager;
    address public immutable feeHook;
    // USDC for the optional USDC-paired pool (0 = ETH-only). Kept for parity; ETH-only in practice.
    address public immutable usdc;
    // OriginSwapRouter (kept for parity; B20FeeSplitter pays ETH so unused). 0 = off.
    address public router;

    uint24 public constant LP_FEE = 0; // no LP fee; all trade fee via hook
    int24 public constant TICK_SPACING = 60;

    // ── Launch DEFAULTS (owner-editable; apply to FUTURE launches only) ──────────
    // Each launched token snapshots these into immutable per-token contracts, so a
    // token's economics are fixed forever once it launches; editing here only
    // changes what NEW launches get. Not surfaced in the UI.
    //
    // Vesting: `vestBps` of supply is reserved and released `vestReleaseBps` of
    // supply per `vestPeriod`, to `vestBeneficiary` (0 = the creator; can be set to
    // a burn address / airdrop wallet / etc by the platform owner before a launch).
    // Default 20% released 1%/30d (=20 periods). vestBps = 0 disables vesting.
    uint256 public vestBps = 2000;          // 20% of supply vested
    uint256 public vestReleaseBps = 100;    // 1% of supply unlocked per period
    uint256 public vestPeriod = 30 days;    // period length (editable, e.g. 1-2 days)
    address public vestBeneficiary;         // 0 = creator

    // Swap-fee split: creator gets `creatorFeeBps` out of 100, platform the rest.
    uint256 public creatorFeeBps = 55;      // creator 55% / platform 45%
    // M-2: hard floor so the platform owner can never set a future launch's creator
    // share below this. Guarantees creators always keep the majority of swap fees.
    uint256 public constant MIN_CREATOR_FEE_BPS = 50;

    // Dynamic-fee ceiling (bps) the per-pool fee can ramp up to with volatility. The
    // launcher's chosen fee is the BASE; this is the MAX. Owner-editable for future
    // launches (immutable per token once launched). Default 5%.
    uint256 public dynamicMaxFeeBps = 500;

    // OWNER-ONLY direct distribution. When the platform owner launches their OWN token
    // and this list is set, the reserved slice is minted DIRECTLY to these addresses at
    // launch (instant, no vesting) - e.g. spread across N team/treasury wallets. Each
    // distBps[i] is that address's share of TOTAL_SUPPLY in bps. Empty (or a non-owner
    // launcher) => the public monthly-vesting default applies instead.
    address[] public distRecipients;
    uint256[] public distBps;
    uint256 public constant MAX_DIST_RECIPIENTS = 50;

    event LaunchDefaultsUpdated(uint256 vestBps, uint256 vestReleaseBps, uint256 vestPeriod, address indexed vestBeneficiary, uint256 creatorFeeBps);
    event Vesting(address indexed token, address vesting, address beneficiary, uint256 amount);
    event DistributionSet(uint256 count, uint256 totalBps);

    mapping(address => address) public collectionToToken;
    mapping(address => address) public tokenToCollection;
    mapping(address => address) public tokenToSplitter;
    mapping(address => address) public tokenToVesting;
    address[] public allTokens;
    mapping(address => uint256) public nonces; // creator -> direct launch count
    // L-2: stored seed params so a poolless direct launch can be re-seeded later.
    mapping(address => uint256) public tokenToBaseFee;
    mapping(address => uint256) public tokenToMaxFee;
    mapping(address => uint256) public tokenToStartMc; // >0 marks a direct (ETH-pair) launch

    event TokenDeployed(address indexed collection, address indexed token, address creator, string name, string symbol);
    event PoolCreated(address indexed token, address splitter, uint256 ethAmount, uint256 tokenAmount);

    constructor(
        address _platformTreasury,
        address _airdropVault,
        address _kasWallet,
        address _poolManager,
        address _feeHook,
        address _usdc
    ) Ownable(msg.sender) {
        platformTreasury = _platformTreasury;
        airdropVault = _airdropVault;
        kasWallet = _kasWallet;
        poolManager = IPoolManager(_poolManager);
        feeHook = _feeHook;
        usdc = _usdc;
    }

    receive() external payable {}

    function deployToken(
        address collection,
        address creator,
        string calldata name,
        string calldata symbol,
        string calldata, /* imageURI  - stored off-chain by profileapi, not on the native token */
        string calldata, /* bio */
        string calldata, /* socialX */
        string calldata, /* socialGithub */
        string calldata, /* socialFarcaster */
        uint256 feeBps
    ) external payable nonReentrant returns (address tokenAddress) {
        // Only the collection itself can deploy its own token, so an attacker can't
        // pre-register a token and brick the collection's bonding completion.
        require(msg.sender == collection, "Caller not collection");
        require(collectionToToken[collection] == address(0), "Token already deployed");

        // ── Deploy the native B20 ASSET ──────────────────────────────────────────
        // Deterministic salt per collection. Address derived from (ASSET, this, salt).
        // Predict the token address up front so the vesting/recipient mints can target
        // the right address inside createB20's bootstrap window.
        bytes32 salt = keccak256(abi.encode(collection, address(this)));
        tokenAddress = B20.getB20Address(IB20Factory.B20Variant.ASSET, address(this), salt);

        // Decide the non-pool allocation of supply:
        //   - OWNER launches with a configured recipient list -> mint the slice DIRECTLY
        //     to those addresses at launch (instant, no vesting). For the platform's own
        //     launches (team/treasury/distribution to N wallets).
        //   - everyone else (public creators) -> the default monthly vesting to creator.
        bool ownerDirect = (creator == owner()) && distRecipients.length > 0;

        address vesting = address(0);
        uint256 allocAmount; // total supply minted outside the single-sided pool
        bytes[] memory initCalls;

        if (ownerDirect) {
            uint256 nr = distRecipients.length;
            initCalls = new bytes[](2 + nr);
            for (uint256 i = 0; i < nr; i++) {
                uint256 amt = (TOTAL_SUPPLY * distBps[i]) / 10000;
                allocAmount += amt;
                initCalls[2 + i] = abi.encodeWithSelector(IB20Token.mint.selector, distRecipients[i], amt);
            }
        } else if (vestBps > 0) {
            allocAmount = (TOTAL_SUPPLY * vestBps) / 10000;
            // H-1: a public creator ALWAYS vests to themselves. `vestBeneficiary` can
            // only redirect the OWNER's own launches (burn/airdrop wallet); it can never
            // divert another creator's vested slice.
            address beneficiary = (creator == owner() && vestBeneficiary != address(0)) ? vestBeneficiary : creator;
            uint256 releaseAmount = (TOTAL_SUPPLY * vestReleaseBps) / 10000;
            vesting = address(new B20Vesting(tokenAddress, beneficiary, allocAmount, releaseAmount, vestPeriod));
            emit Vesting(tokenAddress, vesting, beneficiary, allocAmount);
            initCalls = new bytes[](3);
            initCalls[2] = abi.encodeWithSelector(IB20Token.mint.selector, vesting, allocAmount);
        } else {
            initCalls = new bytes[](2);
        }
        uint256 poolAmount = TOTAL_SUPPLY - allocAmount;

        bytes memory params = abi.encode(IB20Factory.B20AssetCreateParams({
            version: 1,
            name: name,
            symbol: symbol,
            initialAdmin: address(0), // admin-less: not mintable/pausable/freezable
            decimals: DECIMALS
        }));
        // initCalls run factory-originated inside the bootstrap window, bypassing
        // MINT_ROLE: lock the cap, mint the pool slice here, then the allocation mints
        // (set above: either the recipient list or the vesting contract).
        initCalls[0] = abi.encodeWithSelector(IB20Token.updateSupplyCap.selector, TOTAL_SUPPLY);
        initCalls[1] = abi.encodeWithSelector(IB20Token.mint.selector, address(this), poolAmount);
        // createB20 is nonpayable (reverts on value); never forward bonding ETH to it.
        address created = B20.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);
        require(created == tokenAddress, "addr mismatch");

        // Collection/bonding path defaults the creator fee delivery to ETH (0).
        B20FeeSplitter splitter = new B20FeeSplitter(creator, platformTreasury, creatorFeeBps, tokenAddress, router, feeHook, 0);

        collectionToToken[collection] = tokenAddress;
        tokenToCollection[tokenAddress] = collection;
        tokenToSplitter[tokenAddress] = address(splitter);
        tokenToVesting[tokenAddress] = vesting;
        allTokens.push(tokenAddress);

        emit TokenDeployed(collection, tokenAddress, creator, name, symbol);

        // Seed the pool single-sided with the pool slice held here (supply minus the
        // vesting slice). Best-effort (self-call try/catch) so a pool failure never
        // bricks bonding. Any bonding ETH forwarded is returned to the collection as
        // the creator's mint revenue.
        try this.seedPoolExternal(collection, tokenAddress, address(splitter), feeBps) {} catch {}
        if (msg.value > 0) {
            (bool ok, ) = payable(msg.sender).call{value: msg.value}("");
            require(ok, "refund failed");
        }
        emit PoolCreated(tokenAddress, address(splitter), 0, IB20Token(tokenAddress).balanceOf(address(this)));
    }

    /// @dev Best-effort single-sided pool seeding, called by `this` so failures
    ///      can be caught without bricking bonding. Self-call only.
    function seedPoolExternal(address collection, address tokenAddr, address splitter, uint256 feeBps) external {
        require(msg.sender == address(this), "self only");
        _createPool(collection, tokenAddr, splitter, feeBps);
    }

    function _createPool(address collection, address tokenAddr, address splitter, uint256 feeBps) internal {
        // The launch's (now-unused) decaySeconds field is repurposed to carry the
        // per-launch MAX fee bps, so a launcher can set both base and max (e.g. base
        // 1% / max 2%, or base == max for a flat fee). 0 => owner default ceiling.
        (uint256 launchMax, , uint256 startMc, bool pairUSDC) = _collectionConfig(collection);
        uint256 tokenAmount = IB20Token(tokenAddr).balanceOf(address(this)); // full supply held here
        uint256 fdvSupply = TOTAL_SUPPLY;                                    // FDV uses full supply

        // Quote currency: USDC if requested AND configured, else native ETH.
        address quote = (pairUSDC && usdc != address(0)) ? usdc : address(0);
        // Sensible default starting MC if the creator left it unset (quote raw units).
        if (startMc == 0) startMc = (quote == address(0)) ? 3 ether : uint256(10_000) * 1e6;

        // Sort currencies (currency0 < currency1). Native ETH (0x0) is always currency0.
        bool tokenIsCurrency0;
        Currency c0;
        Currency c1;
        if (quote == address(0)) {
            c0 = Currency.wrap(address(0));
            c1 = Currency.wrap(tokenAddr);
            tokenIsCurrency0 = false;
        } else if (tokenAddr < quote) {
            c0 = Currency.wrap(tokenAddr);
            c1 = Currency.wrap(quote);
            tokenIsCurrency0 = true;
        } else {
            c0 = Currency.wrap(quote);
            c1 = Currency.wrap(tokenAddr);
            tokenIsCurrency0 = false;
        }

        PoolKey memory key = PoolKey({
            currency0: c0, currency1: c1, fee: LP_FEE, tickSpacing: TICK_SPACING, hooks: IHooks(feeHook)
        });

        // Starting price = startMc(quote raw) over full supply (token raw).
        uint160 sp = tokenIsCurrency0
            ? _calcSqrtPriceX96(fdvSupply, startMc)
            : _calcSqrtPriceX96(startMc, fdvSupply);
        int24 boundary = _clampTick(_floorTick(TickMath.getTickAtSqrtPrice(sp)));
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(boundary);

        // The launcher's fee is the BASE (resting) fee; clamp into the hook band
        // [1%, 5%] (default 3%). The MAX is the dynamic ceiling the fee ramps to with
        // volatility. base <= max <= 5%. base == max => flat fee. Clamped so the hook's
        // registerPool never reverts (which would leave the token poolless).
        if (feeBps < 100 || feeBps > 500) feeBps = 300;
        // Per-launch max (via launchMax); 0 => owner default. base == max => flat fee.
        uint256 maxBps = launchMax == 0 ? dynamicMaxFeeBps : launchMax;
        if (maxBps > 500) maxBps = 500;
        if (maxBps < feeBps) maxBps = feeBps;

        poolManager.initialize(key, sqrtPriceX96);
        IB20FeeHook(feeHook).registerPool(key, splitter, feeBps, maxBps);

        poolManager.unlock(abi.encode(key, boundary, tokenAmount, tokenIsCurrency0));
    }

    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "not pool manager");
        (PoolKey memory key, int24 boundary, uint256 tokenAmount, bool tokenIsCurrency0) =
            abi.decode(data, (PoolKey, int24, uint256, bool));

        int24 minTick = (TickMath.MIN_TICK / TICK_SPACING) * TICK_SPACING;
        int24 maxTick = (TickMath.MAX_TICK / TICK_SPACING) * TICK_SPACING;
        uint160 curSqrt = TickMath.getSqrtPriceAtTick(boundary);

        // Concentrate the token in a bounded band (~1000x price span) next to the
        // start price so liquidity stays dense and early buys trade immediately.
        int24 BAND = 69000;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0;
        uint256 amount1;
        if (tokenIsCurrency0) {
            tickLower = boundary;
            tickUpper = boundary + BAND;
            if (tickUpper > maxTick) tickUpper = maxTick;
            amount0 = tokenAmount;
        } else {
            tickUpper = boundary;
            tickLower = boundary - BAND;
            if (tickLower < minTick) tickLower = minTick;
            amount1 = tokenAmount;
        }

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            curSqrt,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );

        (BalanceDelta delta, ) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        if (delta.amount0() < 0) {
            key.currency0.settle(poolManager, address(this), uint256(uint128(-delta.amount0())), false);
        }
        if (delta.amount1() < 0) {
            key.currency1.settle(poolManager, address(this), uint256(uint128(-delta.amount1())), false);
        }
        // Position stays owned by this factory with no removal path => locked forever
        return "";
    }

    function _floorTick(int24 t) internal pure returns (int24 r) {
        r = (t / TICK_SPACING) * TICK_SPACING;
        if (t < 0 && r != t) r -= TICK_SPACING;
    }

    function _calcSqrtPriceX96(uint256 amount0, uint256 amount1) internal pure returns (uint160) {
        uint256 sqrtA0 = _sqrt(amount0);
        uint256 sqrtA1 = _sqrt(amount1);
        return uint160((sqrtA1 * (2 ** 96)) / sqrtA0);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x >> 1) + 1;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) >> 1;
        }
    }

    // ─── Admin / views ──────────────────────────────────────────────────────────
    function updateAddresses(address _treasury, address _vault, address _kas) external onlyOwner {
        platformTreasury = _treasury;
        airdropVault = _vault;
        kasWallet = _kas;
    }

    function setRouter(address _router) external onlyOwner {
        router = _router;
    }

    /// @notice Edit the vesting DEFAULTS for FUTURE launches. Already-launched tokens
    ///         keep their immutable schedule. Set `_vestBps = 0` to disable vesting.
    /// @param _vestBeneficiary 0 = the creator; otherwise a fixed address (burn / airdrop / etc).
    function setVesting(uint256 _vestBps, uint256 _vestReleaseBps, uint256 _vestPeriod, address _vestBeneficiary)
        external onlyOwner
    {
        require(_vestBps <= 10000, "vestBps>100%");
        if (_vestBps > 0) {
            require(_vestReleaseBps > 0 && _vestReleaseBps <= _vestBps, "bad release");
            require(_vestPeriod > 0, "bad period");
        }
        vestBps = _vestBps;
        vestReleaseBps = _vestReleaseBps;
        vestPeriod = _vestPeriod;
        vestBeneficiary = _vestBeneficiary;
        emit LaunchDefaultsUpdated(_vestBps, _vestReleaseBps, _vestPeriod, _vestBeneficiary, creatorFeeBps);
    }

    /// @notice Edit the creator/platform swap-fee split for FUTURE launches.
    ///         creator gets `_creatorFeeBps` of 100, platform the rest.
    function setCreatorFeeBps(uint256 _creatorFeeBps) external onlyOwner {
        require(_creatorFeeBps >= MIN_CREATOR_FEE_BPS && _creatorFeeBps <= 100, "out of range");
        creatorFeeBps = _creatorFeeBps;
        emit LaunchDefaultsUpdated(vestBps, vestReleaseBps, vestPeriod, vestBeneficiary, _creatorFeeBps);
    }

    /// @notice Edit the dynamic-fee ceiling (max bps the fee ramps to) for FUTURE
    ///         launches. Must be within [1%, 5%]. The launcher still picks the base fee.
    function setDynamicMaxFeeBps(uint256 _maxBps) external onlyOwner {
        require(_maxBps >= 100 && _maxBps <= 500, "max out of range");
        dynamicMaxFeeBps = _maxBps;
    }

    /// @notice OWNER-ONLY: set the direct-distribution recipient list used when the
    ///         platform owner launches their own token (slice minted straight to these
    ///         addresses at launch, no vesting). Pass empty arrays to clear it so public
    ///         launches resume the monthly vesting default. `bps[i]` = share of TOTAL_SUPPLY.
    function setDistribution(address[] calldata recipients, uint256[] calldata bps) external onlyOwner {
        require(recipients.length == bps.length, "length mismatch");
        require(recipients.length <= MAX_DIST_RECIPIENTS, "too many recipients");
        uint256 sum;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "zero recipient");
            require(bps[i] > 0, "zero bps");
            sum += bps[i];
        }
        require(sum <= 10000, "total>100%");
        delete distRecipients;
        delete distBps;
        for (uint256 i = 0; i < recipients.length; i++) {
            distRecipients.push(recipients[i]);
            distBps.push(bps[i]);
        }
        emit DistributionSet(recipients.length, sum);
    }

    function distRecipientsLength() external view returns (uint256) { return distRecipients.length; }

    function _collectionConfig(address collection)
        internal view returns (uint256 dec, uint8 feeType, uint256 startMc, bool pairUSDC)
    {
        try IRecomNFTForDecay(collection).launchpad() returns (address lp) {
            if (lp != address(0)) {
                try IRecomLaunchpadForDecay(lp).collectionDecay(collection) returns (uint256 d) { dec = d; } catch {}
                try IRecomLaunchpadForDecay(lp).collectionFeeType(collection) returns (uint8 f) { feeType = f; } catch {}
                try IRecomLaunchpadForDecay(lp).collectionStartMc(collection) returns (uint256 m) { startMc = m; } catch {}
                try IRecomLaunchpadForDecay(lp).collectionPairUSDC(collection) returns (bool u) { pairUSDC = u; } catch {}
            }
        } catch {}
    }

    // ─── Direct launch (no NFT bonding) ──────────────────────────────────────────

    /**
     * @notice Deploy a B20 token directly — no NFT collection required.
     *         One transaction from the creator's wallet. Same token quality as the
     *         bonding path: admin-less, supply capped, 80% pool, 20% vested.
     */
    function launch(
        string calldata name,
        string calldata symbol,
        uint256 baseFeeBps,
        uint256 maxFeeBps,
        uint256 startMcWei,
        uint8 feeReceiveType
    ) external nonReentrant returns (address tokenAddress) {
        require(bytes(name).length > 0, "name required");
        require(bytes(symbol).length > 0, "symbol required");
        if (feeReceiveType > 2) feeReceiveType = 0; // 0=ETH 1=TOKEN 2=BOTH
        address creator = msg.sender;

        // Synthetic unique ID used as registry key (never a real contract).
        address synId = address(uint160(uint256(keccak256(abi.encode(creator, nonces[creator]++, address(this))))));
        require(collectionToToken[synId] == address(0), "id collision");

        bytes32 salt = keccak256(abi.encode(synId, address(this)));
        tokenAddress = B20.getB20Address(IB20Factory.B20Variant.ASSET, address(this), salt);

        bool ownerDirect = (creator == owner()) && distRecipients.length > 0;
        address vesting = address(0);
        uint256 allocAmount;
        bytes[] memory initCalls;

        if (ownerDirect) {
            uint256 nr = distRecipients.length;
            initCalls = new bytes[](2 + nr);
            for (uint256 i = 0; i < nr; i++) {
                uint256 amt = (TOTAL_SUPPLY * distBps[i]) / 10000;
                allocAmount += amt;
                initCalls[2 + i] = abi.encodeWithSelector(IB20Token.mint.selector, distRecipients[i], amt);
            }
        } else if (vestBps > 0) {
            allocAmount = (TOTAL_SUPPLY * vestBps) / 10000;
            // H-1: a public creator ALWAYS vests to themselves. `vestBeneficiary` can
            // only redirect the OWNER's own launches (burn/airdrop wallet); it can never
            // divert another creator's vested slice.
            address beneficiary = (creator == owner() && vestBeneficiary != address(0)) ? vestBeneficiary : creator;
            uint256 releaseAmount = (TOTAL_SUPPLY * vestReleaseBps) / 10000;
            vesting = address(new B20Vesting(tokenAddress, beneficiary, allocAmount, releaseAmount, vestPeriod));
            emit Vesting(tokenAddress, vesting, beneficiary, allocAmount);
            initCalls = new bytes[](3);
            initCalls[2] = abi.encodeWithSelector(IB20Token.mint.selector, vesting, allocAmount);
        } else {
            initCalls = new bytes[](2);
        }
        uint256 poolAmount = TOTAL_SUPPLY - allocAmount;

        bytes memory params = abi.encode(IB20Factory.B20AssetCreateParams({
            version: 1, name: name, symbol: symbol,
            initialAdmin: address(0), decimals: DECIMALS
        }));
        initCalls[0] = abi.encodeWithSelector(IB20Token.updateSupplyCap.selector, TOTAL_SUPPLY);
        initCalls[1] = abi.encodeWithSelector(IB20Token.mint.selector, address(this), poolAmount);
        address created = B20.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);
        require(created == tokenAddress, "addr mismatch");

        B20FeeSplitter splitter = new B20FeeSplitter(creator, platformTreasury, creatorFeeBps, tokenAddress, router, feeHook, feeReceiveType);

        collectionToToken[synId] = tokenAddress;
        tokenToCollection[tokenAddress] = synId;
        tokenToSplitter[tokenAddress] = address(splitter);
        tokenToVesting[tokenAddress] = vesting;
        allTokens.push(tokenAddress);

        emit TokenDeployed(synId, tokenAddress, creator, name, symbol);

        // Clamp fees.
        if (baseFeeBps < 100 || baseFeeBps > 500) baseFeeBps = 300;
        if (maxFeeBps > 500) maxFeeBps = 500;
        if (maxFeeBps < baseFeeBps) maxFeeBps = baseFeeBps;
        if (startMcWei == 0) startMcWei = 3 ether;

        // L-2: remember the seed params so a failed seeding can be retried.
        tokenToBaseFee[tokenAddress] = baseFeeBps;
        tokenToMaxFee[tokenAddress] = maxFeeBps;
        tokenToStartMc[tokenAddress] = startMcWei;

        try this.seedPoolDirect(tokenAddress, address(splitter), baseFeeBps, maxFeeBps, startMcWei) {} catch {}

        emit PoolCreated(tokenAddress, address(splitter), 0, IB20Token(tokenAddress).balanceOf(address(this)));
    }

    /// @notice Re-attempt single-sided seeding for a direct-launch token whose initial
    ///         seeding failed and left the pool slice stranded in this factory.
    ///         Permissionless + idempotent: only does anything while the factory still
    ///         holds the slice (pool was never seeded). Recovers a poolless launch.
    function retrySeed(address token) external nonReentrant {
        address splitter = tokenToSplitter[token];
        require(splitter != address(0), "unknown token");
        require(tokenToStartMc[token] > 0, "not a direct launch");
        require(IB20Token(token).balanceOf(address(this)) > 0, "already seeded");
        this.seedPoolDirect(token, splitter, tokenToBaseFee[token], tokenToMaxFee[token], tokenToStartMc[token]);
    }

    /// @dev Pool seeding for direct launches (no collection config lookup).
    function seedPoolDirect(
        address tokenAddr,
        address splitter,
        uint256 baseFeeBps,
        uint256 maxFeeBps,
        uint256 startMcWei
    ) external {
        require(msg.sender == address(this), "self only");

        uint256 tokenAmount = IB20Token(tokenAddr).balanceOf(address(this));

        // Native ETH pair only (USDC skipped for simplicity).
        Currency c0 = Currency.wrap(address(0));
        Currency c1 = Currency.wrap(tokenAddr);

        PoolKey memory key = PoolKey({
            currency0: c0, currency1: c1, fee: LP_FEE, tickSpacing: TICK_SPACING, hooks: IHooks(feeHook)
        });

        // L-3: clamp the starting MC to a sane band so the derived price can never
        // fall outside TickMath's valid range and revert the whole launch.
        if (startMcWei < 1e14) startMcWei = 1e14;       // ~0.0001 ETH floor
        if (startMcWei > 1e30) startMcWei = 1e30;       // generous ceiling

        uint160 sp = _calcSqrtPriceX96(startMcWei, TOTAL_SUPPLY);
        int24 boundary = _floorTick(TickMath.getTickAtSqrtPrice(sp));
        boundary = _clampTick(boundary);
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(boundary);

        poolManager.initialize(key, sqrtPriceX96);
        IB20FeeHook(feeHook).registerPool(key, splitter, baseFeeBps, maxFeeBps);

        poolManager.unlock(abi.encode(key, boundary, tokenAmount, false));
    }

    /// @dev Clamp a tick into the usable (tick-spacing aligned) range so
    ///      getSqrtPriceAtTick never reverts on an out-of-range boundary.
    function _clampTick(int24 t) internal pure returns (int24) {
        int24 minU = (TickMath.MIN_TICK / TICK_SPACING) * TICK_SPACING;
        int24 maxU = (TickMath.MAX_TICK / TICK_SPACING) * TICK_SPACING;
        if (t < minU) return minU;
        if (t > maxU) return maxU;
        return t;
    }

    function getAllTokens() external view returns (address[] memory) { return allTokens; }
    function getTokenCount() external view returns (uint256) { return allTokens.length; }
}
