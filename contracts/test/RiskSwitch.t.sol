// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OddsFeed} from "../src/OddsFeed.sol";
import {RiskSwitch} from "../src/RiskSwitch.sol";

contract RiskSwitchTest is Test {
    OddsFeed feed;
    RiskSwitch risk;
    string constant SYMBOL = "test:demo";

    event RiskLevelChanged(address indexed protocol, string symbol, uint8 oldLevel, uint8 newLevel, uint16 harmBps);

    function setUp() public {
        feed = new OddsFeed();
        risk = new RiskSwitch(address(feed));
        vm.warp(1_800_000_000);
    }

    function tiers() internal pure returns (RiskSwitch.Tier[] memory t) {
        t = new RiskSwitch.Tier[](4);
        t[0] = RiskSwitch.Tier(0, 7500, false);
        t[1] = RiskSwitch.Tier(5000, 6000, false);
        t[2] = RiskSwitch.Tier(7000, 4000, false);
        t[3] = RiskSwitch.Tier(8500, 0, true);
    }

    // This test contract plays the protocol: it opts in and is synced.
    function optIn(uint8 side) internal {
        risk.optIn(SYMBOL, side, tiers());
    }

    function levelAt(uint16 yesBps) internal returns (uint8 level) {
        feed.publish(SYMBOL, yesBps, 1_799_999_990, bytes32(0));
        risk.sync(address(this));
        (level,,,,) = risk.paramsOf(address(this));
    }

    function test_OptInStoresTheTiers() public {
        optIn(0);
        RiskSwitch.Tier[] memory stored = risk.tiersOf(address(this));
        assertEq(stored.length, 4);
        assertEq(stored[2].thresholdBps, 7000);
        assertEq(stored[2].maxLtvBps, 4000);
        assertTrue(stored[3].paused);
        (string memory symbol, uint8 side, uint8 level,, uint64 syncedAt) = risk.configs(address(this));
        assertEq(symbol, SYMBOL);
        assertEq(side, 0);
        assertEq(level, 0);
        assertEq(syncedAt, 0);
    }

    function test_OptInRejectsBadTiers() public {
        RiskSwitch.Tier[] memory t = tiers();
        t[0].thresholdBps = 100;
        vm.expectRevert("tier 0 must start at 0");
        risk.optIn(SYMBOL, 0, t);

        t = tiers();
        t[2].thresholdBps = 5000; // not above tier 1
        vm.expectRevert("thresholds must rise");
        risk.optIn(SYMBOL, 0, t);
    }

    function test_SyncPicksTheTierOnEachSideOfEveryThreshold() public {
        optIn(0);
        assertEq(levelAt(4999), 0);
        assertEq(levelAt(5000), 1);
        assertEq(levelAt(6999), 1);
        assertEq(levelAt(7000), 2);
        assertEq(levelAt(8499), 2);
        assertEq(levelAt(8500), 3);

        (uint8 level, uint16 maxLtvBps, bool paused, uint16 harmBps, uint64 syncedAt) = risk.paramsOf(address(this));
        assertEq(level, 3);
        assertEq(maxLtvBps, 0);
        assertTrue(paused);
        assertEq(harmBps, 8500);
        assertEq(syncedAt, 1_800_000_000);
    }

    function test_NoSideFlipsTheProbability() public {
        optIn(1);
        assertEq(levelAt(3300), 1); // YES 33% → harm 67%
        (,,, uint16 harmBps,) = risk.paramsOf(address(this));
        assertEq(harmBps, 6700);
        assertEq(levelAt(2750), 2); // YES 27.5% → harm 72.5%
    }

    function test_EventOnlyWhenTheLevelChanges() public {
        optIn(0);
        feed.publish(SYMBOL, 5500, 1_799_999_990, bytes32(0));
        vm.expectEmit(true, false, false, true);
        emit RiskLevelChanged(address(this), SYMBOL, 0, 1, 5500);
        risk.sync(address(this));

        // Same level again (55% → 60%): harm and syncedAt update, but no event.
        feed.publish(SYMBOL, 6000, 1_799_999_990, bytes32(0));
        vm.warp(1_800_000_100);
        vm.recordLogs();
        risk.sync(address(this));
        assertEq(vm.getRecordedLogs().length, 0);
        (uint8 level,,, uint16 harmBps, uint64 syncedAt) = risk.paramsOf(address(this));
        assertEq(level, 1);
        assertEq(harmBps, 6000);
        assertEq(syncedAt, 1_800_000_100);
    }

    function test_SyncRevertsWhenNeverPublished() public {
        optIn(1);
        vm.expectRevert("market never published");
        risk.sync(address(this));
    }

    function test_SyncRevertsWhenNotOptedIn() public {
        vm.expectRevert("not opted in");
        risk.sync(address(this));
    }
}
