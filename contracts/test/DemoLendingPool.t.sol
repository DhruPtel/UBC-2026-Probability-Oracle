// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OddsFeed} from "../src/OddsFeed.sol";
import {RiskSwitch} from "../src/RiskSwitch.sol";
import {DemoLendingPool} from "../src/DemoLendingPool.sol";

contract DemoLendingPoolTest is Test {
    OddsFeed feed;
    RiskSwitch risk;
    DemoLendingPool pool;
    string constant SYMBOL = "test:btc-above";

    event LoanRecorded(address indexed borrower, uint256 collateralUsd, uint256 loanUsd, uint8 level);

    function setUp() public {
        feed = new OddsFeed();
        risk = new RiskSwitch(address(feed));
        pool = new DemoLendingPool(address(risk), SYMBOL, 1); // NO hurts, like the BTC market
    }

    function publishAndSync(uint16 yesBps) internal {
        feed.publish(SYMBOL, yesBps, 1_799_999_990, bytes32(0));
        risk.sync(address(pool));
    }

    function test_ConstructorOptsIn() public view {
        assertEq(risk.tiersOf(address(pool)).length, 4);
        (string memory symbol, uint8 side,,,) = risk.configs(address(pool));
        assertEq(symbol, SYMBOL);
        assertEq(side, 1);
    }

    function test_NormalLevelAllows75Percent() public {
        publishAndSync(8000); // harm 20% → level 0
        (bool ok, uint256 max, string memory reason) = pool.canBorrow(100, 75);
        assertTrue(ok);
        assertEq(max, 75);
        assertEq(reason, "within the limit");
        (ok,,) = pool.canBorrow(100, 76);
        assertFalse(ok);
    }

    function test_LimitFollowsTheOdds() public {
        publishAndSync(4000); // harm 60% → level 1, 60%
        (bool ok, uint256 max,) = pool.canBorrow(100, 60);
        assertTrue(ok);
        assertEq(max, 60);
        (ok,,) = pool.canBorrow(100, 61);
        assertFalse(ok);

        publishAndSync(2750); // harm 72.5% → level 2, 40%
        (ok, max,) = pool.canBorrow(100, 40);
        assertTrue(ok);
        assertEq(max, 40);
        string memory reason;
        (ok,, reason) = pool.canBorrow(100, 41);
        assertFalse(ok);
        assertEq(reason, "the loan is above the limit");
    }

    function test_PausedAllowsNothing() public {
        publishAndSync(1000); // harm 90% → level 3, paused
        (bool ok, uint256 max, string memory reason) = pool.canBorrow(100, 1);
        assertFalse(ok);
        assertEq(max, 0);
        assertEq(reason, "borrowing is paused");
        vm.expectRevert("borrowing is paused");
        pool.borrow(100, 1);
    }

    function test_BorrowRecordsASimulatedLoan() public {
        publishAndSync(4000); // level 1
        vm.expectEmit(true, false, false, true);
        emit LoanRecorded(address(this), 100, 60, 1);
        pool.borrow(100, 60);
        assertEq(pool.loans(), 1);

        vm.expectRevert("the loan is above the limit");
        pool.borrow(100, 61);
    }
}
