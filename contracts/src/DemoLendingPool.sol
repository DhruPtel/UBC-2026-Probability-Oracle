// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RiskSwitch} from "./RiskSwitch.sol";

/// DEMO: no real deposits. This pool holds no tokens and lends nothing; it only records
/// simulated loans. It exists to show a protocol whose loan limit follows prediction-market
/// odds through the RiskSwitch.
contract DemoLendingPool {
    RiskSwitch public immutable riskSwitch;
    string public symbol;

    /// DEMO: a count of simulated loans. No tokens move.
    uint256 public loans;

    /// DEMO: a simulated loan was recorded. No tokens moved.
    event LoanRecorded(address indexed borrower, uint256 collateralUsd, uint256 loanUsd, uint8 level);

    /// Opts into the RiskSwitch with four tiers:
    /// normal = loans up to 75% of collateral; harm 50%+ = 60%; harm 70%+ = 40%; harm 85%+ = paused.
    constructor(address riskSwitch_, string memory symbol_, uint8 harmfulSide) {
        riskSwitch = RiskSwitch(riskSwitch_);
        symbol = symbol_;

        RiskSwitch.Tier[] memory tiers = new RiskSwitch.Tier[](4);
        tiers[0] = RiskSwitch.Tier(0, 7500, false);
        tiers[1] = RiskSwitch.Tier(5000, 6000, false);
        tiers[2] = RiskSwitch.Tier(7000, 4000, false);
        tiers[3] = RiskSwitch.Tier(8500, 0, true);
        riskSwitch.optIn(symbol_, harmfulSide, tiers);
    }

    /// DEMO: would a loan of `loanUsd` against `collateralUsd` be allowed right now?
    /// Uses the limits from the RiskSwitch's last sync.
    function canBorrow(uint256 collateralUsd, uint256 loanUsd)
        public
        view
        returns (bool ok, uint256 maxLoanUsd, string memory reason)
    {
        (, uint16 maxLtvBps, bool paused,,) = riskSwitch.paramsOf(address(this));
        if (paused) return (false, 0, "borrowing is paused");
        maxLoanUsd = (collateralUsd * maxLtvBps) / 10000;
        if (loanUsd > maxLoanUsd) return (false, maxLoanUsd, "the loan is above the limit");
        return (true, maxLoanUsd, "within the limit");
    }

    /// DEMO: no real deposits. Records a simulated loan if canBorrow allows it.
    function borrow(uint256 collateralUsd, uint256 loanUsd) external {
        (bool ok,, string memory reason) = canBorrow(collateralUsd, loanUsd);
        require(ok, reason);
        loans++;
        (uint8 level,,,,) = riskSwitch.paramsOf(address(this));
        emit LoanRecorded(msg.sender, collateralUsd, loanUsd, level);
    }
}
