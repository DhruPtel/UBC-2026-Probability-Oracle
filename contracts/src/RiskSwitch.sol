// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OddsFeed} from "./OddsFeed.sol";

/// The risk switch: a protocol opts in once with its own tiers, and from then on its risk
/// level follows the prediction-market odds in OddsFeed.
/// No access control yet: anyone can call sync (Phase 8 limits it to the keeper).
contract RiskSwitch {
    /// One risk level. A protocol is at the highest tier whose threshold the harm probability has reached.
    struct Tier {
        uint16 thresholdBps; // harm probability at which this tier starts (5000 = 50%)
        uint16 maxLtvBps; // the loan limit at this tier (7500 = 75% of collateral)
        bool paused; // true = no new borrowing at this tier
    }

    struct Config {
        string symbol; // the OddsFeed market this protocol follows
        uint8 harmfulSide; // 0 = YES hurts, 1 = NO hurts (the same as ProtectionBook)
        uint8 level; // index into the protocol's tiers, as of the last sync
        uint16 harmBps; // harm probability at the last sync
        uint64 syncedAt; // block time of the last sync; 0 = never synced
    }

    OddsFeed public immutable feed;

    mapping(address => Config) public configs;
    mapping(address => Tier[]) private _tiers;

    event OptedIn(address indexed protocol, string symbol, uint8 harmfulSide, uint256 tierCount);
    event RiskLevelChanged(address indexed protocol, string symbol, uint8 oldLevel, uint8 newLevel, uint16 harmBps);

    constructor(address oddsFeed) {
        feed = OddsFeed(oddsFeed);
    }

    /// The caller opts in (or replaces its settings). Tiers come in rising threshold order;
    /// tier 0 starts at 0 and is the normal state. The level starts at 0 until the first sync.
    function optIn(string calldata symbol, uint8 harmfulSide, Tier[] calldata tiers) external {
        require(harmfulSide <= 1, "side must be 0 (YES) or 1 (NO)");
        require(tiers.length > 0 && tiers[0].thresholdBps == 0, "tier 0 must start at 0");

        delete _tiers[msg.sender];
        for (uint256 i = 0; i < tiers.length; i++) {
            require(i == 0 || tiers[i].thresholdBps > tiers[i - 1].thresholdBps, "thresholds must rise");
            _tiers[msg.sender].push(tiers[i]);
        }
        configs[msg.sender] = Config(symbol, harmfulSide, 0, 0, 0);
        emit OptedIn(msg.sender, symbol, harmfulSide, tiers.length);
    }

    /// Turns the latest odds into the protocol's current level. Anyone can call it.
    function sync(address protocol) external {
        Tier[] storage tiers = _tiers[protocol];
        require(tiers.length > 0, "not opted in");
        Config storage c = configs[protocol];

        OddsFeed.Odds memory o = feed.latestBySymbol(c.symbol);
        // An empty feed reads as 0% YES, which would be 100% harm for a NO market.
        require(o.round != 0, "market never published");

        uint16 harmBps = c.harmfulSide == 0 ? o.probBps : 10000 - o.probBps;
        uint8 level = 0;
        for (uint256 i = 1; i < tiers.length; i++) {
            if (tiers[i].thresholdBps <= harmBps) level = uint8(i);
        }

        uint8 oldLevel = c.level;
        c.level = level;
        c.harmBps = harmBps;
        c.syncedAt = uint64(block.timestamp);
        if (level != oldLevel) emit RiskLevelChanged(protocol, c.symbol, oldLevel, level, harmBps);
    }

    /// The protocol's limits as of the last sync. It does not read the live feed.
    function paramsOf(address protocol)
        external
        view
        returns (uint8 level, uint16 maxLtvBps, bool paused, uint16 harmBps, uint64 syncedAt)
    {
        require(_tiers[protocol].length > 0, "not opted in");
        Config storage c = configs[protocol];
        Tier storage t = _tiers[protocol][c.level];
        return (c.level, t.maxLtvBps, t.paused, c.harmBps, c.syncedAt);
    }

    function tiersOf(address protocol) external view returns (Tier[] memory) {
        return _tiers[protocol];
    }
}
