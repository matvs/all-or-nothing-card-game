import { getForbiddenBid } from "../src/engine/match.js";
import { SEATS, type MatchState, type SeatIndex } from "../src/engine/types.js";
import type { ClientMatchView, ClientRoundView } from "./protocol.js";

/**
 * Projects the full (secret-bearing) engine state down to what one recipient
 * is allowed to see: their own hand, everyone's public counters, and nothing
 * else. Used verbatim by the server (per-seat broadcasts) and by the local
 * single-player session, so the UI renders exactly one shape.
 */
export function toClientMatchView(match: MatchState, forSeat: SeatIndex | null): ClientMatchView {
  const round = match.round;
  let roundView: ClientRoundView | null = null;
  if (round) {
    const handCounts = Object.fromEntries(SEATS.map((s) => [s, round.hands[s].length])) as Record<SeatIndex, number>;
    roundView = {
      roundNumber: round.roundNumber,
      handSize: round.handSize,
      trump: round.trump,
      trumpCard: round.trumpCard,
      dealer: round.dealer,
      yourHand: forSeat !== null ? round.hands[forSeat] : null,
      handCounts,
      biddingOrder: [...round.biddingOrder],
      bids: { ...round.bids },
      nextBidder: round.nextBidder,
      currentTrick: [...round.currentTrick],
      trickLeader: round.trickLeader,
      nextPlayer: round.nextPlayer,
      tricksWon: { ...round.tricksWon },
      lastCompletedTrick: round.completedTricks.at(-1) ?? null,
      phase: round.phase,
      forbiddenBid: getForbiddenBid(round, match.settings),
    };
  }
  return {
    roundSequence: [...match.roundSequence],
    roundIndex: match.roundIndex,
    totalScores: { ...match.totalScores },
    history: match.history,
    round: roundView,
    phase: match.phase,
    settings: match.settings,
  };
}
