// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OddsFeed} from "../src/OddsFeed.sol";

contract OddsFeedTest is Test {
    OddsFeed feed;
    string constant SYMBOL = "test:demo";
    bytes32 constant HASH = keccak256("snapshot");

    event OddsUpdated(
        bytes32 indexed marketId,
        string symbol,
        uint16 probBps,
        uint16 prevProbBps,
        uint64 observedAt,
        bytes32 sourceHash,
        uint32 round,
        address indexed publisher
    );

    function setUp() public {
        feed = new OddsFeed();
        vm.warp(1_800_000_000);
    }

    // (a) publish, then latest returns the same values
    function test_PublishThenLatest() public {
        feed.publish(SYMBOL, 4200, 1_799_999_990, HASH);

        OddsFeed.Odds memory o = feed.latest(feed.idOf(SYMBOL));
        assertEq(o.probBps, 4200);
        assertEq(o.observedAt, 1_799_999_990);
        assertEq(o.publishedAt, block.timestamp);
        assertEq(o.sourceHash, HASH);
        assertEq(o.round, 1);
    }

    // (b) a second publish is round 2, and its event carries the first value
    function test_SecondPublishEmitsPrevious() public {
        feed.publish(SYMBOL, 4200, 1_799_999_990, HASH);

        vm.expectEmit(true, true, false, true, address(feed));
        emit OddsUpdated(feed.idOf(SYMBOL), SYMBOL, 5700, 4200, 1_799_999_995, HASH, 2, address(this));
        feed.publish(SYMBOL, 5700, 1_799_999_995, HASH);

        assertEq(feed.latest(feed.idOf(SYMBOL)).round, 2);
    }

    // (c) reading by symbol equals reading by id
    function test_LatestBySymbolMatchesLatest() public {
        feed.publish(SYMBOL, 4200, 1_799_999_990, HASH);

        OddsFeed.Odds memory byId = feed.latest(feed.idOf(SYMBOL));
        OddsFeed.Odds memory bySymbol = feed.latestBySymbol(SYMBOL);
        assertEq(abi.encode(bySymbol), abi.encode(byId));
    }

    // (d) an unknown market reads as all zeros
    function test_UnknownMarketIsZero() public view {
        OddsFeed.Odds memory o = feed.latest(feed.idOf("never:published"));
        assertEq(o.probBps, 0);
        assertEq(o.observedAt, 0);
        assertEq(o.publishedAt, 0);
        assertEq(o.sourceHash, bytes32(0));
        assertEq(o.round, 0);
    }

    // (e) only the publisher (the deployer) can publish
    function test_OnlyThePublisherCanPublish() public {
        assertEq(feed.publisher(), address(this));
        vm.prank(address(0xBEEF));
        vm.expectRevert("only the publisher");
        feed.publish(SYMBOL, 4200, 1_799_999_990, HASH);
        assertEq(feed.latest(feed.idOf(SYMBOL)).round, 0);
    }

    // (f) 100% is the largest value; anything above it reverts
    function test_Above100PercentReverts() public {
        feed.publish(SYMBOL, 10000, 1_799_999_990, HASH);
        vm.expectRevert("above 100%");
        feed.publish(SYMBOL, 10001, 1_799_999_995, HASH);
        assertEq(feed.latest(feed.idOf(SYMBOL)).probBps, 10000);
    }
}
