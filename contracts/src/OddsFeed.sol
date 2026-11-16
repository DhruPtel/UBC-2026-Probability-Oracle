// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// The onchain odds feed: the latest probability for each prediction market.
/// Anyone can read it for free. Every update leaves an event with the previous value.
contract OddsFeed {
    struct Odds {
        /// @dev YES probability in basis points (5150 = 51.5%).
        uint16 probBps;
        uint64 observedAt; // when the publisher read the source, unix seconds
        uint64 publishedAt; // block time of the publish
        bytes32 sourceHash; // keccak256 of the source data the value came from
        uint32 round; // 1 for the first publish; 0 means never published
    }

    /// marketId => latest odds. marketId = idOf(symbol).
    mapping(bytes32 => Odds) public odds;

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

    function idOf(string calldata symbol) public pure returns (bytes32) {
        return keccak256(bytes(symbol));
    }

    /// Open to anyone in Phase 2. Phase 7 restricts it to the oracle address.
    function publish(string calldata symbol, uint16 probBps, uint64 observedAt, bytes32 sourceHash) external {
        bytes32 id = idOf(symbol);
        uint16 prev = odds[id].probBps;
        uint32 round = odds[id].round + 1;

        odds[id] = Odds(probBps, observedAt, uint64(block.timestamp), sourceHash, round);

        emit OddsUpdated(id, symbol, probBps, prev, observedAt, sourceHash, round, msg.sender);
    }

    function latest(bytes32 marketId) external view returns (Odds memory) {
        return odds[marketId];
    }

    /// Same as latest(), by symbol, so it can be typed into an explorer's Read tab.
    function latestBySymbol(string calldata symbol) external view returns (Odds memory) {
        return odds[idOf(symbol)];
    }
}
