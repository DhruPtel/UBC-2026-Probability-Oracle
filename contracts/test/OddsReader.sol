// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IOddsFeed {
    struct Odds {
        uint16 probBps;     // chance of YES, 0 to 10000
        uint64 observedAt;  // when Gemini was read, unix seconds
        uint64 publishedAt; // block time of the post
        bytes32 sourceHash; // hash of the source data
        uint32 round;       // 0 means never posted
    }

    function latestBySymbol(string calldata symbol) external view returns (Odds memory);
}

contract OddsReader {
    // OddsFeed on Arc testnet, chain 5042002
    IOddsFeed public constant FEED = IOddsFeed(0x1857639d8E6b3dB0c04aA1288AFB278f848d7F6a);
    string public constant MARKET = "GEMI-BTC2611302200-HI67500";

    // The feed stores the chance of YES. This returns the chance of NO, in basis points.
    // If YES is the bad outcome for you, use probBps as it is.
    function chanceOfNo() external view returns (uint256) {
        IOddsFeed.Odds memory o = FEED.latestBySymbol(MARKET);
        require(o.round > 0, "never posted");
        return 10000 - o.probBps;
    }
}
