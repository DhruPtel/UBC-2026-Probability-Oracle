// From a chance to a level, and from a level to a suggested limit. Pure: no chain, no network.
// The server's advisor and /api/pools use these (unit 9.1 moved them here to test them).

// The level a chance stands at: the highest tier whose threshold it has reached. The same rule
// as RiskSwitch.sync onchain.
export function levelOf(tiers: { thresholdBps: number }[], harmBps: number) {
  let level = 0;
  tiers.forEach((t, i) => {
    if (t.thresholdBps <= harmBps) level = i;
  });
  return level;
}

// Aave: level 1 = the limit 10 points lower, level 2 = 25 points lower, level 3 = no new
// borrowing beyond today's level: the 25-point cut stays and the borrow cap is held.
export const CUTS = [0, 1000, 2500, 2500];
export const aaveLadder = (limitBps: number) => CUTS.map((cut) => Math.max(0, limitBps - cut));

// Morpho: the LLTV cannot change, and nothing touches open loans. The suggestion only limits new
// lending, so it never goes below what is supplied and borrowed now (as shares of the
// collateral). 50%+: hold the vault cap at today's supply. 70%+ and 85%+: no new borrowing room
// beyond today's.
export function morphoLadder(c: { limitBps: number; collateralUsd: number; borrowedUsd: number; supplyUsd: number }) {
  const borrowed = Math.round((c.borrowedUsd / c.collateralUsd) * 10000);
  const supplied = Math.min(c.limitBps, Math.max(borrowed, Math.round((c.supplyUsd / c.collateralUsd) * 10000)));
  return [c.limitBps, supplied, Math.min(c.limitBps, borrowed), Math.min(c.limitBps, borrowed)];
}

// "$ less new lending": the collateral times the points taken off the limit.
export const lessUsd = (collateralUsd: number, limitBps: number, suggestedBps: number) => (collateralUsd * (limitBps - suggestedBps)) / 10000;
