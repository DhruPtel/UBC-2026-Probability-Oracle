// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OddsReader, IOddsFeed} from "./OddsReader.sol";

// The contract snippet from the product site (/use), exactly as the page shows it
// (npm run site:snippets writes OddsReader.sol), read against the real OddsFeed on a fork of
// Arc testnet. Skipped when ARC_RPC_URL is not set, so plain `forge test` needs no network.
contract SiteSnippetTest is Test {
    function test_snippetReadsTheRealFeed() public {
        string memory rpc = vm.envOr("ARC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        OddsReader reader = new OddsReader();
        IOddsFeed.Odds memory o = reader.FEED().latestBySymbol(reader.MARKET());
        uint256 no = reader.chanceOfNo();
        assertGt(o.round, 0);
        assertEq(no, 10000 - o.probBps);
        emit log_named_uint("chance of YES, bps", o.probBps);
        emit log_named_uint("chance of NO, bps", no);
        emit log_named_uint("round", o.round);
    }
}
