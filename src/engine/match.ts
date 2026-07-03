import { cardId, cardsEqual, createDeck } from "./deck.js";
import { deriveSeed, mulberry32, randomSeed, shuffle } from "./rng.js";
import { buildRoundSequence, MATCH_LENGTH_PRESETS } from "./rounds.js";
import { scoreRound } from "./scoring.js";
import { currentTrickWinner, legalPlays } from "./trick.js";
import {
  SEATS,
  err,
  ok,
  type Card,
  type EngineResult,
  type MatchSettings,
  type MatchState,
  type RoundResult,
  type RoundState,
  type SeatIndex,
} from "./types.js";

function zeroRecord(): Record<SeatIndex, number> {
  return { 0: 0, 1: 0, 2: 0, 3: 0 };
}

export function nextSeat(seat: SeatIndex): SeatIndex {
  return (((seat + 1) % 4) as SeatIndex);
}

/** Clockwise seating order starting at `start`, e.g. start=2 -> [2,3,0,1]. */
export function getSeatOrder(start: SeatIndex): SeatIndex[] {
  const order: SeatIndex[] = [start];
  let s = start;
  for (let i = 0; i < 3; i++) {
    s = nextSeat(s);
    order.push(s);
  }
  return order;
}

/** Deals a freshly (deterministically) shuffled deck for one round. */
function dealRound(
  matchSeed: number,
  roundNumber: number,
  handSize: number,
  dealer: SeatIndex
): { hands: Record<SeatIndex, Card[]>; trumpCard: Card | null } {
  const deck = shuffle(createDeck(), mulberry32(deriveSeed(matchSeed, roundNumber)));
  const hands: Record<SeatIndex, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
  const order = getSeatOrder(nextSeat(dealer));
  let cursor = 0;
  for (let i = 0; i < handSize; i++) {
    for (const seat of order) {
      hands[seat].push(deck[cursor]);
      cursor++;
    }
  }
  const trumpCard = cursor < deck.length ? deck[cursor] : null;
  return { hands, trumpCard };
}

/** Starts (or re-starts) the round at `match.roundIndex`. Internal transition, exported for tests. */
export function beginRound(match: MatchState): MatchState {
  const roundNumber = match.roundIndex + 1;
  const handSize = match.roundSequence[match.roundIndex];
  const dealer = getSeatOrder(match.dealerStart)[match.roundIndex % 4];
  const { hands, trumpCard } = dealRound(match.settings.seed, roundNumber, handSize, dealer);
  const biddingOrder = getSeatOrder(nextSeat(dealer));

  const round: RoundState = {
    roundNumber,
    handSize,
    trump: trumpCard ? trumpCard.suit : null,
    trumpCard,
    dealer,
    hands,
    biddingOrder,
    bids: {},
    nextBidder: biddingOrder[0],
    currentTrick: [],
    trickLeader: biddingOrder[0],
    nextPlayer: null,
    tricksWon: zeroRecord(),
    completedTricks: [],
    phase: "bidding",
  };

  return { ...match, round };
}

export function createMatch(settingsInput?: Partial<MatchSettings>, dealerStart: SeatIndex = 0): MatchState {
  const settings: MatchSettings = {
    roundPeak: settingsInput?.roundPeak ?? MATCH_LENGTH_PRESETS.standard,
    dealerRestriction: settingsInput?.dealerRestriction ?? true,
    seed: settingsInput?.seed ?? randomSeed(),
  };
  const roundSequence = buildRoundSequence(settings.roundPeak);

  const base: MatchState = {
    roundSequence,
    roundIndex: 0,
    dealerStart,
    totalScores: zeroRecord(),
    history: [],
    round: null,
    phase: "in_progress",
    settings,
  };

  return beginRound(base);
}

/**
 * The value the dealer may not bid, under the classic "screw the dealer"
 * restriction: the sum of all bids can never exactly equal the hand size,
 * guaranteeing at least one player fails every round. Returns null when the
 * restriction doesn't apply (disabled, or it isn't the closing bid yet).
 */
export function getForbiddenBid(round: RoundState, settings: MatchSettings): number | null {
  if (!settings.dealerRestriction || round.nextBidder === null) return null;
  const isClosingBid = round.biddingOrder[round.biddingOrder.length - 1] === round.nextBidder;
  if (!isClosingBid) return null;
  const soFar = Object.values(round.bids).reduce((sum: number, b) => sum + (b ?? 0), 0);
  const forbidden = round.handSize - soFar;
  return forbidden >= 0 && forbidden <= round.handSize ? forbidden : null;
}

export function getLegalBidAmounts(round: RoundState, settings: MatchSettings): number[] {
  const forbidden = getForbiddenBid(round, settings);
  const all: number[] = [];
  for (let n = 0; n <= round.handSize; n++) all.push(n);
  return forbidden === null ? all : all.filter((n) => n !== forbidden);
}

export function placeBid(match: MatchState, seat: SeatIndex, amount: number): EngineResult<MatchState> {
  if (match.phase === "complete" || !match.round) {
    return err("MATCH_COMPLETE", "The match has already ended.");
  }
  const round = match.round;
  if (round.phase !== "bidding") {
    return err("WRONG_PHASE", "This round is not in its bidding phase.");
  }
  if (round.nextBidder !== seat) {
    return err("NOT_YOUR_TURN", `It is seat ${round.nextBidder}'s turn to bid, not seat ${seat}'s.`);
  }
  if (!Number.isInteger(amount) || amount < 0 || amount > round.handSize) {
    return err("BID_OUT_OF_RANGE", `Bid must be an integer between 0 and ${round.handSize}.`);
  }
  const forbidden = getForbiddenBid(round, match.settings);
  if (forbidden !== null && amount === forbidden) {
    return err("BID_FORBIDDEN", `Total bids may not equal ${round.handSize}; ${amount} is forbidden here.`);
  }

  const bids = { ...round.bids, [seat]: amount };
  const idx = round.biddingOrder.indexOf(seat);
  const isLast = idx === round.biddingOrder.length - 1;

  const newRound: RoundState = isLast
    ? { ...round, bids, nextBidder: null, phase: "playing", nextPlayer: round.trickLeader }
    : { ...round, bids, nextBidder: round.biddingOrder[idx + 1] };

  return ok({ ...match, round: newRound });
}

function finishRound(match: MatchState, round: RoundState, tricksWon: Record<SeatIndex, number>): MatchState {
  const bids = round.bids as Record<SeatIndex, number>;
  const scores = zeroRecord();
  for (const seat of SEATS) {
    scores[seat] = scoreRound(bids[seat], tricksWon[seat], round.handSize);
  }
  const result: RoundResult = {
    roundNumber: round.roundNumber,
    handSize: round.handSize,
    trump: round.trump,
    dealer: round.dealer,
    bids,
    tricksWon,
    scores,
  };
  const totalScores = zeroRecord();
  for (const seat of SEATS) {
    totalScores[seat] = match.totalScores[seat] + scores[seat];
  }
  const history = [...match.history, result];
  const finishedRound: RoundState = { ...round, currentTrick: [], tricksWon, nextPlayer: null, phase: "complete" };

  const isMatchOver = match.roundIndex + 1 >= match.roundSequence.length;
  if (isMatchOver) {
    return { ...match, round: finishedRound, totalScores, history, phase: "complete" };
  }
  return beginRound({ ...match, round: finishedRound, totalScores, history, roundIndex: match.roundIndex + 1 });
}

export function playCard(match: MatchState, seat: SeatIndex, card: Card): EngineResult<MatchState> {
  if (match.phase === "complete" || !match.round) {
    return err("MATCH_COMPLETE", "The match has already ended.");
  }
  const round = match.round;
  if (round.phase !== "playing") {
    return err("WRONG_PHASE", "This round is not in its card-playing phase.");
  }
  if (round.nextPlayer !== seat) {
    return err("NOT_YOUR_TURN", `It is seat ${round.nextPlayer}'s turn to play, not seat ${seat}'s.`);
  }
  const hand = round.hands[seat];
  const inHand = hand.find((c) => cardsEqual(c, card));
  if (!inHand) {
    return err("CARD_NOT_IN_HAND", `Seat ${seat} does not hold ${cardId(card)}.`);
  }
  const legal = legalPlays(hand, round.currentTrick);
  if (!legal.some((c) => cardsEqual(c, card))) {
    return err("MUST_FOLLOW_SUIT", `Seat ${seat} must follow suit (holds the led suit) and cannot play ${cardId(card)}.`);
  }

  const newHand = hand.filter((c) => !cardsEqual(c, card));
  const hands = { ...round.hands, [seat]: newHand };
  const trick = [...round.currentTrick, { seat, card }];

  if (trick.length < 4) {
    const newRound: RoundState = { ...round, hands, currentTrick: trick, nextPlayer: nextSeat(seat) };
    return ok({ ...match, round: newRound });
  }

  // Trick complete.
  const winner = currentTrickWinner(trick, round.trump);
  const tricksWon = { ...round.tricksWon, [winner]: round.tricksWon[winner] + 1 };
  const completedTricks = [...round.completedTricks, trick];
  const roundIsOver = completedTricks.length === round.handSize;

  if (!roundIsOver) {
    const newRound: RoundState = {
      ...round,
      hands,
      currentTrick: [],
      tricksWon,
      completedTricks,
      trickLeader: winner,
      nextPlayer: winner,
    };
    return ok({ ...match, round: newRound });
  }

  const closingRound: RoundState = { ...round, hands, currentTrick: [], completedTricks, trickLeader: winner };
  return ok(finishRound(match, closingRound, tricksWon));
}

export type MatchAction =
  | { type: "bid"; seat: SeatIndex; amount: number }
  | { type: "play"; seat: SeatIndex; card: Card };

export function applyAction(match: MatchState, action: MatchAction): EngineResult<MatchState> {
  return action.type === "bid"
    ? placeBid(match, action.seat, action.amount)
    : playCard(match, action.seat, action.card);
}

export function isMatchComplete(match: MatchState): boolean {
  return match.phase === "complete";
}

export function getWinners(match: MatchState): SeatIndex[] {
  const max = Math.max(...SEATS.map((s) => match.totalScores[s]));
  return SEATS.filter((s) => match.totalScores[s] === max);
}
