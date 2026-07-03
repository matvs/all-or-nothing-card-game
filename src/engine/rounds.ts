/**
 * A match is a sequence of rounds where the hand size climbs from 1 up to a
 * configurable peak and back down to 1 — e.g. peak=8 gives
 * [1,2,3,4,5,6,7,8,7,6,5,4,3,2,1] (15 rounds). Short hands force sharp,
 * high-variance bidding ("all or nothing" territory); long hands reward
 * broader hand-reading skill. This mirrors the classic Oh Hell!/Nomination
 * Whist arc while keeping match length configurable.
 */
export function buildRoundSequence(peak: number): number[] {
  if (!Number.isInteger(peak) || peak < 1 || peak > 13) {
    throw new Error(`roundPeak must be an integer between 1 and 13 (got ${peak})`);
  }
  const up: number[] = [];
  for (let n = 1; n <= peak; n++) up.push(n);
  const down: number[] = [];
  for (let n = peak - 1; n >= 1; n--) down.push(n);
  return [...up, ...down];
}

export const MATCH_LENGTH_PRESETS = {
  short: 5, // 9 rounds
  standard: 8, // 15 rounds
  long: 13, // 25 rounds; the two 13-card rounds are dealt No Trump
} as const;

export type MatchLengthPreset = keyof typeof MATCH_LENGTH_PRESETS;
