import { describe, expect, it } from "vitest";
import { cardId } from "../deck.js";
import {
  beginRound,
  createMatch,
  getForbiddenBid,
  getLegalBidAmounts,
  getSeatOrder,
  getWinners,
  isMatchComplete,
  nextSeat,
  placeBid,
  playCard,
} from "../match.js";
import { legalPlays } from "../trick.js";
import type { MatchState, SeatIndex } from "../types.js";

/** Test helper: drives one round to completion with a simple, always-legal strategy. */
function playRoundNaively(match: MatchState): MatchState {
  let state = match;
  while (state.round && state.round.phase === "bidding") {
    const seat = state.round.nextBidder as SeatIndex;
    const legalAmounts = getLegalBidAmounts(state.round, state.settings);
    const amount = legalAmounts[0];
    const result = placeBid(state, seat, amount);
    if (!result.ok) throw new Error(`naive bid failed: ${result.error.code} ${result.error.message}`);
    state = result.state;
  }
  while (state.round && state.round.phase === "playing") {
    const seat = state.round.nextPlayer as SeatIndex;
    const hand = state.round.hands[seat];
    const legal = legalPlays(hand, state.round.currentTrick);
    const result = playCard(state, seat, legal[0]);
    if (!result.ok) throw new Error(`naive play failed: ${result.error.code} ${result.error.message}`);
    state = result.state;
  }
  return state;
}

describe("getSeatOrder / nextSeat", () => {
  it("wraps around clockwise starting from any seat", () => {
    expect(getSeatOrder(0)).toEqual([0, 1, 2, 3]);
    expect(getSeatOrder(2)).toEqual([2, 3, 0, 1]);
    expect(nextSeat(3)).toBe(0);
  });
});

describe("createMatch / beginRound dealing", () => {
  it("deals exactly handSize cards to each of the 4 seats, all unique, plus a trump card", () => {
    const match = createMatch({ roundPeak: 5, seed: 1 });
    const round = match.round!;
    expect(round.handSize).toBe(1);
    for (const seat of [0, 1, 2, 3] as const) {
      expect(round.hands[seat]).toHaveLength(1);
    }
    const allIds = ([0, 1, 2, 3] as const).flatMap((s) => round.hands[s].map(cardId));
    if (round.trumpCard) allIds.push(cardId(round.trumpCard));
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(round.trumpCard).not.toBeNull();
  });

  it("deals No Trump when the hand size is 13 (the deck is fully consumed)", () => {
    const base: MatchState = {
      roundSequence: [13],
      roundIndex: 0,
      dealerStart: 0,
      totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      history: [],
      round: null,
      phase: "in_progress",
      settings: { roundPeak: 13, dealerRestriction: true, seed: 77 },
    };
    const match = beginRound(base);
    const round = match.round!;
    expect(round.trump).toBeNull();
    expect(round.trumpCard).toBeNull();
    for (const seat of [0, 1, 2, 3] as const) {
      expect(round.hands[seat]).toHaveLength(13);
    }
    const allIds = ([0, 1, 2, 3] as const).flatMap((s) => round.hands[s].map(cardId));
    expect(new Set(allIds).size).toBe(52);
  });

  it("is deterministic: the same seed deals the same hands and trump", () => {
    const a = createMatch({ roundPeak: 4, seed: 999 });
    const b = createMatch({ roundPeak: 4, seed: 999 });
    expect(a.round!.hands).toEqual(b.round!.hands);
    expect(a.round!.trumpCard).toEqual(b.round!.trumpCard);
  });

  it("different seeds (usually) deal different hands", () => {
    const a = createMatch({ roundPeak: 4, seed: 1 });
    const b = createMatch({ roundPeak: 4, seed: 2 });
    expect(a.round!.hands).not.toEqual(b.round!.hands);
  });
});

describe("bidding", () => {
  it("proceeds in order starting left of the dealer, dealer bidding last", () => {
    const match = createMatch({ roundPeak: 3, seed: 5 });
    const round = match.round!;
    expect(round.dealer).toBe(0);
    expect(round.biddingOrder).toEqual([1, 2, 3, 0]);
    expect(round.nextBidder).toBe(1);
  });

  it("rejects a bid from anyone but the seat whose turn it is", () => {
    const match = createMatch({ roundPeak: 3, seed: 5 });
    const result = placeBid(match, 2, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_YOUR_TURN");
  });

  it("rejects an out-of-range bid", () => {
    const match = createMatch({ roundPeak: 3, seed: 5 }); // handSize 1
    const result = placeBid(match, 1, 2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BID_OUT_OF_RANGE");
  });

  it("enforces the dealer restriction: total bids may never equal the hand size", () => {
    const base: MatchState = {
      roundSequence: [3],
      roundIndex: 0,
      dealerStart: 0,
      totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      history: [],
      round: null,
      phase: "in_progress",
      settings: { roundPeak: 3, dealerRestriction: true, seed: 42 },
    };
    let match = beginRound(base);
    // biddingOrder = [1, 2, 3, 0]; dealer (0) bids last.
    match = (placeBid(match, 1, 1) as { ok: true; state: MatchState }).state;
    match = (placeBid(match, 2, 1) as { ok: true; state: MatchState }).state;
    match = (placeBid(match, 3, 1) as { ok: true; state: MatchState }).state;
    // Sum so far = 3 = handSize, so dealer's forbidden bid is 0.
    expect(getForbiddenBid(match.round!, match.settings)).toBe(0);
    const forbidden = placeBid(match, 0, 0);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe("BID_FORBIDDEN");
    const allowed = placeBid(match, 0, 1);
    expect(allowed.ok).toBe(true);
  });

  it("can be disabled via settings", () => {
    const base: MatchState = {
      roundSequence: [3],
      roundIndex: 0,
      dealerStart: 0,
      totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      history: [],
      round: null,
      phase: "in_progress",
      settings: { roundPeak: 3, dealerRestriction: false, seed: 42 },
    };
    let match = beginRound(base);
    match = (placeBid(match, 1, 1) as { ok: true; state: MatchState }).state;
    match = (placeBid(match, 2, 1) as { ok: true; state: MatchState }).state;
    match = (placeBid(match, 3, 1) as { ok: true; state: MatchState }).state;
    expect(getForbiddenBid(match.round!, match.settings)).toBeNull();
    const result = placeBid(match, 0, 0);
    expect(result.ok).toBe(true);
  });

  it("moves the round into the playing phase once all four seats have bid", () => {
    const match = createMatch({ roundPeak: 2, seed: 5 }); // round 1, handSize 1
    let state = match;
    for (const seat of state.round!.biddingOrder) {
      state = (placeBid(state, seat, 0) as { ok: true; state: MatchState }).state;
    }
    expect(state.round!.phase).toBe("playing");
    expect(state.round!.nextPlayer).toBe(state.round!.trickLeader);
  });

  it("rejects bidding once the round has moved to the playing phase", () => {
    const match = createMatch({ roundPeak: 2, seed: 5 });
    let state = match;
    for (const seat of state.round!.biddingOrder) {
      state = (placeBid(state, seat, 0) as { ok: true; state: MatchState }).state;
    }
    const result = placeBid(state, state.round!.trickLeader, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("WRONG_PHASE");
  });
});

describe("playing cards", () => {
  function bidAllZero(match: MatchState): MatchState {
    let state = match;
    for (const seat of state.round!.biddingOrder) {
      const legal = getLegalBidAmounts(state.round!, state.settings);
      const amount = legal.includes(0) ? 0 : legal[0];
      state = (placeBid(state, seat, amount) as { ok: true; state: MatchState }).state;
    }
    return state;
  }

  it("rejects playing out of turn", () => {
    const match = bidAllZero(createMatch({ roundPeak: 5, seed: 8 })); // handSize 1
    const round = match.round!;
    const notNext = ([0, 1, 2, 3] as const).find((s) => s !== round.nextPlayer)!;
    const card = round.hands[notNext][0];
    const result = playCard(match, notNext, card);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_YOUR_TURN");
  });

  it("rejects playing a card not in hand", () => {
    const match = bidAllZero(createMatch({ roundPeak: 5, seed: 8 }));
    const round = match.round!;
    const foreignCard = { suit: "S" as const, rank: "2" as const };
    const notHeld = !round.hands[round.nextPlayer!].some((c) => c.suit === "S" && c.rank === "2");
    if (notHeld) {
      const result = playCard(match, round.nextPlayer!, foreignCard);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CARD_NOT_IN_HAND");
    }
  });

  it("enforces follow-suit and lets a void hand sluff anything", () => {
    // Build a 2-card round directly so we control hands precisely.
    const base: MatchState = {
      roundSequence: [2],
      roundIndex: 0,
      dealerStart: 0,
      totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      history: [],
      round: null,
      phase: "in_progress",
      settings: { roundPeak: 2, dealerRestriction: false, seed: 3 },
    };
    let match = beginRound(base);
    // Overwrite the dealt hands with a fully controlled, guaranteed-legal scenario.
    const round = match.round!;
    const hands = {
      0: [{ suit: "H" as const, rank: "2" as const }, { suit: "S" as const, rank: "9" as const }],
      1: [{ suit: "H" as const, rank: "5" as const }, { suit: "C" as const, rank: "4" as const }],
      2: [{ suit: "S" as const, rank: "3" as const }, { suit: "D" as const, rank: "6" as const }],
      3: [{ suit: "S" as const, rank: "K" as const }, { suit: "H" as const, rank: "7" as const }],
    };
    match = { ...match, round: { ...round, hands, trump: "D", trumpCard: { suit: "D", rank: "A" } } };
    match = bidAllZero(match);

    const leader = match.round!.trickLeader; // seat 1 (left of dealer 0)
    expect(leader).toBe(1);
    // Seat 1 leads hearts (5H).
    match = (playCard(match, 1, { suit: "H", rank: "5" }) as { ok: true; state: MatchState }).state;
    // Seat 2 holds no hearts -> must be allowed to sluff (plays 3S).
    const seat2Legal = legalPlays(match.round!.hands[2], match.round!.currentTrick);
    expect(seat2Legal).toEqual(match.round!.hands[2]); // void in hearts, anything legal
    match = (playCard(match, 2, { suit: "S", rank: "3" }) as { ok: true; state: MatchState }).state;
    // Seat 3 HOLDS a heart (7H) and must follow suit; trying to play S(K) should fail.
    const illegal = playCard(match, 3, { suit: "S", rank: "K" });
    expect(illegal.ok).toBe(false);
    if (!illegal.ok) expect(illegal.error.code).toBe("MUST_FOLLOW_SUIT");
    const legalFollow = playCard(match, 3, { suit: "H", rank: "7" });
    expect(legalFollow.ok).toBe(true);
  });

  it("awards the trick to the correct winner and advances the leader", () => {
    const base: MatchState = {
      roundSequence: [1],
      roundIndex: 0,
      dealerStart: 0,
      totalScores: { 0: 0, 1: 0, 2: 0, 3: 0 },
      history: [],
      round: null,
      phase: "in_progress",
      settings: { roundPeak: 1, dealerRestriction: false, seed: 3 },
    };
    let match = beginRound(base);
    const hands = {
      0: [{ suit: "H" as const, rank: "2" as const }],
      1: [{ suit: "H" as const, rank: "9" as const }],
      2: [{ suit: "S" as const, rank: "A" as const }], // trump
      3: [{ suit: "H" as const, rank: "K" as const }],
    };
    match = { ...match, round: { ...match.round!, hands, trump: "S", trumpCard: { suit: "S", rank: "2" } } };
    match = bidAllZero(match); // biddingOrder [1,2,3,0], leader = 1

    match = (playCard(match, 1, hands[1][0]) as { ok: true; state: MatchState }).state;
    match = (playCard(match, 2, hands[2][0]) as { ok: true; state: MatchState }).state; // trump!
    match = (playCard(match, 3, hands[3][0]) as { ok: true; state: MatchState }).state;
    const final = playCard(match, 0, hands[0][0]);
    expect(final.ok).toBe(true);
    if (!final.ok) return;
    // Seat 2's lone trump beats three hearts -> wins the trick -> round (and match, peak=1) complete.
    expect(final.state.history).toHaveLength(1);
    expect(final.state.history[0].tricksWon[2]).toBe(1);
    expect(final.state.history[0].bids[2]).toBe(0);
    // Seat 2 bid 0 but won 1 -> busted -> scores 0 for the round.
    expect(final.state.history[0].scores[2]).toBe(0);
    // Everyone else bid 0 and won 0 -> "Nothing" bonus = 10 + handSize(1) = 11.
    expect(final.state.history[0].scores[0]).toBe(11);
    expect(final.state.history[0].scores[1]).toBe(11);
    expect(final.state.history[0].scores[3]).toBe(11);
  });
});

describe("full match progression", () => {
  it("plays every round of a short match, rotates the dealer, and completes with consistent totals", () => {
    let match = createMatch({ roundPeak: 3, dealerRestriction: true, seed: 2024 }); // [1,2,3,2,1] = 5 rounds
    const dealersSeen: SeatIndex[] = [];
    let rounds = 0;
    while (!isMatchComplete(match)) {
      dealersSeen.push(match.round!.dealer);
      match = playRoundNaively(match);
      rounds++;
      if (rounds > 10) throw new Error("runaway loop — match never completed");
    }
    expect(match.history).toHaveLength(5);
    expect(dealersSeen).toEqual([0, 1, 2, 3, 0]); // rotates clockwise each round

    // Every seat's total score is exactly the sum of its per-round scores.
    for (const seat of [0, 1, 2, 3] as const) {
      const sum = match.history.reduce((acc, r) => acc + r.scores[seat], 0);
      expect(match.totalScores[seat]).toBe(sum);
    }

    const winners = getWinners(match);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    const maxScore = Math.max(...([0, 1, 2, 3] as const).map((s) => match.totalScores[s]));
    for (const w of winners) expect(match.totalScores[w]).toBe(maxScore);
  });

  it("rejects further actions once the match is complete", () => {
    let match = createMatch({ roundPeak: 1, seed: 11 }); // single 1-card round
    match = playRoundNaively(match);
    expect(isMatchComplete(match)).toBe(true);
    const result = placeBid(match, 0, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MATCH_COMPLETE");
  });

  it("is fully deterministic end-to-end for a given seed", () => {
    const runOnce = () => {
      let m = createMatch({ roundPeak: 4, seed: 31415 });
      while (!isMatchComplete(m)) m = playRoundNaively(m);
      return m;
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.totalScores).toEqual(b.totalScores);
    expect(a.history).toEqual(b.history);
  });
});
