/**
 * Scoring is the heart of "All or Nothing": there is no partial credit.
 * Miss your bid by even one trick — over OR under — and you score zero for
 * the round. Nail it exactly and you're paid, with the richest rewards for
 * committing to the two riskiest bids: "Nothing" (0 tricks) and "All"
 * (every trick in the hand). See README.md "Rules" for the full rationale.
 */
export function scoreRound(bid: number, tricksWon: number, handSize: number): number {
  if (bid < 0 || bid > handSize) {
    throw new Error(`bid ${bid} out of range for a ${handSize}-card hand`);
  }
  if (tricksWon !== bid) return 0;
  if (bid === 0) return 10 + handSize; // "Nothing", made
  if (bid === handSize) return 20 + handSize * 2; // "All", made
  return 10 + bid * 2; // ordinary exact bid
}

export function isExtremeBid(bid: number, handSize: number): boolean {
  return bid === 0 || bid === handSize;
}
