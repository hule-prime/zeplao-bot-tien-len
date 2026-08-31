/**
 * Luật tiến lên miền nam: bộ nào là bộ gì, ai đè được ai, và cái máy nghĩ.
 *
 * Thuần và không biết gì về mạng: mọi thứ ở đây nhận vào bài hoặc số và trả về bài hoặc số.
 * Đó là lý do nó tách ra khỏi `tienlenbot.mjs` — một luật chơi kiểm được bằng một phép gọi hàm
 * là một luật chơi kiểm được, còn một luật chơi chỉ kiểm được qua một cái bàn đang chạy thì
 * không.
 */

import { RANKS, SUITS, TWO, rankOf, suitOf } from './cards.mjs';

// ---- what may be put down ---------------------------------------------------------------

/**
 * What this set of cards is, or nothing if it is not anything.
 *
 * Returns `{ kind, size, top }`. `top` is the highest card, which is what every comparison
 * between two plays of the same shape comes down to.
 *
 * The six shapes are the whole game: a card, a pair, a triple, four of a kind, a run of three
 * or more, and a run of three or more pairs. Everything else — chặt, who beats what — is
 * `beats` below, and is about two of these rather than about one.
 */
export function shapeOf(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;

  // Anything a stranger typed. A duplicate card is the interesting one: without this check a
  // widget could send the same card four times and call it a tứ quý.
  const seen = new Set();
  for (const card of cards) {
    if (!Number.isInteger(card) || card < 0 || card > 51) return null;
    if (seen.has(card)) return null;
    seen.add(card);
  }

  const sorted = [...cards].sort((a, b) => a - b);
  const top = sorted[sorted.length - 1];
  const ranks = sorted.map(rankOf);
  const same = ranks.every((r) => r === ranks[0]);

  if (sorted.length === 1) return { kind: 'single', size: 1, top };
  if (same) {
    if (sorted.length === 2) return { kind: 'pair', size: 2, top };
    if (sorted.length === 3) return { kind: 'triple', size: 3, top };
    if (sorted.length === 4) return { kind: 'quad', size: 4, top };
    return null;
  }

  // A run, and a run of pairs. Neither may hold a 2 — that is the rule the whole endgame is
  // built on, and without it a hand with two 2s in it could simply be walked out in a sảnh.
  if (ranks.includes(TWO)) return null;

  if (sorted.length >= 3) {
    const consecutive = ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
    if (consecutive) return { kind: 'straight', size: sorted.length, top };
  }

  if (sorted.length >= 6 && sorted.length % 2 === 0) {
    const pairs = [];
    for (let i = 0; i < sorted.length; i += 2) {
      if (ranks[i] !== ranks[i + 1]) return null;
      pairs.push(ranks[i]);
    }
    const consecutive = pairs.every((r, i) => i === 0 || r === pairs[i - 1] + 1);
    // Every rank distinct as well as consecutive: three pairs of the same rank is impossible
    // with four suits, but four pairs across two ranks is not, and it is not a đôi thông.
    if (consecutive) return { kind: 'pairs_run', size: sorted.length, top, pairs: pairs.length };
  }

  return null;
}

export const isBomb = (shape) =>
  !!shape && (shape.kind === 'quad' || (shape.kind === 'pairs_run' && shape.pairs >= 3));

/// A single 2, and a pair of them.
const isLoneTwo = (shape) => shape.kind === 'single' && rankOf(shape.top) === TWO;
const isPairOfTwos = (shape) => shape.kind === 'pair' && rankOf(shape.top) === TWO;

/**
 * Where something sits on the ladder of chặt, or null if it is not on it at all.
 *
 * The ladder is the whole of the endgame and it is written once, here, as a number — not as a
 * list of which shape cuts which. It used to be a list, and the list had a hole in it: five and
 * six đôi thông were not on it, so a run of five pairs could not cut four pairs and could not
 * cut anything else either. A ladder with seven rungs and one comparison cannot have that kind
 * of hole, because there is nowhere for a rung to be left out.
 */
export function bombRank(shape) {
  if (!shape) return null;
  if (isLoneTwo(shape)) return 0;
  if (isPairOfTwos(shape)) return 1;
  if (shape.kind === 'quad') return 3;
  if (shape.kind === 'pairs_run' && shape.pairs >= 3) {
    // 3 đôi thông sits below tứ quý, everything longer sits above it.
    return shape.pairs === 3 ? 2 : Math.min(shape.pairs, 6);
  }
  return null;
}

/**
 * Whether `mine` may be put on top of `theirs`.
 *
 * Two ways: the same shape but higher, or a chặt.
 *
 *   heo lẻ  0        ← what a bomb is usually spent on
 *   đôi heo 1
 *   3 đôi thông 2    ← cuts a lone 2 only, which is the common southern rule
 *   tứ quý 3
 *   4 đôi thông 4
 *   5 đôi thông 5
 *   6 đôi thông 6
 *
 * A bomb cuts anything standing lower on the ladder. Two of the same rung are compared by their
 * highest card, which the first branch already does — so the ladder only ever has to answer
 * about two things on *different* rungs.
 */
export function beats(mine, theirs) {
  if (!mine) return false;
  if (!theirs) return true;

  if (mine.kind === theirs.kind && mine.size === theirs.size) return mine.top > theirs.top;

  if (!isBomb(mine)) return false;

  const rung = bombRank(mine);
  const under = bombRank(theirs);
  if (under === null) return false;

  // Three consecutive pairs is the one rung that does not cut everything below it. It takes a
  // lone 2 and nothing else — a pair of 2s is out of its reach, which is what makes holding
  // two of them worth something.
  if (rung === 2) return under === 0;

  return under < rung;
}

/// Whether this play is a chặt rather than an ordinary answer — a bomb landing on a 2 or on
/// another bomb. Not the same question as `beats`: a higher pair beats a pair and is not a
/// chặt, and there is money riding on the difference.
export function isChop(mine, theirs) {
  return !!theirs && isBomb(mine) && bombRank(theirs) !== null;
}

/**
 * What a bomb or a 2 is worth, counted in table stakes.
 *
 * One table for two different questions, because at a real table they are the same table: what
 * you collect for cutting it, and what you pay for still holding it when the hand ends.
 *
 *   heo đen  1     heo đỏ  2
 *   3 đôi thông 2  tứ quý 3   4 đôi 4   5 đôi 5   6 đôi 6
 *
 * A black 2 and a red 2 are not the same card here and never have been, which is why 2s are
 * counted one at a time rather than by the shape they were played in.
 */
export const PAIRS_WORTH = { 3: 2, 4: 4, 5: 5, 6: 6 };

export const twoWorth = (card) => (suitOf(card) >= 2 ? 2 : 1);

export function worthOf(cards) {
  const shape = shapeOf(cards);
  if (!shape) return 0;
  if (shape.kind === 'quad') return 3;
  if (shape.kind === 'pairs_run' && shape.pairs >= 3) {
    return PAIRS_WORTH[Math.min(shape.pairs, 6)] ?? shape.pairs;
  }
  const twos = cards.filter((card) => rankOf(card) === TWO);
  if (twos.length && twos.length === cards.length) {
    return twos.reduce((total, card) => total + twoWorth(card), 0);
  }
  return 0;
}

/**
 * What a hand still being held is worth against its owner — thối.
 *
 * Counted off the hand rather than off a shape, because nobody plays their leftovers: two 2s
 * sitting in a hand that never got to put them down are two 2s, whether or not their owner was
 * ever going to play them as a pair.
 *
 * Bombs count once each, longest first, so five consecutive pairs is five đôi thông and not
 * three đôi thông with a couple spare.
 */
export function rotting(hand) {
  let total = 0;
  const groups = byRank(hand);

  for (const card of hand) if (rankOf(card) === TWO) total += twoWorth(card);
  for (const [rank, cards] of groups) if (cards.length === 4 && rank !== TWO) total += 3;

  // Runs of pairs, taken as long as they go. A block of five is one five, not a three and a
  // leftover, which is both the rule and the more expensive reading — as it should be.
  let run = 0;
  for (let rank = 0; rank <= TWO; rank++) {
    const has = rank !== TWO && (groups.get(rank)?.length ?? 0) >= 2;
    if (has) { run++; continue; }
    if (run >= 3) total += PAIRS_WORTH[Math.min(run, 6)] ?? run;
    run = 0;
  }
  if (run >= 3) total += PAIRS_WORTH[Math.min(run, 6)] ?? run;

  return total;
}

/**
 * Tới trắng: a hand that has already won before anybody has played a card.
 *
 * Returns what it is, or null. Checked once, on the deal, and the hand never starts.
 *
 * These are the five every southern table plays. Ba đôi thông có 3 bích is a sixth at some
 * tables and is deliberately left out — it turns up often enough to end a great many hands
 * before they begin, and a game that is over on the deal one time in twenty is not a game.
 */
export const INSTANT = {
  quadTwos: 'Tứ quý heo',
  fivePairs: 'Năm đôi thông',
  sixPairs: 'Sáu đôi',
  dragon: 'Sảnh rồng',
};

export function instantWin(hand) {
  const groups = byRank(hand);

  if ((groups.get(TWO)?.length ?? 0) === 4) return INSTANT.quadTwos;

  // Twelve ranks, 3 through A, at least one of each. Thirteen cards over twelve ranks means
  // exactly one rank twice and no 2 anywhere.
  let ranksInRow = 0;
  for (let rank = 0; rank < TWO; rank++) if ((groups.get(rank)?.length ?? 0) >= 1) ranksInRow++;
  if (ranksInRow === TWO) return INSTANT.dragon;

  let pairs = 0;
  let run = 0;
  let longest = 0;
  for (let rank = 0; rank <= TWO; rank++) {
    const has = (groups.get(rank)?.length ?? 0) >= 2;
    if (has) pairs++;
    // A 2 may be one of six pairs but is in no đôi thông, so the run breaks there.
    const inRun = has && rank !== TWO;
    run = inRun ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  if (longest >= 5) return INSTANT.fivePairs;
  if (pairs >= 6) return INSTANT.sixPairs;

  return null;
}

/// Whether a hand really holds these cards. A widget is a file anybody can edit, so the cards
/// somebody says they are playing are checked against the ones they were dealt.
export const holdsAll = (hand, cards) => cards.every((card) => hand.includes(card));

// ---- everything a hand could put down ----------------------------------------------------

/// Cards of a rank, low suit first.
function byRank(hand) {
  const groups = new Map();
  for (const card of [...hand].sort((a, b) => a - b)) {
    const rank = rankOf(card);
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank).push(card);
  }
  return groups;
}

const pick = (cards, take) => {
  // Every way of taking `take` cards out of at most four. Written out rather than recursed
  // because the four suits are the whole of the problem and a general combination generator
  // would be more code than the thing it generates.
  const out = [];
  const walk = (start, chosen) => {
    if (chosen.length === take) { out.push([...chosen]); return; }
    for (let i = start; i < cards.length; i++) {
      chosen.push(cards[i]);
      walk(i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return out;
};

/**
 * Every play worth considering out of this hand.
 *
 * Not every play there is. A run of five has up to 4⁵ ways of being made and all but two of
 * them are the same move played with better cards thrown away — so a run is offered twice:
 * once made of the lowest card at each rank, and once with the top rank's highest card
 * instead. The second is not an optimisation, it is the difference between beating a run by a
 * suit and not being able to.
 *
 * Sorted by size then by top card, so whoever reads this list first sees the cheapest thing
 * in it.
 */
export function movesFrom(hand) {
  const groups = byRank(hand);
  const moves = [];
  const add = (cards) => {
    const shape = shapeOf(cards);
    if (shape) moves.push({ cards: [...cards].sort((a, b) => a - b), shape });
  };

  for (const [, cards] of groups) {
    for (const card of cards) add([card]);
    for (const take of [2, 3, 4]) {
      if (cards.length >= take) for (const some of pick(cards, take)) add(some);
    }
  }

  // Runs, and runs of pairs. Both stop at the ace: a 2 cannot be in either, so a run that
  // would reach one simply ends before it.
  for (let start = 0; start < TWO; start++) {
    for (let length = 3; start + length <= TWO; length++) {
      const ranks = Array.from({ length }, (_, i) => start + i);
      if (!ranks.every((rank) => (groups.get(rank)?.length ?? 0) >= 1)) break;

      const low = ranks.map((rank) => groups.get(rank)[0]);
      add(low);
      const highest = groups.get(ranks[length - 1]).at(-1);
      if (highest !== low[length - 1]) add([...low.slice(0, -1), highest]);
    }

    for (let pairs = 3; start + pairs <= TWO; pairs++) {
      const ranks = Array.from({ length: pairs }, (_, i) => start + i);
      if (!ranks.every((rank) => (groups.get(rank)?.length ?? 0) >= 2)) break;

      const low = ranks.flatMap((rank) => groups.get(rank).slice(0, 2));
      add(low);
      const top = groups.get(ranks[pairs - 1]);
      if (top.length > 2) add([...low.slice(0, -2), ...top.slice(-2)]);
    }
  }

  return moves.sort((a, b) => a.cards.length - b.cards.length || a.shape.top - b.shape.top);
}

/// Whether anything in this hand answers what is on the table.
export const canAnswer = (hand, pile) =>
  movesFrom(hand).some((move) => beats(move.shape, pile));

/**
 * Every way this hand could be cut into plays.
 *
 * Not the same list as `movesFrom`, and for one reason: two runs side by side. A hand holding
 * 5♠5♣ 6♠6♣ 7♠7♣ is two straights, but `movesFrom` offers the straight made of the lowest card
 * at each rank and one variant made with the top rank's highest — it never offers the second
 * whole straight, because for *playing* one there is no reason to. For cutting a hand up there
 * is every reason: a hand that is two runs goes out in two plays and a hand that is one run and
 * six loose cards goes out in seven, and telling those apart is most of what good play is.
 *
 * So runs are peeled: as many parallel copies as the thinnest rank in them allows.
 */
function partsOf(hand) {
  const groups = byRank(hand);
  const parts = [];
  const add = (cards) => { if (shapeOf(cards)) parts.push(cards); };

  for (const [, cards] of groups) {
    for (const card of cards) add([card]);
    for (const take of [2, 3, 4]) {
      if (cards.length >= take) for (const some of pick(cards, take)) add(some);
    }
  }

  for (let start = 0; start < TWO; start++) {
    for (let length = 3; start + length <= TWO; length++) {
      const ranks = Array.from({ length }, (_, i) => start + i);
      const counts = ranks.map((rank) => groups.get(rank)?.length ?? 0);
      if (counts.some((many) => many < 1)) break;
      for (let copy = 0; copy < Math.min(...counts); copy++) {
        add(ranks.map((rank) => groups.get(rank)[copy]));
      }
    }

    for (let pairs = 3; start + pairs <= TWO; pairs++) {
      const ranks = Array.from({ length: pairs }, (_, i) => start + i);
      const counts = ranks.map((rank) => groups.get(rank)?.length ?? 0);
      if (counts.some((many) => many < 2)) break;
      for (let copy = 0; copy + 2 <= Math.min(...counts); copy += 2) {
        add(ranks.flatMap((rank) => groups.get(rank).slice(copy, copy + 2)));
      }
    }
  }

  return parts;
}

/**
 * The fewest plays this hand can be emptied in, and the fewest for every part of it.
 *
 * Tiến lên is won by whoever runs out of turns to need, not by whoever holds the best cards: a
 * hand that goes down in five plays beats a hand that goes down in eight and has two 2s in it,
 * most of the time and for the whole of a session. That number is what the machine was missing
 * — it scored one play at a time and had no idea what the hand it was left with looked like.
 *
 * Worked out exactly rather than guessed, because it is cheap enough to. A hand is at most
 * thirteen cards, so there are at most 2¹³ = 8.192 ways to have some of it left, and each of
 * them only has to consider the plays that use its own lowest card — the lowest card has to go
 * down in *something*. That is a few thousand steps, once a turn.
 *
 * Reading it back: `plan.left[mask]` is the plays still needed to shed the cards in `mask`.
 */
export function decompose(hand) {
  const n = hand.length;
  const order = [...hand].sort((a, b) => a - b);
  const index = new Map(order.map((card, i) => [card, i]));
  const full = n === 0 ? 0 : (1 << n) - 1;

  const byLowest = Array.from({ length: Math.max(n, 1) }, () => []);
  for (const cards of partsOf(order)) {
    let mask = 0;
    for (const card of cards) mask |= 1 << index.get(card);
    byLowest[31 - Math.clz32(mask & -mask)].push(mask);
  }

  const left = new Uint8Array(1 << n);
  for (let mask = 1; mask <= full; mask++) {
    const low = 31 - Math.clz32(mask & -mask);
    let best = 255;
    for (const part of byLowest[low]) {
      if ((part & mask) !== part) continue;
      const after = left[mask ^ part];
      if (after + 1 < best) best = after + 1;
    }
    left[mask] = best;
  }

  return { left, index, full, plays: n ? left[full] : 0 };
}

/// How many plays would be left after putting these cards down. Null if they are not all in the
/// hand this plan was made from.
export function playsAfter(plan, cards) {
  let mask = 0;
  for (const card of cards) {
    const bit = plan.index.get(card);
    if (bit === undefined) return null;
    mask |= 1 << bit;
  }
  return plan.left[plan.full ^ mask];
}

/**
 * Whether anything still out there answers this.
 *
 * `seen` is what has been played, face up, in front of everybody — never anybody's hand. A
 * machine that looked at the hands would win every game and be no fun for one, and it would be
 * cheating for two; the whole of what it is allowed to know is what it watched go down.
 */
export function unbeatable(shape, hand, seen) {
  if (!shape || !seen) return false;

  const gone = new Set([...seen, ...hand]);
  const outstanding = [];
  for (let card = 0; card < 52; card++) if (!gone.has(card)) outstanding.push(card);

  // Anything left that answers this, played by somebody holding all of what is left. The
  // strongest possible reading of what could be out there, which is the only safe one.
  return !movesFrom(outstanding).some((move) => beats(move.shape, shape));
}

/**
 * What a play costs, in the only currency that matters: turns.
 *
 * The first term is the whole idea. Every other term is a nudge on top of it, and a nudge is
 * all they should be — a machine that dodges a 2 into a hand that now needs three more turns
 * has traded the game for a card.
 *
 * `plan` and `base` come from `decompose`. Left out — as the tests call it — the shape of the
 * hand is still read, just more coarsely.
 */
export function costOf(move, hand, opts = {}) {
  const { plan = null, seen = null, pile = null, lowest = 13 } = opts;
  let cost = 0;

  if (plan) {
    const after = playsAfter(plan, move.cards);
    const base = plan.plays;
    // Turns left afterwards, weighted so that nothing else can outvote it, and a penalty for a
    // play that is not part of any best way through the hand.
    cost += after * 100;
    cost += after === base - 1 ? 0 : 40;
  } else {
    cost += move.shape.top - move.cards.length * 6;
    const groups = byRank(hand);
    for (const [, cards] of groups) {
      const taken = move.cards.filter((card) => cards.includes(card)).length;
      if (taken === 0 || taken === cards.length) continue;
      if (cards.length === 4) cost += 100;
      else if (cards.length === 3 && taken === 1) cost += 15;
    }
  }

  // Ties broken by the smaller card, which is what keeps the big ones for later.
  cost += move.shape.top / 8;

  const two = rankOf(move.shape.top) === TWO;
  if (two) cost += 45;
  if (isBomb(move.shape)) cost += 90;

  // Cutting. A bomb landing on a 2 is not a bomb spent, it is a 2 taken off somebody — and if
  // the hand was going to play that bomb as one piece anyway, it costs nothing but the moment.
  if (pile && isChop(move.shape, pile)) cost -= 55 + bombRank(pile) * 10;

  // Leading with something nobody can answer keeps the lead, and the lead is how a hand ends.
  if (!pile && seen && unbeatable(move.shape, hand, seen)) cost -= 35;

  // Somebody is one card away. Holding anything back is holding it for a hand that is over.
  if (lowest <= 1) {
    if (two) cost -= 45;
    if (isBomb(move.shape)) cost -= 90;
    // Lead something they cannot answer with one card.
    if (!pile) cost -= move.cards.length > 1 ? 60 : 0;
  }

  return cost;
}

/**
 * What the machine does with its turn.
 *
 * Returns the cards to play, or null to pass.
 *
 * `lowest` is the fewest cards anybody else is holding and `seen` is what has been played in
 * front of everybody. Those two are the whole of what it is told: it never sees a hand but its
 * own, and there is no argument it could make from one.
 *
 * Not a search over the game. Tiến lên rewards cutting your own hand up well and spending the
 * big cards on the right round, and both of those are answerable from one side of the table.
 */
export function chooseMove(hand, pile, { lowest = 13, mustInclude = null, seen = null } = {}) {
  let moves = movesFrom(hand).filter((move) => beats(move.shape, pile));

  if (mustInclude !== null) {
    moves = moves.filter((move) => move.cards.includes(mustInclude));
  }
  if (!moves.length) return null;

  // Anything that empties the hand ends the game for this player, and nothing else is worth
  // comparing against that.
  const out = moves.find((move) => move.cards.length === hand.length);
  if (out) return out.cards;

  const plan = decompose(hand);
  const scored = moves
    .map((move) => ({ move, cost: costOf(move, hand, { plan, seen, pile, lowest }) }))
    .sort((a, b) => a.cost - b.cost);

  const cheapest = scored[0];

  if (!pile) {
    // Leading. A bomb led into an empty table cuts nothing — it is four cards traded for one
    // round — so it is never the opening unless it is also the way out, which was answered
    // above, or unless somebody is one card from ending it.
    if (lowest <= 1) return cheapest.move.cards;
    const ordinary = scored.find(({ move }) => !isBomb(move.shape));
    return (ordinary ?? cheapest).move.cards;
  }

  // Following, and able to. Whether it is worth it is the only question left.
  const shape = cheapest.move.shape;
  const spendy = isBomb(shape) || rankOf(shape.top) === TWO;
  if (!spendy) return cheapest.move.cards;

  // Somebody about to go out takes the game with them, and a bomb kept for later is a bomb kept
  // for nobody.
  if (lowest <= 2) return cheapest.move.cards;

  // A chặt is worth taking on its own account — it takes a 2 or a bomb off somebody who was
  // counting on it — but only once the hand is short enough that the bomb has nothing better to
  // wait for.
  const chopping = isChop(shape, pile);
  const free = playsAfter(plan, cheapest.move.cards) === plan.plays - 1;
  if (chopping && free && (bombRank(pile) >= 1 || hand.length <= 8)) return cheapest.move.cards;

  return null;
}

// ---- the table, as functions with no opinions about chat ---------------------------------

/// How long somebody may think before the bot takes their turn.
///
/// A table with somebody asleep at it looks exactly like a table where somebody is counting
/// their cards, and the other three have no way to tell which they are in. Shorter than caro's
/// minute because three people are waiting rather than one.
export const TURN_MS = 30_000;

/// How long a finished table waits for everybody to say they want another.
export const REMATCH_MS = 120_000;

/// How long a table nobody ever sat down at stays open.
export const LOBBY_MS = 300_000;

/// How long the machine pauses before it plays.
///
/// A card that lands in the same instant as your own does not read as somebody playing, it
/// reads as the screen redrawing. Three machines answering together at a four-handed table is
/// the case this is really for.
export const THINK_MS = Number(process.env.TIENLEN_THINK_MS ?? 900);

/// Where somebody came in the order. Fourth is "bét" whatever the table size — the name is for
/// the person left holding cards, not for a place number.
export const PLACES = ['Nhất', 'Nhì', 'Ba', 'Bét'];

export const placeName = (place, players) =>
  place === players - 1 ? 'Bét' : PLACES[place] ?? `Thứ ${place + 1}`;

/// The names the machines play under.
///
/// Names rather than "Máy 1", because three rows reading Máy 1, Máy 2, Máy 3 is a list of
/// processes and the point of sitting down is that it should feel like a table.
export const MACHINES = ['Tư Ròm', 'Út Mập', 'Ba Gà', 'Năm Lì', 'Sáu Bảnh'];

/**
 * The next seat that still has to answer what is on the table.
 *
 * Never the seat it is asked about — the loop stops one short of a full turn — which is what
 * makes "nobody left to answer" a real answer rather than the same player being handed the
 * turn back for ever.
 */
export function nextInRound(hands, passed, from) {
  for (let step = 1; step < hands.length; step++) {
    const seat = (from + step) % hands.length;
    if (hands[seat].length && !passed.has(seat)) return seat;
  }
  return null;
}

/// The next seat still holding cards, wrapping all the way round to `from` itself.
export function nextActive(hands, from) {
  for (let step = 1; step <= hands.length; step++) {
    const seat = (from + step) % hands.length;
    if (hands[seat].length) return seat;
  }
  return null;
}

/**
 * Who opens, and the card their first play has to contain.
 *
 * Whoever holds the three of spades, which is the rule everybody knows. But at a table of two
 * or three only twenty-six or thirty-nine cards are dealt and the three of spades may be in
 * the half of the deck nobody got — so it is really *the lowest card in play*, which at a full
 * table is the three of spades and at a short one is whatever took its place.
 *
 * Returning both together on purpose. They were two lookups in two places to begin with, and
 * a short table opened on the seat holding the lowest card while demanding a card nobody had.
 */
export function opensGame(hands) {
  let seat = -1;
  let card = 52;
  hands.forEach((hand, index) => {
    // Hands are dealt sorted, so the first card is the lowest one.
    if (hand.length && hand[0] < card) { card = hand[0]; seat = index; }
  });
  return { seat, card };
}

/// How many people are still holding cards.
export const stillIn = (hands) => hands.filter((hand) => hand.length).length;

/// The fewest cards anybody but this seat is holding — what tells the machine whether to spend
/// a bomb now or keep it for a round that may not come.
export const lowestElsewhere = (hands, seat) => Math.min(
  ...hands.map((hand, i) => (i === seat || !hand.length ? 99 : hand.length)), 99);
