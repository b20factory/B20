// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IB20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title B20Vesting
 * @notice One per launched token. Holds a reserved slice of supply (default 20%)
 *         and releases it to a beneficiary on a fixed schedule: `releasePerPeriod`
 *         tokens unlock every `periodSeconds`, until `totalAmount` is fully vested.
 *         The beneficiary claims the accrued-but-unclaimed amount any time.
 * @dev All parameters are IMMUTABLE: once a token launches, its vesting schedule is
 *      locked forever and cannot be edited. The platform only edits DEFAULTS for
 *      future launches (in B20TokenFactory). The beneficiary is usually the creator,
 *      but the factory owner can point it at a burn address / airdrop wallet / etc.
 *      No admin, no early-release, no rug path: tokens can only leave on schedule.
 */
contract B20Vesting is ReentrancyGuard {
    address public immutable token;
    address public immutable beneficiary;
    uint256 public immutable totalAmount;      // total to vest (e.g. 20% of supply)
    uint256 public immutable releasePerPeriod; // unlocked each period (e.g. 1% of supply)
    uint256 public immutable periodSeconds;    // period length (e.g. 30 days)
    uint256 public immutable startTime;
    uint256 public claimed;

    event Claimed(address indexed beneficiary, uint256 amount);

    constructor(
        address _token,
        address _beneficiary,
        uint256 _totalAmount,
        uint256 _releasePerPeriod,
        uint256 _periodSeconds
    ) {
        require(_token != address(0) && _beneficiary != address(0), "zero addr");
        require(_totalAmount > 0 && _releasePerPeriod > 0 && _periodSeconds > 0, "bad schedule");
        token = _token;
        beneficiary = _beneficiary;
        totalAmount = _totalAmount;
        releasePerPeriod = _releasePerPeriod;
        periodSeconds = _periodSeconds;
        startTime = block.timestamp;
    }

    /// @notice Cumulative amount unlocked so far (capped at totalAmount). The first
    ///         period unlocks after one full `periodSeconds` (no day-0 cliff bypass).
    function vested() public view returns (uint256) {
        uint256 periods = (block.timestamp - startTime) / periodSeconds;
        uint256 v = periods * releasePerPeriod;
        return v > totalAmount ? totalAmount : v;
    }

    /// @notice Unlocked but not-yet-claimed amount.
    function claimable() public view returns (uint256) {
        return vested() - claimed;
    }

    /// @notice Claim all currently-unlocked tokens to the beneficiary. Permissionless
    ///         (funds can only ever go to the immutable beneficiary).
    function claim() external nonReentrant {
        uint256 amount = claimable();
        require(amount > 0, "nothing to claim");
        claimed += amount;
        require(IB20Min(token).transfer(beneficiary, amount), "transfer failed");
        emit Claimed(beneficiary, amount);
    }
}
