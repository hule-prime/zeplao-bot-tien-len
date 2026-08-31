// A bot that deals tiến lên miền nam in a group.
//
//   ZEPLAO_BOT_TOKEN=... node bots/tienlenbot/tienlenbot.mjs
//
// Add it to a group, then say `@tienlen` or `/tienlen`. Whoever asks gets their own lobby:
// open a table for two, three or four and let the room fill it, or sit down against the
// machine straight away. Everybody else in the room can see the tables that are open and
// take a seat in one without being invited.
//
// The table is a widget: a page the bot ships, opened in a frame in the chat. The cards are
// HTML rather than a canvas, because thirteen cards fanned across a phone want a hit box
// each and a canvas would have to work them out by hand.
//
// The bot keeps the rules and the deck. The widget draws what it is told and reports what
// somebody tapped; it decides nothing, because it is a file anybody can edit — and here that
// matters more than it did for caro, since a widget that dealt its own cards could deal
// itself better ones.
//
// **Nobody is ever sent anybody else's hand.** Thirteen cards go to one person with
// `pushState`'s `to`, and the table everybody sees carries counts. This is the one bug in a
// card game that nobody notices until somebody opens the network tab, and by then people
// have been cheating for a week.
//
// No framework, no dependencies, no build. The whole of it is one long poll and some pushes.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

/// Where the app is. Its own hostname rather than `kuku.vn` — a bot is third-party code with
/// unpredictable volume, and keeping it off the name people are using is what lets it be
/// throttled, measured and moved without anybody changing a line.
export const API = process.env.ZEPLAO_BOT_API ?? 'https://api-bot.kuku.vn';

/// Where the table of who has won what lives.
///
/// The bot's own, on the bot's own side — the app stores nothing for a bot. Everything else
/// here is in memory on purpose, because a game is a conversation happening now and a restart
/// should forget one. A record of who has won is the opposite.
const SCORES = process.env.TIENLEN_SCORES ?? '/app/data/scores.json';

/// How many names a table shows.
export const TABLE_SIZE = 20;

// ---- the cards ------------------------------------------------------------------------------

/// Low to high, which is the whole of the ordering.
///
/// A card is one number, `rank * 4 + suit`, and that number *is* its strength: 3♠ is 0 and 2♥
/// is 51. Every comparison in the game — a higher single, a higher pair, a longer run — is
/// then `>` on an integer, and there is no second place for the ordering to be written down
/// differently.
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

/// Bích, chuồn, rô, cơ. The suit breaks a tie between equal ranks and nothing else.
export const SUITS = ['♠', '♣', '♦', '♥'];

/// The rank that cannot be in a run, and the one every bomb exists to cut.
export const TWO = 12;

export const rankOf = (card) => Math.floor(card / 4);
export const suitOf = (card) => card % 4;
export const nameOf = (card) => RANKS[rankOf(card)] + SUITS[suitOf(card)];

export const deck = () => Array.from({ length: 52 }, (_, i) => i);

/**
 * A deal, shuffled.
 *
 * Thirteen each however many are sitting down, and the rest of the deck is simply not used.
 * That is how the game is played at a short table: three people are not dealt seventeen
 * cards, they are dealt thirteen and the game is quicker.
 *
 * `Math.random` rather than `crypto`, and it is worth saying why: the shuffle is not a secret
 * that anybody could act on. The hands are dealt in one go and never re-dealt from a seed
 * somebody could watch, so predicting the generator predicts nothing that has not already
 * happened.
 */
export function deal(players, random = Math.random) {
  const cards = deck();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return Array.from({ length: players }, (_, seat) =>
    cards.slice(seat * 13, seat * 13 + 13).sort((a, b) => a - b));
}

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

/// A single 2, and a pair of them. The two things a bomb is allowed to cut out of turn.
const isLoneTwo = (shape) => shape.kind === 'single' && rankOf(shape.top) === TWO;
const isPairOfTwos = (shape) => shape.kind === 'pair' && rankOf(shape.top) === TWO;

/**
 * Whether `mine` may be put on top of `theirs`.
 *
 * Two ways: the same shape but higher, or a chặt. The ladder of chặt is the one every table
 * in the south plays to —
 *
 *   ba đôi thông   cuts a lone 2
 *   tứ quý         cuts a lone 2, a pair of 2s, and ba đôi thông
 *   bốn đôi thông  cuts all of those and tứ quý
 *
 * Nothing cuts bốn đôi thông but a higher one. Two bombs of the same kind are compared by
 * their highest card like anything else, which the first branch already does — so the ladder
 * only ever has to answer about bombs of *different* kinds.
 */
export function beats(mine, theirs) {
  if (!mine) return false;
  if (!theirs) return true;

  if (mine.kind === theirs.kind && mine.size === theirs.size) return mine.top > theirs.top;

  const threePairs = (s) => s.kind === 'pairs_run' && s.pairs === 3;
  const fourPairs = (s) => s.kind === 'pairs_run' && s.pairs === 4;

  if (threePairs(mine)) return isLoneTwo(theirs);
  if (mine.kind === 'quad') {
    return isLoneTwo(theirs) || isPairOfTwos(theirs) || threePairs(theirs);
  }
  if (fourPairs(mine)) {
    return isLoneTwo(theirs) || isPairOfTwos(theirs) || threePairs(theirs)
      || theirs.kind === 'quad';
  }

  return false;
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
 * How much it costs to play these cards now.
 *
 * Lower is better, and the whole of the machine's judgement is here. Three things are traded
 * off: getting rid of cards is the point of the game, a 2 is the card that wins a round
 * nobody else can, and a bomb is the last word in a hand and worth nothing once spent.
 *
 * Breaking up a bomb to make a smaller play is the mistake a greedy player makes and the one
 * that loses the endgame — a tứ quý split into a pair is a pair, and the 2 it was being kept
 * for goes down unanswered.
 */
export function costOf(move, hand) {
  let cost = move.shape.top - move.cards.length * 6;

  if (rankOf(move.shape.top) === TWO) cost += 60;
  if (isBomb(move.shape)) cost += 120;

  // What this leaves behind. A pair taken out of four of a kind is four cards' worth of bomb
  // spent on two cards' worth of play.
  const groups = byRank(hand);
  for (const [rank, cards] of groups) {
    const taken = move.cards.filter((card) => rankOf(card) === rank).length;
    if (taken === 0 || taken === cards.length) continue;
    if (cards.length === 4) cost += 100;
    else if (cards.length === 3 && taken === 1) cost += 15;
  }

  return cost;
}

/**
 * What the machine does with its turn.
 *
 * Returns the cards to play, or null to pass. `lowest` is the fewest cards anybody else is
 * holding, which is the only thing that makes spending a 2 or a bomb worth it: somebody about
 * to go out takes the game with them, and a bomb kept for later is a bomb kept for nobody.
 *
 * Not a search. Tiến lên rewards holding on to the right cards rather than reading three
 * moves ahead, and a machine that plays its cheapest legal card and keeps its weapons for
 * somebody who is nearly out is a machine that beats most people at the table.
 */
export function chooseMove(hand, pile, { lowest = 13, mustInclude = null } = {}) {
  let moves = movesFrom(hand).filter((move) => beats(move.shape, pile));

  if (mustInclude !== null) {
    moves = moves.filter((move) => move.cards.includes(mustInclude));
  }
  if (!moves.length) return null;

  // Anything that empties the hand ends the game for this player, and nothing else is worth
  // comparing against that.
  const out = moves.find((move) => move.cards.length === hand.length);
  if (out) return out.cards;

  const scored = moves
    .map((move) => ({ move, cost: costOf(move, hand) }))
    .sort((a, b) => a.cost - b.cost);

  const cheapest = scored[0];

  if (!pile) {
    // Leading. A bomb led into an empty table cuts nothing — it is four cards traded for one
    // round — so it is never the opening unless it is also the way out, which was answered
    // above.
    const ordinary = scored.find(({ move }) => !isBomb(move.shape));
    return (ordinary ?? cheapest).move.cards;
  }

  // Following, and able to. Whether it is worth it is the only question left.
  const expensive = isBomb(cheapest.move.shape) || rankOf(cheapest.move.shape.top) === TWO;
  if (expensive && lowest > 2) return null;

  return cheapest.move.cards;
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

// ---- the gold -------------------------------------------------------------------------------

/// What somebody has the first time they open this.
///
/// Enough to sit down at anything on the list and lose a couple of hands without being sent to
/// an advertisement — a first table that has to be paid for before it can be played is a game
/// nobody gets to the middle of.
export const STARTING_GOLD = 20_000;

/// What turning up is worth, once a day.
export const DAILY_GOLD = 10_000;

/// What a table against the machines is played for.
///
/// Fixed, and deliberately not the room's stake. A table anybody can open at any stake and then
/// fill with machines is a table that prints gold — the machines do not mind what they lose.
///
/// The ladder scales with it on its own: `payouts` is a share of one stake, so nhất takes this
/// and nhì takes half of it whatever this number is.
export const BOT_STAKE = 4_000;

/// The three a table can be opened at with one tap. Anything between the floor and the ceiling
/// can be typed instead — these are the common answers, not the only ones.
export const STAKES = [1_000, 5_000, 20_000];

/// The floor and the ceiling for a table between people.
///
/// A floor because a table for nothing is not a table. A ceiling because the number arrives
/// from a page anybody can edit, and a stake nobody could ever cover is a room on everybody's
/// list that nobody can sit at.
export const MIN_STAKE = 1_000;
export const MAX_STAKE = 1_000_000;

/// What somebody may open a table at, whatever they typed.
export function asStake(asked) {
  const want = Math.round(Number(asked));
  if (!Number.isFinite(want)) return MIN_STAKE;
  return Math.max(MIN_STAKE, Math.min(MAX_STAKE, want));
}

/// The advertisement: how long it runs, what it pays, and how many in a day.
///
/// The ten seconds are counted here and not in the page. A widget is a file anybody can edit,
/// so a countdown it runs is a countdown it can skip — the page shows the clock and the bot
/// decides whether it ran.
///
/// What it pays is one hand against the machines, and that is not a coincidence: this exists to
/// get somebody who has run out back to a table, and an advertisement that leaves them still
/// short of the cheapest thing on the screen has not done its one job. It used to pay two
/// thousand against a two thousand table; when the table went to four, this had to follow.
///
/// The count came down as the payment went up, so a day's worth of watching is worth the same
/// forty thousand it was — twice the gold in half the advertisements.
export const ADS_MS = Number(process.env.TIENLEN_ADS_MS ?? 10_000);
export const ADS_GOLD = BOT_STAKE;
export const ADS_PER_DAY = 10;

/// Below this there is no table anybody can sit at. Not a gate on anything — the way to more
/// gold is beside the purse at every balance — but the widget draws the two ways in dark and
/// says what they cost, and this is the number it says it about.
export const BROKE = BOT_STAKE;

/**
 * What each place takes, as a share of one stake.
 *
 * First takes a stake off last; at a full table second takes half a one off third. It adds to
 * nothing — gold moves between the people at the table and none is made — which is the only
 * shape that stays sane when the same four people play all evening.
 *
 * The middle of an odd table breaks even, because second of three is neither winning nor
 * losing and paying it either way would make one of those a lie.
 */
export function payouts(count) {
  if (count === 2) return [1, -1];
  if (count === 3) return [1, 0, -1];
  if (count >= 4) return [1, 0.5, -0.5, -1];
  return [0];
}

/// The day, in Vietnam.
///
/// A day that turns over in UTC turns over at seven in the morning here, so somebody playing
/// after dinner gets tomorrow's gold and somebody playing at breakfast does not get today's.
export const dayIn = (at = Date.now()) =>
  new Date(at + 7 * 3600_000).toISOString().slice(0, 10);

/// Gold, written the way it is read here: 12.500.
export function gold(amount) {
  const digits = String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (amount < 0 ? '-' : '') + digits;
}

/**
 * Who pays whom at the end of a table, and how much.
 *
 * Two different tables wearing the same clothes, and the difference is how many people are at
 * them.
 *
 * **Two or more people**: played for the room's stake, between the people, in the order they
 * went out. The machines sitting in the empty seats are furniture — whoever went out first of
 * the people has won, whatever the machines did, so two people and two machines is a table of
 * two and first takes a stake off second.
 *
 * **One person**: a table against the machines, whatever it was opened as. The ranking is the
 * whole table, and the stake is the house's rather than the room's.
 *
 * Pure, and given the seats rather than a game, because this is the part that is worth being
 * able to run a hundred finishing orders through without a chat anywhere near it.
 */
export function settlement(seats, finished, stake) {
  const people = seats.filter((one) => !one.bot);
  if (!people.length) return [];

  // How many are being paid comes from who is *at* the table, not from who has finished — so
  // this answers the same way after one person is out as it will at the end. That is what lets
  // the table show somebody what they won at the moment they won it rather than a minute later
  // when the last two have stopped arguing over a pair of threes.
  const alone = people.length < 2;
  const share = payouts(alone ? seats.length : people.length);
  const worth = alone ? BOT_STAKE : stake;

  const order = finished.map((seat) => seats[seat]).filter(Boolean);
  const ranked = alone ? order : order.filter((one) => !one.bot);

  const paid = [];
  ranked.forEach((who, place) => {
    if (who.bot) return;
    paid.push({
      userId: who.userId,
      displayName: who.displayName,
      // Where they came *among the people who are being paid*, which at a table of two people
      // and two machines is first or second and never third.
      place: placeName(place, alone ? seats.length : people.length),
      change: Math.round((share[place] ?? 0) * worth),
    });
  });
  return paid;
}

// ---- bầu cua tôm cá ---------------------------------------------------------------------------

/**
 * The six faces, in the order they sit on a board.
 *
 * Kept as names rather than numbers because the widget draws each of them and the state has to
 * say which is which. Three dice, six faces, and everything below is counting.
 */
export const FACES = ['bau', 'cua', 'tom', 'ca', 'ga', 'nai'];

export const FACE_NAMES = {
  bau: 'Bầu', cua: 'Cua', tom: 'Tôm', ca: 'Cá', ga: 'Gà', nai: 'Nai',
};

/// How many dice are thrown. Three, and the whole shape of the game is that number.
export const DICE = 3;

/// How long the bowl is shaking for.
///
/// Long enough to be a throw rather than a number appearing, short enough that nobody watching
/// four rounds in a row starts wishing it were shorter. The dice are decided at the end of it
/// and not the start: what the bot has not worked out yet is not in any push anybody could read.
export const ROLL_MS = Number(process.env.TIENLEN_ROLL_MS ?? 1_600);

/// How long a finished throw stays up before the next round opens.
export const SHOW_MS = Number(process.env.TIENLEN_SHOW_MS ?? 3_500);

/// How long a table with more than one person at it takes bets for.
export const BETTING_MS = Number(process.env.TIENLEN_BETTING_MS ?? 25_000);

/// What may be put on a face in one tap.
export const CHIPS = [1_000, 5_000, 20_000];

/// The one sòng everybody shares. A fixed name rather than a counted one, because there is
/// exactly one of it and it has to be findable without being looked up.
export const WORLD = 'world';

/// How many people fit round one board. Wider than a card table because nobody takes turns —
/// everybody is betting on the same three dice at the same time.
export const BAUCUA_SEATS = 8;

/// Three dice.
export function roll(random = Math.random) {
  return Array.from({ length: DICE }, () => FACES[Math.floor(random() * FACES.length)]);
}

/**
 * What one stake on one face is worth once the dice have landed.
 *
 * The rule everybody at a pavement table knows: the stake comes back with as much again for
 * every die showing that face, and goes if none of them do. So a thousand on cua is worth a
 * thousand, two, or three — or nothing at all, three times out of four.
 *
 * Returned as the *change* to somebody's gold, which is what the ledger moves by: `+n × stake`
 * on a hit and `−stake` on a miss. Not "stake back plus winnings", because there is no moment
 * here where the stake has left and might come back — nothing is taken until this says so.
 */
export function faceWorth(stake, face, dice) {
  if (!stake) return 0;
  const hits = dice.filter((one) => one === face).length;
  return hits ? stake * hits : -stake;
}

/**
 * What a whole board of stakes is worth to one person.
 *
 * `bets` is a face-to-stake object, and faces nobody put anything on are simply not in it.
 */
export function boardWorth(bets, dice) {
  let change = 0;
  for (const face of FACES) change += faceWorth(bets?.[face] ?? 0, face, dice);
  return change;
}

/// Everything staked on this board, which is the most it can lose.
export const staked = (bets) =>
  FACES.reduce((sum, face) => sum + (bets?.[face] ?? 0), 0);

/// Which faces came up, and how many times each. What the widget lights up.
export function tally(dice) {
  const counted = {};
  for (const face of dice) counted[face] = (counted[face] ?? 0) + 1;
  return counted;
}

// ---- what the room is told ----------------------------------------------------------------

export const SAY = {
  greeting: (handle) => `Chào cả nhà. Gõ @${handle} để mở bàn tiến lên miền nam.`,
  opened: (who, size, stake) =>
    `${who} mở bàn tiến lên ${size} người · cược ${gold(stake)} vàng.`,
  started: (names) => `Bàn tiến lên đã bắt đầu: ${names.join(', ')}.`,
  noGame: 'Bàn này không còn nữa.',
  full: 'Bàn này đã đủ người — bạn vào xem nhé.',
  startedAlready: 'Bàn này đã vào ván rồi — bạn vào xem nhé.',
  busy: 'Bạn đang ngồi ở một bàn. Rời bàn đó rồi mới vào bàn khác được nhé.',
  watching: 'Bạn đang xem bàn này.',
  openedBaucua: (who) => `${who} mở sòng bầu cua tôm cá — vào đặt đi.`,
  overBet: (purse) => purse > 0
    ? `Chỉ đặt được tối đa ${gold(purse)} vàng.`
    : 'Hết vàng để đặt rồi.',
  tooMany: 'Nhóm đang mở quá nhiều widget. Đợi một ván xong rồi thử lại nhé.',
  // Said with the number, because "not enough gold" leaves somebody to work out how much a
  // table they cannot see costs.
  tooPoor: (stake) => `Cần ${gold(stake)} vàng mới ngồi được bàn này.`,
};

/// The one button the room ever sees unprompted.
export const OPEN = { rows: [[{ text: 'Mở bàn', callbackData: 'open' }]] };

/// What an invitation offers, and what it becomes once the game is under way.
///
/// Which table, by name. A room can hold several at once, and a button that only said "join"
/// would seat whoever pressed it at whichever table the bot happened to find first.
export const JOIN = (gameId) => ({
  rows: [[{ text: 'Vào bàn', callbackData: `join:${gameId}` }]],
});
export const WATCH = (gameId) => ({
  rows: [[{ text: 'Xem', callbackData: `watch:${gameId}` }]],
});

// ---- the turn, as functions with no opinions about chat -------------------------------------
//
// Outside `run` on purpose, and this is the part worth being careful about. Everything below
// moves a table on from one legal position to the next, and there is no way to check that by
// looking at a screen: a round that ends one seat early looks exactly like a round that ended
// correctly. So it is written where a test can deal a thousand hands and play them out.

/**
 * Puts cards down, if they are cards this seat holds and they answer what is on the table.
 *
 * Every one of these checks is against something a widget said, and the widget is a file
 * anybody can edit. The shape is checked, then that the hand really holds them, then that
 * they beat what is there — in that order, because the cheapest refusal should be first and
 * because `shapeOf` is what rejects the same card sent four times as a tứ quý.
 */
export function applyPlay(game, seat, cards) {
  if (!Array.isArray(cards) || !cards.length || cards.length > 13) return false;

  const shape = shapeOf(cards);
  if (!shape) return false;
  if (!holdsAll(game.hands[seat], cards)) return false;
  if (game.pile && !beats(shape, game.pile.shape)) return false;

  // The opening play of a game has to contain the lowest card in play. At a full table that
  // is the three of spades, which is the rule everybody at a table in the south already
  // knows; at a short one it is whatever was dealt in its place.
  if (game.first && !cards.includes(game.opensWith)) return false;

  const played = new Set(cards);
  game.hands[seat] = game.hands[seat].filter((card) => !played.has(card));
  game.pile = { cards: [...cards].sort((a, b) => a - b), shape, seat };
  game.first = false;
  game.touched = Date.now();

  if (!game.hands[seat].length) game.finished.push(seat);

  // One person left holding cards is the end of it — there is nobody for them to beat.
  if (stillIn(game.hands) <= 1) { finish(game); return true; }

  advance(game, seat);
  return true;
}

/// Gives up the round. Not allowed while leading: an empty table has to be answered by
/// somebody, and a table where everybody passes is a table that never moves.
export function applyPass(game, seat) {
  if (!game.pile) return false;

  game.passed.add(seat);
  game.touched = Date.now();
  advance(game, seat);
  return true;
}

/**
 * Hands the turn on, and notices when there is nobody left to hand it to.
 *
 * The round is over when the next person who could answer *is the one who played last* —
 * not when everybody has passed, which is the same thing at a table of four and quietly
 * wrong at a table of two, where the leader has never passed and would be handed the turn
 * back for ever.
 */
export function advance(game, from) {
  const next = nextInRound(game.hands, game.passed, from);
  if (next === null || (game.pile && next === game.pile.seat)) {
    newRound(game, game.pile ? game.pile.seat : from);
    return;
  }
  game.turn = next;
}

/// Nobody answered, so whoever played last leads again — or, if that was their last card,
/// the next person still holding some.
export function newRound(game, winner) {
  game.pile = null;
  game.passed = new Set();

  const leader = game.hands[winner].length ? winner : nextActive(game.hands, winner);
  if (leader === null || stillIn(game.hands) <= 1) { finish(game); return; }

  game.turn = leader;
  game.touched = Date.now();
}

/// The end of it. Whoever is still holding cards comes last, which is the only place in the
/// order nobody plays for.
export function finish(game) {
  game.hands.forEach((hand, seat) => {
    if (hand.length && !game.finished.includes(seat)) game.finished.push(seat);
  });
  // And under them, whoever walked out. Otherwise the way never to come last is to leave
  // whenever the cards are bad, and a table where that works is a table of who quits
  // fastest rather than who plays best.
  for (const seat of game.left) {
    if (!game.finished.includes(seat)) game.finished.push(seat);
  }

  game.state = 'over';
  game.turn = null;
  game.pile = null;
  game.passed = new Set();
  game.ready = new Set();
  game.touched = Date.now();
}

// ---- the loop -------------------------------------------------------------------------------

/**
 * The bot, until it is told to stop.
 *
 * `signal` is how it is told. systemd sends SIGTERM on every restart and every deploy, and
 * without somewhere for that to land the process is killed in the middle of whatever it was
 * doing — most often a push, which leaves a table on four screens showing a card that was
 * played and a turn that never moved.
 *
 * `api` is a parameter rather than only an environment variable because the host is a fact
 * about this run of the bot, not about the module: a check that starts a stand-in on a free
 * port cannot know which port before the module it is testing has been loaded.
 */
export async function run(token, { signal, api = API } = {}) {
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function call(method, body) {
    const response = await fetch(`${api}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: auth,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    if (!response.ok) {
      throw new Error(`${method} answered ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  const me = await call('getMe');
  console.log(`@${me.username} is dealing`);

  await call('setCommands', {
    commands: [{ command: 'tienlen', description: 'Mở một bàn tiến lên miền nam' }],
  });

  // Reaching for this bot should not leave a line in the room. Asked for once, here, rather
  // than deleted afterwards on every mention: the message is never written at all, so nothing
  // appears for the moment before it would go.
  await call('setMe', { quietMention: true }).catch(() => {});

  // Anything left over from the last time this was running. The tables are in this process and
  // a restart forgets them; the sessions are on the server and did not. What that leaves is a
  // hand of cards on somebody's screen with buttons reaching a bot that has forgotten the game.
  const swept = await call('endSessions', {}).catch(() => ({ ended: 0 }));
  if (swept.ended) console.log(`cleared ${swept.ended} session(s) from a previous run`);


  /**
   * Which seat this person is in, or nothing if they are only watching.
   *
   * A function declaration rather than a `const`, and that is not a style choice: everything
   * after the endless loop below is never *executed*, so a `const` declared down there stays
   * in the temporal dead zone for the life of the process. Carobot lost three separate days to
   * exactly this, and there is a test at the bottom of the suite that keeps it from happening
   * again.
   */
  function seatOf(game, userId) {
    if (!game || !game.seats) return null;
    const seat = game.seats.findIndex((who) => who.userId === userId);
    return seat === -1 ? null : seat;
  }

  /**
   * Every table anywhere, by its own name.
   *
   * Not keyed by room, and not *in* one. A table is opened from a group and says so in that
   * group, but the people at it can be anywhere — see `screens` below for why that is
   * possible at all.
   */
  const games = new Map();
  let named = 0;

  /**
   * Every widget anybody has open, by its session.
   *
   * **One session per person, not one per table.** This is the load-bearing decision in the
   * file and it is worth the paragraph.
   *
   * A widget session belongs to a conversation, and `showSession` refuses to open one for
   * somebody who is not in that conversation — rightly, or any bot could put a strange room's
   * screen in front of anybody. A table with a session of its own is therefore a table only
   * its own room can ever play at, which makes "find a table anywhere" impossible.
   *
   * So a session belongs to a **person**, in that person's own room, and follows them: it
   * shows the lobby, then whichever table they sat down at, then the lobby again. A table is
   * pushed into as many sessions as there are people at it, and those people can be in four
   * different groups. Nothing crosses a room — every session stays in the room it was made in,
   * and only the picture of the table travels.
   *
   * It also removes `setSessionPlayers` entirely: a session has exactly one player, its owner.
   * Which means `role` on an incoming action says nothing useful, and every check below is
   * against the seat this bot dealt to rather than against what the frame reports.
   */
  const screens = new Map();          // sessionId -> screen
  const openBy = new Map();           // userId -> sessionId

  /**
   * Who has how much gold, kept on disk.
   *
   * The bot's own, on the bot's own side — the app stores nothing for a bot, and a table of
   * gold that started again at every deploy would be worth nothing. Everything else in this
   * process is in memory on purpose, because a game is a conversation happening now.
   */
  const scores = (() => {
    try {
      const read = JSON.parse(readFileSync(SCORES, 'utf8'));
      const kept = read && read.people ? read : { people: {}, offset: 0 };
      kept.greeted = kept.greeted ?? {};
      return kept;
    } catch {
      // No file yet, or one somebody edited into nonsense. An empty ledger is the honest
      // starting point — refusing to run because a scoreboard is missing would take the games
      // down with it.
      return { people: {}, offset: 0, greeted: {} };
    }
  })();

  /// Written after a beat rather than on every hand, and moved into place rather than written
  /// over, so a half-written ledger read back at the next start is stale rather than lost.
  let saving = null;

  /// Beside and moved into place, because a half-written ledger read back at the next start is
  /// a ledger stale rather than a ledger lost.
  function writeScores() {
    try {
      mkdirSync(SCORES.slice(0, SCORES.lastIndexOf('/')) || '.', { recursive: true });
      writeFileSync(`${SCORES}.tmp`, JSON.stringify(scores));
      renameSync(`${SCORES}.tmp`, SCORES);
    } catch (problem) {
      console.error(`could not write ${SCORES}: ${problem}`);
    }
  }

  function saveScores() {
    if (saving) return;
    saving = setTimeout(() => { saving = null; writeScores(); }, 2000);
  }

  /// Everything owed to the disk, now.
  ///
  /// The two seconds are so that ten tables finishing together write once. A bot being stopped
  /// has no next time, and what is sitting in that window is the last hand somebody won and how
  /// far through the updates this run got.
  function flushScores() {
    if (!saving) return;
    clearTimeout(saving);
    saving = null;
    writeScores();
  }

  /// Somebody's row, made the first time they are seen.
  function rowFor(userId, displayName) {
    const row = scores.people[userId]
      ?? {
        name: '', gold: STARTING_GOLD, started: true, games: 0, first: 0, last: 0,
        claimed: '', adsDay: '', ads: 0,
      };
    if (displayName) row.name = displayName;

    // Rows written before the day's gold became something you take rather than something you
    // are given. One field did both jobs; two do them separately, because somebody who never
    // presses the button should still get their advertisements back the next morning.
    if (row.claimed === undefined) row.claimed = row.day ?? '';
    if (row.adsDay === undefined) row.adsDay = row.day ?? '';

    // And rows written before there was a purse to start with. Given it once and marked, so a
    // restart cannot give it twice — the mark is the whole of what makes this safe to run on
    // every load.
    if (!row.started) {
      row.started = true;
      row.gold += STARTING_GOLD;
      saveScores();
    }

    scores.people[userId] = row;
    return row;
  }

  const goldOf = (userId) => rowFor(userId).gold;

  /// Whether the day's gold is there to be taken.
  const dailyReady = (userId) => rowFor(userId).claimed !== dayIn();

  /**
   * The day's gold, taken.
   *
   * A button rather than something that happens on the way in. Gold that arrives by itself is
   * gold nobody remembers arriving — the reason every game on a phone makes you press for it is
   * that pressing is what makes it yours.
   */
  function claimDaily(who) {
    const row = rowFor(who.userId, who.displayName);
    const day = dayIn();
    if (row.claimed === day) return 0;

    row.claimed = day;
    row.gold += DAILY_GOLD;
    saveScores();
    return DAILY_GOLD;
  }

  /// How many advertisements are left today, resetting on its own rather than on the back of
  /// the daily reward — somebody who never presses that button still gets a fresh morning.
  function adsLeft(userId) {
    const row = rowFor(userId);
    if (row.adsDay !== dayIn()) { row.adsDay = dayIn(); row.ads = 0; }
    return Math.max(0, ADS_PER_DAY - row.ads);
  }

  /**
   * Pays out a finished table.
   *
   * The arithmetic is `settlement`, which is pure and has its own tests. What is here is the
   * part that touches the ledger: never below nothing, and once per table however many times
   * this is reached.
   */
  function settle(game) {
    const owed = settlement(game.seats, game.finished, game.stake);

    for (const one of owed) {
      if (game.paidTo.has(one.userId)) {
        // Already paid. What actually moved can be less than the arithmetic says, because
        // nobody goes into debt — so what is shown from here on is what happened rather than
        // what was owed.
        one.change = game.paidTo.get(one.userId);
        continue;
      }

      const row = rowFor(one.userId, one.displayName);
      // The backstop for the seam between taking the stake at the door and paying at the end:
      // somebody who sat down with enough and then lost it at another table.
      if (one.change < 0) one.change = -Math.min(-one.change, row.gold);
      row.gold += one.change;
      row.games++;
      if (one.place === PLACES[0]) row.first++;
      if (one.place === 'Bét') row.last++;

      game.paidTo.set(one.userId, one.change);
      saveScores();
    }

    game.paid = owed;
  }

  /// The table of who has the most gold. The world's, and only the world's — a group's own
  /// board stopped meaning anything the moment tables stopped belonging to groups.
  function table() {
    return Object.entries(scores.people)
      .filter(([, row]) => row.games > 0)
      // Gold, and what orders it when two people have the same. `games` decides who is on the
      // board at all, above, and is not sent — nothing draws it.
      .map(([id, row]) => ({ id, name: row.name, gold: row.gold, first: row.first }))
      .sort((a, b) => b.gold - a.gold || b.first - a.first || a.name.localeCompare(b.name))
      .slice(0, TABLE_SIZE);
  }

  /// Tables still short of people, anywhere. The list somebody looking for a game is shown.
  const openTables = () => [...games.values()]
    .filter((game) => (game.state === 'lobby'
      // A bầu cua table is open for as long as it is running: there is no hand in progress to
      // wait out, only the next throw.
      || (game.kind === 'baucua' && game.state !== 'over'))
      && !game.solo && game.seats.length < game.size)
    .map((game) => ({
      id: game.id,
      kind: game.kind,
      size: game.size,
      stake: game.stake,
      names: game.seats.map((who) => who.displayName),
    }));

  /// And the ones under way, so somebody with nowhere to sit has something to watch. Not tables
  /// with a machine at them: watching one person play three programs is watching one person.
  const running = () => [...games.values()]
    .filter((game) => game.kind === 'tienlen' && game.state === 'playing' && !game.solo
      && game.seats.filter((one) => !one.bot).length > 1)
    .map((game) => ({
      id: game.id, kind: game.kind, names: game.seats.map((who) => who.displayName),
    }));

  /// The table this person is sitting at, if any. One at a time: somebody holding two hands is
  /// somebody six other people are waiting on.
  const seatedAt = (userId) => [...games.values()]
    .find((game) => (game.state === 'lobby' || game.state === 'playing')
      && seatOf(game, userId) !== null) ?? null;

  const screenFor = (userId) => screens.get(openBy.get(userId)) ?? null;

  /// Ends a session, and says which of the several reasons ended it.
  async function closeSession(sessionId, why) {
    if (!sessionId) return;
    console.log(`ending session ${sessionId}: ${why}`);
    await call('endSession', { sessionId }).catch(() => {});
  }

  function dropScreen(screen) {
    if (!screen) return;
    screens.delete(screen.sessionId);
    if (openBy.get(screen.userId) === screen.sessionId) openBy.delete(screen.userId);
  }

  // Rooms it is already in have already met it, whether or not anybody wrote that down. Marked
  // once on the way up, so rooms joined before there *was* a note of it can never be greeted a
  // second time either.
  //
  // Down here rather than up with the other start-up calls, because it reads `scores` — and
  // `scores` is a `const` declared further down, which up there is the temporal dead zone and
  // a bot that cannot start.
  // Everybody who was already playing, given the starting purse the people after them get.
  // `rowFor` would do it the next time each of them opened the widget anyway; done here so it
  // has happened by the time anybody looks, and so the log says how many.
  {
    const owed = Object.keys(scores.people).filter((id) => !scores.people[id].started);
    for (const id of owed) rowFor(id);
    if (owed.length) console.log(`gave ${owed.length} earlier player(s) their starting purse`);
  }

  const already = await call('getConversations').catch(() => []);
  if (Array.isArray(already)) {
    let fresh = 0;
    for (const room of already) {
      if (scores.greeted[room.id]) continue;
      scores.greeted[room.id] = true;
      fresh++;
    }
    if (fresh) { saveScores(); console.log(`already in ${fresh} room(s), no hellos owed`); }
  }

  // Armed here, above the loop, because nothing below the loop is ever executed. Carobot had
  // this line under its loop for weeks: every part of the sweep existed and was correct, and
  // the one statement that started it never ran, so no clock ever ticked.
  const beat = setInterval(() => {
    sweep().catch((problem) => console.error(String(problem)));
  }, 5_000);

  // Both above the loop, because there is nowhere below it to put them. The clock has to stop
  // when the bot does or the process will not exit, and a `clearInterval` written after the
  // loop is a statement after the loop.
  //
  // And the ledger goes to disk on the way out. Waiting two seconds is right while the bot is
  // running and wrong the moment it is told to stop: what is sitting in that window is the last
  // hand somebody won and how far through the updates this run got — and losing the second of
  // those is a deploy that replays an hour of updates at everybody.
  if (signal) {
    signal.addEventListener('abort', () => { clearInterval(beat); flushScores(); }, { once: true });
  }

  /**
   * Where the last run got to.
   *
   * `offset` on `getUpdates` is both the question and the acknowledgement, and there is no
   * other one — so a bot that starts again from nought is handed the whole ring back. Which is
   * exactly what happened on the first deploy anybody was using this: seven `opening for
   * thuongd` in a row and four `answerCallback answered 404`, because every `/tienlen` anybody
   * had said that hour was replayed and every button anybody had pressed was answered long
   * after its id had expired. From the room's side that is a widget opening itself on your
   * screen because somebody deployed.
   *
   * Kept beside the gold because that is the one file that survives a deploy. Losing the last
   * few seconds of it in a crash means replaying a handful of updates, which is the cheap
   * failure; the expensive one is replaying a hundred.
   */
  let offset = Number(scores.offset) || 0;
  if (offset) console.log(`carrying on from update ${offset}`);

  for (;;) {
    if (signal && signal.aborted) break;

    let updates;
    try {
      updates = await call(`getUpdates?offset=${offset}&timeout=30`);
    } catch (problem) {
      // A long poll cut off by the stop signal is not a failure worth two seconds and a line
      // in the journal. It is the bot being asked to stop, in the place it spends its life.
      if (signal && signal.aborted) break;
      console.error(String(problem));
      await wait(2000);
      continue;
    }

    for (const update of updates) {
      // Before the work, not after: an update that throws would otherwise come back for ever.
      offset = update.id;
      scores.offset = offset;
      saveScores();

      try {
        if (update.kind === 'bot_added') {
          await greet(update.membership);
        } else if (update.kind === 'bot_removed') {
          // Taken out of the room. If it is put back it is a new arrival and may say so.
          delete scores.greeted[update.membership.conversationId];
          saveScores();
        } else if (update.kind === 'message') {
          await onMessage(update.message);
        } else if (update.kind === 'callback_query') {
          await onPress(update.callback);
        } else if (update.kind === 'widget_action') {
          await onWidgetAction(update.widgetAction);
        }
      } catch (problem) {
        console.error(String(problem));
      }
    }
  }

  /**
   * Says hello, once, the first time it is put in a room.
   *
   * Written down on disk, and that is the whole point of it. `bot_added` is one of the updates
   * sitting in the ring, and anything that replays the ring says hello again — which for a
   * while was every deploy, in every room this bot is in. Being greeted by a program you added
   * last week because somebody pushed a fix is worse than never being greeted at all.
   *
   * Kept beside the gold because that is the file that survives a deploy; forgotten again on
   * `bot_removed`, because being put back really is arriving.
   */
  async function greet(membership) {
    const room = membership.conversationId;
    if (scores.greeted[room]) return;

    scores.greeted[room] = true;
    saveScores();
    await send(room, SAY.greeting(me.username), OPEN, membership.by?.userId);
  }

  async function onMessage(message) {
    // Only what was addressed to this bot. The platform already filters to `/tienlen` and
    // mentions, but a bot that opens a table for whatever arrives is one server change away
    // from dealing a hand every time somebody says anything in a one-to-one.
    if (!wantsGame(message)) return;
    console.log(`opening for ${message.from?.displayName ?? message.from?.userId}`);
    await openFor(message.conversationId, message.from);
  }

  /// Whether this message is asking for a table.
  function wantsGame(message) {
    if (message.command) return message.command.toLowerCase() === 'tienlen';

    // `text`, not `body`. What a bot is handed is not the message record the app draws, and
    // reading the wrong name gives an empty string that quietly fails every test below it.
    const said = (message.text ?? '').trim().toLowerCase();
    if (said.startsWith('/')) return false;   // somebody else's command, said in the room
    if (said.includes('@tienlen') || said.includes(`@${me.username}`.toLowerCase())) return true;

    return Boolean(message.replyToMessageId) || message.conversationType === 'direct';
  }

  /**
   * Opens this person's widget, making it if they have not got one.
   *
   * Theirs and not the room's, and it follows them: whatever they are doing is what it shows.
   * Asking again from a different group moves it — a session cannot be opened for somebody
   * outside its own conversation, so a person who wanders into another room needs a screen
   * there, and it picks up whatever table they were already at.
   */
  async function openFor(conversationId, who) {
    let screen = screenFor(who.userId);

    if (screen && screen.conversationId === conversationId) {
      // The session may be gone even though the screen is not: sessions live in the API's
      // memory and the API is replaced on every deploy. Notice and carry on rather than depend
      // on everything restarting together.
      const shown = await call('showSession', { sessionId: screen.sessionId, to: who.userId })
        .then(() => true)
        .catch(() => false);

      if (shown) {
        screen.displayName = who.displayName;
        screen.touched = Date.now();
        await pushTo(screen);
        return screen;
      }
    }

    const wasAt = screen ? screen.gameId : null;
    if (screen) {
      await closeSession(screen.sessionId, 'a screen replaced by one in another room');
      dropScreen(screen);
    }

    const session = await call('createSession', {
      conversationId,
      title: 'Tiến lên miền nam',
      userIds: [who.userId],
    }).catch(() => null);

    if (!session) {
      // Said to them and to nobody else. Somebody who typed the bot's name and got silence has
      // no way to tell a full room from a bot that is down — and with the mention itself
      // leaving no line, silence is all there would be.
      await send(conversationId, SAY.tooMany, null, who.userId);
      return null;
    }

    screen = {
      sessionId: session.id,
      userId: who.userId,
      displayName: who.displayName,
      conversationId,
      gameId: wasAt,
      adsAt: null,
      touched: Date.now(),
    };
    screens.set(screen.sessionId, screen);
    openBy.set(who.userId, screen.sessionId);

    await pushTo(screen);
    await call('showSession', { sessionId: screen.sessionId, to: who.userId }).catch(() => {});
    return screen;
  }

  async function onPress(callback) {
    const { conversationId, from, data, callbackId } = callback;

    // Which table this button belongs to, said by the button. A room can hold several, and the
    // invitation somebody is answering is the one they can see.
    const [what, gameId] = String(data ?? '').split(':');
    const game = gameId ? games.get(gameId) : null;

    if (what === 'open') {
      await openFor(conversationId, from);
      return answer(callbackId);
    }

    if (what === 'join' || what === 'watch') {
      if (!game) return answer(callbackId, SAY.noGame);
      const screen = await openFor(conversationId, from);
      if (!screen) return answer(callbackId);

      if (what === 'watch') {
        screen.gameId = game.id;
        await pushTo(screen);
        return answer(callbackId, SAY.watching);
      }
      return answer(callbackId, await sitDown(game, screen));
    }

    return answer(callbackId);
  }

  /**
   * Puts somebody in a free seat, or says why not.
   *
   * Reached three ways — the button in the room, the list of open tables on somebody's own
   * screen, and the same list in another group entirely — and they must not diverge, because
   * the refusals are the part people actually meet. Returns what to tell them, or nothing when
   * it simply worked.
   */
  async function sitDown(game, screen) {
    const who = { userId: screen.userId, displayName: screen.displayName };

    if (seatOf(game, who.userId) !== null) {
      screen.gameId = game.id;
      await pushTo(screen);
      return null;
    }

    // A bầu cua table takes anybody at any moment: there is no hand in progress to wait out,
    // only the next throw, and somebody who sits down mid-throw simply bets on the one after.
    const midRound = game.kind === 'baucua' && game.state !== 'over';

    if (game.state !== 'lobby' && !midRound) {
      // Not a refusal so much as a redirection: a table that has started is a table to watch.
      screen.gameId = game.id;
      await pushTo(screen);
      return game.state === 'playing' ? SAY.startedAlready : SAY.noGame;
    }

    if (game.seats.length >= game.size) return SAY.full;

    // Already at a table. Two hands at once means the people at both are waiting on one person,
    // and whichever table they are not looking at is the one that stops.
    const busy = seatedAt(who.userId);
    if (busy) {
      screen.gameId = busy.id;
      await pushTo(screen);
      return SAY.busy;
    }

    // The stake, in hand, before sitting down. Taking it at the end instead would let somebody
    // play four tables at once on one stake's worth of gold and lose all four.
    if (goldOf(who.userId) < game.stake) return SAY.tooPoor(game.stake);

    // No room on the seat. Where somebody is sitting *from* is a fact about their screen and
    // changes when they walk into another group; the seat is a fact about the table. It was on
    // here for a while, written in three places and read in none — which is exactly the field
    // that goes stale and is then believed.
    game.seats.push({ userId: who.userId, displayName: who.displayName, bot: false });
    game.touched = Date.now();
    screen.gameId = game.id;

    // A full table deals itself. Waiting for the host to press a button once the last seat is
    // taken is four people looking at each other — and the host may be the one who wandered off.
    if (game.kind === 'baucua') {
      if (game.state === 'lobby') {
        startBaucua(game);
      } else if (game.state === 'betting' && !game.bettingEndsAt && game.seats.length > 1) {
        // A second person is somebody to wait for, so the clock starts. Only the clock: this
        // used to re-open the board, which swept every chip anybody had already put down —
        // arriving at a table and clearing it is not arriving at a table.
        game.bettingEndsAt = Date.now() + BETTING_MS;
      }
      await pushGame(game);
    } else if (game.seats.length >= game.size) {
      await startGame(game);
    } else {
      await pushGame(game);
    }

    await pushLobbies();
    return null;
  }

  /**
   * Somebody did something inside the widget.
   *
   * `from` is filled in by the server from the connection the action arrived on, so it can be
   * believed outright. `action` is the part the widget wrote, and a widget is a file anybody
   * can edit — so which cards somebody claims to be playing is checked against the hand they
   * were dealt, every time.
   *
   * `role` is not checked and cannot be: every session here has exactly one player, its owner,
   * so the server would answer "player" for anybody who opened somebody else's screen. What is
   * checked instead is that the person acting owns the screen they acted on, and that they hold
   * the seat they are playing from.
   */
  async function onWidgetAction(event) {
    const screen = screens.get(event.sessionId);
    if (!screen) return;

    const who = event.from;
    // Anybody else in the room can open this session from the room's list of live widgets. They
    // may look; this is somebody else's screen and none of its buttons are theirs.
    if (screen.userId !== who.userId) return;

    screen.displayName = who.displayName || screen.displayName;
    screen.touched = Date.now();

    const action = (event.action && typeof event.action === 'object') ? event.action : {};
    const game = screen.gameId ? games.get(screen.gameId) : null;
    if (screen.gameId && !game) screen.gameId = null;

    // The day's gold. Refused when it has already been taken today, whatever the page thinks:
    // the button can be pressed twice before the first push lands, and a widget is a file
    // anybody can edit besides.
    if (action.daily) {
      claimDaily(who);
      await pushTo(screen);
      return;
    }

    // The advertisement. Started here, timed here, and paid here — the page draws a clock and
    // this decides whether it ran.
    if (action.ads) {
      const row = rowFor(who.userId, who.displayName);

      if (action.ads === 'start') {
        // At any balance. It used to be refused to anybody who could still afford a table,
        // which made the `+` beside the purse a button that worked or did nothing depending on
        // a number — and a button that sometimes does nothing is a broken button. What limits
        // this is the count per day, and that is the only thing that should.
        if (adsLeft(who.userId) <= 0) return;
        screen.adsAt = Date.now();
      } else if (action.ads === 'claim') {
        if (!screen.adsAt || Date.now() - screen.adsAt < ADS_MS) return;
        if (adsLeft(who.userId) <= 0) return;
        screen.adsAt = null;
        row.gold += ADS_GOLD;
        row.ads++;
        saveScores();
      } else {
        screen.adsAt = null;
      }

      await pushTo(screen);
      return;
    }

    // Going to a different table — sitting down at one, or watching one. Both are about a table
    // this screen is not showing, so they come before anything that asks about a seat at one.
    if (action.join) {
      const wanted = games.get(String(action.join));
      if (!wanted) return;
      const refusal = await sitDown(wanted, screen);
      if (refusal) await pushTo(screen, { says: refusal });
      return;
    }

    if (action.watch) {
      const wanted = games.get(String(action.watch));
      if (!wanted || wanted.state !== 'playing') return;
      screen.gameId = wanted.id;
      await pushTo(screen);
      return;
    }

    if (!game) {
      // On the lobby.
      //
      // Bầu cua first, because it needs neither a seat count nor a stake: everybody bets what
      // they like on the same three dice, so opening one is a single answer rather than three.
      if (action.baucua) {
        if (goldOf(who.userId) < CHIPS[0]) {
          return pushTo(screen, { says: SAY.tooPoor(CHIPS[0]) });
        }

        if (action.baucua === 'world') {
          // Nothing is opened. There is one sòng, it is already going, and this is a door.
          const song = worldSong();
          screen.gameId = song.id;
          seatWatchers(song);
          await pushGame(song);
          keepRolling(song).catch((problem) => console.error(String(problem)));
          return;
        }

        const table = newGame(screen, 1, CHIPS[0], 'baucua');
        table.solo = true;
        screen.gameId = table.id;
        startBaucua(table);

        await pushTo(screen);
        await pushLobbies();
        return;
      }

      // The only things left are to open a tiến lên table or to sit down at a machine.
      if (action.open === undefined && action.solo === undefined) return;

      const asked = Number(action.open ?? action.solo);
      if (![2, 3, 4].includes(asked)) return;

      if (action.solo !== undefined) {
        if (goldOf(who.userId) < BOT_STAKE) return pushTo(screen, { says: SAY.tooPoor(BOT_STAKE) });

        const table = newGame(screen, asked, BOT_STAKE);
        table.solo = true;
        screen.gameId = table.id;
        fillMachines(table);
        await startGame(table);
        await pushLobbies();
        return;
      }

      const stake = asStake(action.stake);
      if (goldOf(who.userId) < stake) return pushTo(screen, { says: SAY.tooPoor(stake) });

      const table = newGame(screen, asked, stake);
      table.state = 'lobby';
      screen.gameId = table.id;

      // To the room it was opened from, and not to the person who opened it. They know they
      // asked — the table in front of them says so — and a button offering them the seat they
      // are already holding is a button that cannot do anything. Everybody else finds it in the
      // world list, whichever group they are in.
      const invitation = await send(
        table.conversationId, SAY.opened(who.displayName, asked, stake), JOIN(table.id),
        null, [who.userId]);
      table.invitationId = invitation?.id ?? null;

      await pushTo(screen);
      await pushLobbies();
      return;
    }

    const host = game.host.userId === who.userId;

    if (game.kind === 'baucua') {
      // At the world sòng the chair is having it open, so somebody acting on it is somebody at
      // it. `seatWatchers` keeps that true; this is the belt to its braces.
      if (game.world && seatOf(game, who.userId) === null) seatWatchers(game);

      const seat = seatOf(game, who.userId);
      if (seat === null) {
        // Watching somebody else's table. Nothing here is theirs to press.
        if (action.leave) { screen.gameId = null; await pushTo(screen); }
        return;
      }

      if (action.leave) {
        screen.gameId = null;

        if (game.world) {
          // Whatever they have on the board stays on it — the throw is coming either way, and
          // money put down is money put down. Only the chair goes.
          seatWatchers(game);
          await pushGame(game);
          await pushTo(screen);
          return;
        }

        game.seats.splice(seat, 1);
        delete game.bets[who.userId];
        // Whoever opened a private table taking their coat is that table closing.
        if (host) await endGame(game, 'the table was closed by whoever opened it');
        else { await pushGame(game); await pushTo(screen); await pushLobbies(); }
        return;
      }

      if (action.bets) return setBets(game, screen, action.bets, action.at);

      // Thrown when somebody says so rather than only when the clock runs out — sitting through
      // twenty-five seconds of nothing because nobody else is betting is not a game.
      // Only at a private table. The world sòng runs on its own clock and a button that
      // hurried it along would be one person deciding for everybody else at it.
      if (action.roll && host && !game.world) return spin(game);
      return;
    }

    // Filling the empty seats, and starting short. Both belong to whoever opened the table.
    if (action.fill) {
      if (!host || game.state !== 'lobby') return;
      fillMachines(game);
      await startGame(game);
      await pushLobbies();
      return;
    }

    if (action.start) {
      if (!host || game.state !== 'lobby') return;
      // Two is a game. One is somebody waiting, and starting it would deal a hand nobody can be
      // beaten at.
      if (game.seats.length < 2) return;
      game.size = game.seats.length;
      await startGame(game);
      await pushLobbies();
      return;
    }

    const seat = seatOf(game, who.userId);

    if (action.leave) {
      await standUp(game, screen, seat);
      return;
    }

    if (action.rematch) {
      if (game.state !== 'over' || seat === null) return;

      // The stake again, in hand again. A rematch is another table and is paid for like one.
      if (goldOf(who.userId) < game.stake) {
        await pushTo(screen, { says: SAY.tooPoor(game.stake) });
        return;
      }

      game.ready.add(who.userId);
      const people = game.seats.filter((one) => !one.bot && !one.away).length;
      if (game.ready.size < people) {
        // Who has asked, not whether anybody has. One flag sent to everybody tells both sides
        // they are the one being waited for.
        await pushGame(game);
        return;
      }

      game.seats = game.seats.filter((one) => !one.away);
      if (game.seats.length < 2) {
        // One person and nobody to play. Ended rather than quietly filled with machines: they
        // asked for the table they had just played, and one tap opens a new one.
        await endGame(game, 'a rematch with nobody left to play');
        return;
      }
      await startGame(game);
      return;
    }

    // Everything left is a move, and a move needs a seat and a turn.
    if (seat === null) return;
    if (game.state !== 'playing' || game.turn !== seat) return;

    if (action.pass) {
      if (!move(game, seat, null)) return;
      await pushGame(game);
      await maybeBotTurn(game);
      return;
    }

    if (Array.isArray(action.play)) {
      if (!move(game, seat, action.play)) return;
      await pushGame(game);
      await maybeBotTurn(game);
      return;
    }
  }

  /// A table, before anybody is dealt anything.
  function newGame(screen, size, stake, kind = 'tienlen') {
    const game = {
      id: `g${++named}`,
      // Which game is being played at it. Everything about a table that is not the rules — who
      // is at it, what it costs, how somebody joins and leaves — is the same for both, so this
      // is the only thing most of the code has to know.
      kind,
      // Where it was opened, which is where its one line in a room lives. The people at it can
      // be anywhere.
      conversationId: screen.conversationId,
      state: 'lobby',
      host: { userId: screen.userId, displayName: screen.displayName },
      size,
      stake,
      solo: false,
      seats: [{ userId: screen.userId, displayName: screen.displayName, bot: false }],
      hands: null,
      turn: null,
      pile: null,
      passed: new Set(),
      finished: [],
      left: new Set(),
      first: false,
      opensWith: null,
      ready: new Set(),
      paidTo: new Map(),
      paid: [],
      // Bầu cua: what everybody has on the board this round, and what came up.
      bets: {},
      betAt: {},
      dice: null,
      bettingEndsAt: null,
      invitationId: null,
      touched: Date.now(),
    };
    games.set(game.id, game);
    return game;
  }

  /**
   * Somebody left.
   *
   * Standing up mid-game is coming last, and being paid for it. Otherwise the way never to lose
   * gold is to leave whenever the cards are bad, and a table where that works is a table of who
   * quits fastest.
   */
  async function standUp(game, screen, seat) {
    // Only watching. Their frame goes back to their own lobby and nothing about the table
    // changes — a spectator putting a game down must not close it on four other people.
    if (seat === null) {
      screen.gameId = null;
      await pushTo(screen);
      return;
    }

    // Out of cards already. They finished, took their place and were paid for it the moment the
    // last card left their hand, so this is putting the table down rather than walking out of
    // it. Nothing about the game changes and nothing about their place does either.
    //
    // This is the whole of the fix: coming first used to mean sitting through however long the
    // other three took, and pressing the only button on the screen counted as forfeiting.
    const done = game.hands && !game.hands[seat].length && game.finished.includes(seat);

    if (done || game.state === 'over') {
      // Noted only so a rematch does not sit waiting on somebody who has gone home. It is not
      // shown anywhere: they came first, and that is what their chair goes on saying.
      game.seats[seat].away = true;
      game.ready.delete(screen.userId);
      screen.gameId = null;
      await pushTo(screen);
      await pushGame(game);
      return;
    }

    if (game.state === 'playing') {
      // Walking out with cards still in hand. That is coming last and being charged for it,
      // because otherwise the way never to lose gold is to leave whenever the cards are bad,
      // and a table where that works is a table of who quits fastest.
      game.hands[seat] = [];
      game.left.add(seat);
      game.passed.add(seat);

      if (stillIn(game.hands) <= 1) finish(game);
      else if (game.turn === seat) advance(game, seat);
      else if (game.pile && nextInRound(game.hands, game.passed, game.pile.seat) === null) {
        newRound(game, game.pile.seat);
      }
      settle(game);

      screen.gameId = null;
      await pushGame(game);
      await pushTo(screen);
      await maybeBotTurn(game);
      return;
    }

    // Somebody who sat down at a table and changed their mind. The table stays and the seat
    // opens again — it is not theirs to close.
    if (game.state === 'lobby' && game.host.userId !== screen.userId) {
      game.seats.splice(seat, 1);
      game.touched = Date.now();
      screen.gameId = null;
      await pushGame(game);
      await pushTo(screen);
      await pushLobbies();
      return;
    }

    // The host closing a table nobody has started. A table with nobody keeping it is not a
    // table, so it goes and everybody looking at it is sent back to their own screen.
    await endGame(game, 'the table was closed by whoever opened it');
  }

  /// Ends a table and sends everybody looking at it back to their own screen.
  async function endGame(game, why) {
    console.log(`ending ${game.id}: ${why}`);
    if (game.invitationId) {
      await call('deleteMessage', { messageId: game.invitationId }).catch(() => {});
      game.invitationId = null;
    }
    games.delete(game.id);

    for (const screen of screens.values()) {
      if (screen.gameId === game.id) screen.gameId = null;
    }
    await pushLobbies();
  }

  /// Sits a machine in every empty seat.
  function fillMachines(game) {
    while (game.seats.length < game.size) {
      const index = game.seats.filter((one) => one.bot).length;
      game.seats.push({
        // Not a user id and never given to the app. Machines are not people: they are never
        // shown a session, never paid, and the app never hears of them.
        userId: `machine:${game.id}:${index}`,
        displayName: MACHINES[index % MACHINES.length],
        bot: true,
      });
    }
  }

  /// Deals, and sets the table going.
  async function startGame(game) {
    game.size = game.seats.length;
    // Everybody at the table is at it again. `away` is about the last hand.
    for (const one of game.seats) one.away = false;
    game.hands = deal(game.seats.length);

    const opening = opensGame(game.hands);
    game.turn = opening.seat;
    game.opensWith = opening.card;
    game.first = true;
    game.pile = null;
    game.passed = new Set();
    game.finished = [];
    game.left = new Set();
    game.ready = new Set();
    game.paidTo = new Map();
    game.paid = [];
    game.state = 'playing';
    game.touched = Date.now();

    if (game.invitationId) {
      // Shown to everybody again, the host included. It was hidden from them while it was an
      // offer they could not take; now it is the room's note of a game they are playing in.
      await edit(game.invitationId,
        SAY.started(game.seats.map((one) => one.displayName)), WATCH(game.id), []);
    }

    await pushGame(game);
    await maybeBotTurn(game);
  }

  // ---- bầu cua tôm cá ---------------------------------------------------------------------

  /**
   * The one sòng everybody in the world is at.
   *
   * Not a table anybody opens. It exists, it keeps throwing, and walking in is walking in on a
   * game already going — which is what a sòng is. A table somebody has to open first is a table
   * that is shut most of the time, and a world table that is shut most of the time is a room
   * with nobody in it.
   *
   * Made once and never swept. It has no room, no host and no invitation: there is nowhere to
   * post one, because it does not belong to a group.
   */
  function worldSong() {
    let song = games.get(WORLD);
    if (song) return song;

    song = {
      id: WORLD,
      kind: 'baucua',
      world: true,
      conversationId: null,
      state: 'betting',
      host: { userId: null, displayName: 'Sòng thế giới' },
      size: 999,
      stake: CHIPS[0],
      solo: false,
      seats: [],
      hands: null,
      turn: null,
      pile: null,
      passed: new Set(),
      finished: [],
      left: new Set(),
      first: false,
      opensWith: null,
      ready: new Set(),
      paidTo: new Map(),
      paid: [],
      bets: {},
      betAt: {},
      dice: null,
      bettingEndsAt: null,
      invitationId: null,
      touched: Date.now(),
    };
    games.set(WORLD, song);
    return song;
  }

  /// Who has it open. The chairs round the world sòng are whoever is looking at it.
  ///
  /// A function declaration and not a `const`, like everything else down here. A `const` below
  /// the endless loop stays in the temporal dead zone for the life of the process — the test at
  /// the bottom of the suite caught this one before it ever ran.
  function watchersOf(game) {
    return [...screens.values()].filter((screen) => screen.gameId === game.id);
  }

  /// Keeps the chairs the same as the people in them.
  function seatWatchers(game) {
    game.seats = watchersOf(game).map((screen) => ({
      userId: screen.userId, displayName: screen.displayName, bot: false,
    }));
  }

  /**
   * The world sòng, going round.
   *
   * Runs while anybody has it open and stops when the last of them leaves — a bowl shaking in an
   * empty room is work done for nobody, and the next person through the door gets a fresh
   * window rather than four seconds of somebody else's.
   */
  async function keepRolling(game) {
    if (game.looping) return;
    game.looping = true;

    try {
      for (;;) {
        // Kept going by somebody looking at it, or by money still on it. The second is not
        // decoration: the last person can walk out with chips down, and a stake that is never
        // settled is a stake taken. The dice do not care who is watching.
        const owed = Object.keys(game.bets).some((id) => staked(betsOf(game, id)) > 0);
        if (!watchersOf(game).length && !owed) {
          game.bettingEndsAt = null;
          return;
        }
        if (game.state !== 'betting') return;

        if (!game.bettingEndsAt) {
          game.bettingEndsAt = Date.now() + BETTING_MS;
          await pushGame(game);
        }

        const left = game.bettingEndsAt - Date.now();
        if (left > 0) { await wait(Math.min(left, 500)); continue; }

        await spin(game);
      }
    } finally {
      game.looping = false;
    }
  }

  /// What one person has on the board.
  ///
  /// A function declaration, like everything else down here. Third time in this file: a `const`
  /// below the endless loop stays in the temporal dead zone for the life of the process, and
  /// the test at the bottom of the suite is the only thing that has ever caught one.
  function betsOf(game, userId) {
    return game.bets[userId] ?? {};
  }

  /// Opens the board. A table with more than one person at it takes bets on a clock, because
  /// somebody has to be waited for; alone, the throw happens when the one person says so.
  function openBets(game) {
    game.state = 'betting';
    game.dice = null;
    game.paid = [];
    game.bets = {};
    game.betAt = {};
    game.touched = Date.now();
    // The world sòng always has a clock: it is a table that keeps throwing whether or not
    // anybody in particular is at it. A private one only needs a clock when there is somebody
    // to be waited for.
    game.bettingEndsAt = game.world || game.seats.length > 1 ? Date.now() + BETTING_MS : null;
  }

  function startBaucua(game) {
    openBets(game);
  }

  /**
   * The whole board, from the page that drew it.
   *
   * A board and not a chip, and that is the fix for something that looked like polish and was
   * not. The page puts a chip down the instant it is tapped and sends afterwards, so four taps
   * and an undo are five requests — and requests are five separate POSTs that can arrive in any
   * order. "Take the last chip off" then means different things to the page and to the bot, and
   * two boards that agreed when they were drawn disagree by the time they are thrown.
   *
   * Sending the totals has no order to get wrong. `at` counts up on the page so a reply that
   * overtakes a later one is ignored rather than undoing it.
   */
  async function setBets(game, screen, asked, at) {
    if (game.state !== 'betting') return;

    const when = Number(at);
    if (!Number.isFinite(when)) return;
    if (when <= (game.betAt[screen.userId] ?? 0)) return;

    // Everything here came from a page anybody can edit.
    const bets = {};
    let total = 0;
    for (const [face, amount] of Object.entries(asked ?? {})) {
      if (!FACES.includes(face)) return;
      const on = Math.round(Number(amount));
      if (!Number.isFinite(on) || on < 0) return;
      if (on === 0) continue;
      bets[face] = on;
      total += on;
    }

    // Never more on the board than there is in the purse. The stake is not taken until the dice
    // land, so this is the only thing standing between a board and a debt.
    const row = rowFor(screen.userId, screen.displayName);
    if (total > row.gold) {
      await pushTo(screen, { says: SAY.overBet(row.gold) });
      return;
    }

    game.bets[screen.userId] = bets;
    game.betAt[screen.userId] = when;
    game.touched = Date.now();
    await pushGame(game);
  }

  /**
   * The throw.
   *
   * The dice are worked out at the *end* of the shaking and not the start. Nothing the bot has
   * not decided yet can be in a push somebody reads early — which matters here in a way it does
   * not in caro, because the whole game is one number nobody is supposed to know yet.
   *
   * Guarded, because this awaits twice and the update loop does not stop while it does.
   */
  async function spin(game) {
    if (game.spinning || game.state !== 'betting') return;

    // A throw with nothing on the board is a throw nobody asked for — at a private table. The
    // world sòng throws anyway, because somebody walking in should find a game already running
    // rather than a bowl waiting for them to start it.
    const anything = Object.keys(game.bets).some((id) => staked(betsOf(game, id)) > 0);
    if (!anything && !game.world) return;

    game.spinning = true;
    try {
      game.state = 'rolling';
      game.bettingEndsAt = null;
      game.touched = Date.now();
      await pushGame(game);

      await wait(ROLL_MS);
      if (game.state !== 'rolling') return;

      game.dice = roll();
      payBaucua(game);
      game.state = 'paid';
      game.touched = Date.now();
      await pushGame(game);

      // And to anybody who put money down and then walked away. Their purse has moved and the
      // screen they are looking at is not this one — a number changing behind somebody's back
      // is the one thing a purse must never do.
      for (const one of game.paid) {
        const away = screenFor(one.userId);
        if (away && away.gameId !== game.id) await pushTo(away);
      }

      await wait(SHOW_MS);
      if (game.state !== 'paid') return;

      openBets(game);
      await pushGame(game);
    } finally {
      game.spinning = false;
    }
  }

  /// Pays the board out, one person at a time.
  function payBaucua(game) {
    game.paid = [];

    // From what is on the board, not from who is sitting at it. Somebody who put money down and
    // then closed the widget still had money down, and the dice do not care who is watching.
    for (const userId of Object.keys(game.bets)) {
      const bets = betsOf(game, userId);
      const on = staked(bets);
      if (!on) continue;

      const row = rowFor(userId);
      const who = { userId, displayName: row.name || 'Ai đó' };
      const worth = boardWorth(bets, game.dice);
      // A loss can only be as large as what is on the board, and the board was checked against
      // the purse when each chip went down. This is the backstop for the seam between the two.
      const moved = worth < 0 ? -Math.min(-worth, row.gold) : worth;

      row.gold += moved;
      row.games++;
      game.paid.push({
        userId: who.userId, displayName: who.displayName, staked: on, change: moved, bets,
      });
    }

    saveScores();
  }

  /**
   * A move, and everything a move sets off.
   *
   * The gold is moved here rather than inside `finish`, so the rules stay a pure thing a test
   * can run a thousand hands through and this stays the one place a finished table is paid.
   */
  function move(game, seat, cards) {
    const done = cards ? applyPlay(game, seat, cards) : applyPass(game, seat);
    // After every move, not only at the end. Going out *is* the win — the place is fixed and
    // the gold is decided the moment the last card leaves somebody's hand, and making them sit
    // through two more rounds to be paid for it is making them watch a game they have finished.
    if (done) settle(game);
    return done;
  }

  /**
   * Plays for every machine whose turn it is, one after another, until it is a person's.
   *
   * A loop rather than one move, because three machines at a table answer each other and the
   * turn can come round to a person several seats later. A pause before each, because a card
   * that lands in the same instant as your own does not read as somebody playing.
   *
   * Guarded, because this awaits and the update loop does not stop while it does. Two of these
   * running at once would have two machines playing the same seat's cards.
   */
  async function maybeBotTurn(game) {
    if (game.thinking) return;
    game.thinking = true;

    try {
      for (;;) {
        if (game.state !== 'playing') return;
        const seat = game.turn;
        if (seat === null || !game.seats[seat]?.bot) return;

        await wait(THINK_MS);
        // Something may have moved while it thought — a person left, the table ended, the sweep
        // took the turn. Whatever it worked out is about a table that is no longer this one.
        if (game.state !== 'playing' || game.turn !== seat) return;

        const cards = chooseMove(game.hands[seat], game.pile?.shape ?? null, {
          lowest: lowestElsewhere(game.hands, seat),
          mustInclude: game.first ? game.opensWith : null,
        });

        if (cards) {
          move(game, seat, cards);
        } else if (game.pile) {
          move(game, seat, null);
        } else {
          // Leading with nothing it wants to lead. Cannot happen — `chooseMove` always finds
          // something when there is nothing to beat — but a table that stops dead is worse than
          // a bad card, so the lowest one goes down.
          move(game, seat, [game.hands[seat][0]]);
        }

        await pushGame(game);
      }
    } finally {
      game.thinking = false;
    }
  }

  // ---- what everybody is shown ----------------------------------------------------------------

  /// What somebody at no table is looking at: what to play, what is open, and the gold.
  function lobbyState(screen) {
    const row = rowFor(screen.userId, screen.displayName);
    return {
      phase: 'choosing',
      gameId: null,
      gold: row.gold,
      // The day's gold, waiting to be taken.
      daily: dailyReady(screen.userId) ? DAILY_GOLD : 0,
      // The advertisement, if one is running. As a moment rather than a duration, so a phone
      // that was asleep comes back to the right number of seconds.
      adsEndsAt: screen.adsAt ? screen.adsAt + ADS_MS : null,
      adsLeft: adsLeft(screen.userId),
      adsGold: ADS_GOLD,
      broke: row.gold < BROKE,
      stakes: STAKES,
      minStake: MIN_STAKE,
      // The most this person could open a table at: they have to cover the stake to sit at
      // their own table, so their purse is the real ceiling and the page should say so rather
      // than take a number and refuse it.
      maxStake: Math.min(MAX_STAKE, row.gold),
      botStake: BOT_STAKE,
      rooms: openTables(),
      playing: running(),
      table: table(),
    };
  }

  /// What somebody at a bầu cua table is looking at. Their own board is added by `pushTo`.
  ///
  /// Everybody's stakes are in it, and that is on purpose: at a pavement table the board is the
  /// board and half the game is watching where everybody else put their money.
  function baucuaState(game) {
    return {
      phase: game.state,
      kind: 'baucua',
      gameId: game.id,
      size: game.size,
      solo: !!game.solo,
      // The one everybody is at, as opposed to a private bowl. The widget draws it differently:
      // there is no throw button on a table that throws on its own.
      world: !!game.world,
      host: game.host.userId,
      hostName: game.host.displayName,

      faces: FACES,
      chips: CHIPS,
      dice: game.dice,
      // What is on each face from everybody at the table, so the board reads like a board.
      board: game.seats.reduce((total, one) => {
        const bets = betsOf(game, one.userId);
        for (const face of FACES) total[face] = (total[face] ?? 0) + (bets[face] ?? 0);
        return total;
      }, {}),

      seats: game.seats.map((one) => ({
        id: one.userId,
        name: one.displayName,
        staked: staked(betsOf(game, one.userId)),
        change: (game.paid.find((p) => p.userId === one.userId) ?? {}).change ?? null,
      })),

      bettingEndsAt: game.state === 'betting' ? game.bettingEndsAt : null,
      rollMs: ROLL_MS,
      paid: game.paid,
    };
  }

  /// What somebody at a table is looking at. Their own hand is added by `pushTo`.
  function tableState(game) {
    if (game.kind === 'baucua') return baucuaState(game);
    const people = game.seats.length;

    // What the table has been worth to each person so far. Kept up to date by `settle` after
    // every move, because a place taken is a place paid.
    const paid = game.paid;
    const owed = new Map(paid.map((one) => [one.userId, one.change]));

    return {
      phase: game.state,
      gameId: game.id,
      size: game.size,
      stake: game.stake,
      solo: !!game.solo,
      host: game.host.userId,
      hostName: game.host.displayName,

      seats: game.seats.map((one, seat) => ({
        seat,
        id: one.userId,
        name: one.displayName,
        bot: !!one.bot,
        // A count, never the cards. This is the line that matters.
        cards: game.hands ? game.hands[seat].length : null,
        passed: game.passed.has(seat),
        // Walked out, which is a thing about the game. Somebody who finished and then closed
        // the table is not gone from it in any sense that matters — their place stands.
        gone: game.left.has(seat),
        place: game.finished.indexOf(seat) === -1
          ? null
          : placeName(game.finished.indexOf(seat), people),
        // What going out was worth, the moment they went out. Null for a machine, and null for
        // anybody still holding cards.
        won: owed.has(one.userId) ? owed.get(one.userId) : null,
      })),

      turn: game.turn,
      turnName: game.turn === null ? '' : game.seats[game.turn].displayName,
      turnEndsAt: game.state === 'playing' ? game.touched + TURN_MS : null,
      turnMs: TURN_MS,

      pile: game.pile
        ? {
          cards: game.pile.cards,
          seat: game.pile.seat,
          byName: game.seats[game.pile.seat].displayName,
          kind: game.pile.shape.kind,
        }
        : null,
      // The card the opening play has to contain, while that is still true. The widget rings it,
      // because a rule that refuses a play without saying why reads as a bug.
      opensWith: game.first ? game.opensWith : null,

      ranking: game.finished.map((seat, place) => ({
        id: game.seats[seat].userId,
        name: game.seats[seat].displayName,
        place: placeName(place, people),
      })),
      // Who won and lost what. Only people are in it — the machines are furniture and paying
      // them would be printing gold.
      paid,
      rematchAsked: [...game.ready],
    };
  }

  /**
   * Draws one screen.
   *
   * Twice: once to everybody who has this session open, and once to the person it belongs to
   * with their hand in it. The first is what somebody in their group sees if they open the
   * widget from the room's list; the second is the only place thirteen cards ever go.
   *
   * The private push is a **complete** state and not a patch. The server remembers the last
   * thing each person was sent and prefers their own over the shared one when they open the
   * widget late, so a private push carrying only a hand would show somebody a hand and no
   * table.
   */
  async function pushTo(screen, extra = {}) {
    const game = screen.gameId ? games.get(screen.gameId) : null;
    if (screen.gameId && !game) screen.gameId = null;

    const shared = {
      ...(game ? tableState(game) : lobbyState(screen)),
      gold: rowFor(screen.userId).gold,
      ...extra,
    };

    const landed = await call('pushState', { sessionId: screen.sessionId, state: shared })
      .then(() => true)
      .catch(() => false);

    // A push that finds no session means the API was replaced under this screen. Forgetting it
    // is what lets the next mention make a fresh one instead of failing for ever.
    if (!landed) { dropScreen(screen); return false; }

    const seat = game ? seatOf(game, screen.userId) : null;

    // What this one person has on the board. Not a secret the way a hand is — everybody's
    // stakes are in the shared state — but the widget needs to know which of them are theirs to
    // light up and to take back.
    const mine = game && game.kind === 'baucua' && seat !== null
      ? {
        seat,
        bets: betsOf(game, screen.userId),
        staked: staked(betsOf(game, screen.userId)),
        // What the bot has for them. The page keeps its own copy while a window is open — it
        // is the one drawing the chips — and takes this back whenever a round turns over.
        theirs: betsOf(game, screen.userId),
      }
      : null;

    await call('pushState', {
      sessionId: screen.sessionId,
      to: screen.userId,
      state: {
        ...shared,
        me: mine ?? (seat === null ? null : {
          seat,
          hand: game.hands ? game.hands[seat] : [],
          // Whether anything in this hand answers what is on the table. Worked out here rather
          // than in the widget, because "you have nothing" and "you have something and cannot
          // find it" are the same screen otherwise, and only one of them is true.
          stuck: game.state === 'playing' && game.turn === seat && !!game.pile
            && !canAnswer(game.hands[seat], game.pile.shape),
        }),
      },
    }).catch(() => {});

    return true;
  }

  /// Everybody looking at this table — the people at it, and anybody watching.
  async function pushGame(game) {
    await Promise.all([...screens.values()]
      .filter((screen) => screen.gameId === game.id)
      .map((screen) => pushTo(screen)));
  }

  /**
   * Redraws every screen that is not at a table.
   *
   * The lists a lobby shows are worked out at the moment it is pushed, and a screen is only
   * pushed when something happens to *it*. So somebody sitting on a lobby watched a list that
   * never changed: tables opened elsewhere never appeared, tables that filled up stayed. The
   * list is about everybody else, so everybody else is when to send it.
   *
   * All at once, because one at a time made a table starting kick off a chain of round trips as
   * long as the number of screens open anywhere.
   */
  async function pushLobbies() {
    await Promise.all([...screens.values()]
      .filter((screen) => !screen.gameId)
      .map((screen) => pushTo(screen)));
  }

  /**
   * Moves a table on when nobody else will.
   *
   * Three different waits. Somebody who has stopped playing leaves everybody else watching a
   * table that will never change, and there is no telling that from somebody counting their
   * cards — so their turn is taken. A finished table where one person pressed "ván nữa" and
   * everybody else went home holds a seat for ever. And a table nobody ever sat down at is a
   * line in everybody's list that goes nowhere.
   *
   * On a timer rather than inside the update loop, which spends most of its life parked on a
   * long poll and would only notice when somebody else happened to say something.
   */
  async function sweep() {
    for (const game of [...games.values()]) {
      const idle = Date.now() - (game.touched ?? 0);

      if (game.kind === 'baucua') {
        if (game.world) {
          // Never swept — it is the one table that is always there. Started again if somebody
          // is looking at it and the loop is not running, which is the seam a lost await or a
          // failed push would otherwise leave a stalled bowl in.
          if (watchersOf(game).length && !game.looping) {
            keepRolling(game).catch((problem) => console.error(String(problem)));
          }
          continue;
        }

        // A private table's clock running out is the throw.
        if (game.state === 'betting' && game.bettingEndsAt && Date.now() >= game.bettingEndsAt) {
          await spin(game);
          continue;
        }
        // A board nobody has touched.
        if (idle > LOBBY_MS) await endGame(game, 'a sòng nobody was betting at');
        continue;
      }

      if (game.state === 'playing') {
        const seat = game.turn;
        if (seat === null) continue;

        // A machine whose beat was lost — the process was busy, a push failed, an await landed
        // after the table had moved. Started again rather than waited on.
        if (game.seats[seat].bot) {
          if (idle > THINK_MS * 3) await maybeBotTurn(game);
          continue;
        }

        if (idle <= TURN_MS) continue;

        // Passed rather than played well. Playing their hand for them would be deciding a game
        // they are not in — but somebody who is leading has to put something down, so the
        // cheapest thing goes.
        game.touched = Date.now();
        if (game.pile) {
          move(game, seat, null);
        } else {
          const cards = chooseMove(game.hands[seat], null, {
            mustInclude: game.first ? game.opensWith : null,
          }) ?? [game.hands[seat][0]];
          move(game, seat, cards);
        }

        await pushGame(game);
        await maybeBotTurn(game);
        continue;
      }

      if (game.state === 'over' && idle > REMATCH_MS) {
        await endGame(game, 'a finished table nobody sat back down at');
        continue;
      }

      if (game.state === 'lobby' && idle > LOBBY_MS) {
        await endGame(game, 'a table nobody sat at');
      }
    }
  }

  /**
   * Says something, waiting its turn if it is talking too fast.
   *
   * A 429 is answered by waiting and saying it anyway. Dropping it would leave a room with no
   * note of a table that is open, which is worse than a note that arrives late.
   */
  async function send(conversationId, text, keyboard, onlyForUserId, hiddenForUserIds) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await call('sendMessage',
          { conversationId, text, keyboard, onlyForUserId, hiddenForUserIds });
      } catch (problem) {
        if (!String(problem).includes('429') || attempt === 2) {
          console.error(String(problem));
          return null;
        }
        await wait(1100 * (attempt + 1));
      }
    }
    return null;
  }

  async function edit(messageId, text, keyboard, hiddenForUserIds) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await call('editMessage', { messageId, text, keyboard, hiddenForUserIds });
      } catch (problem) {
        if (!String(problem).includes('429') || attempt === 2) {
          console.error(String(problem));
          return null;
        }
        await wait(1100 * (attempt + 1));
      }
    }
    return null;
  }

  /** A press must be answered within five minutes or the id expires; failing to is a spinner. */
  async function answer(callbackId, text) {
    try {
      await call('answerCallback', { callbackId, text: text ?? undefined });
    } catch (problem) {
      console.error(String(problem));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.ZEPLAO_BOT_TOKEN;
  if (!token) {
    console.error('ZEPLAO_BOT_TOKEN is not set');
    process.exit(2);
  }

  // Somewhere for systemd's SIGTERM to land. Without it a deploy kills this in the middle of
  // whatever it was doing, and the most likely thing it was doing is a push.
  const stopping = new AbortController();
  for (const sign of ['SIGINT', 'SIGTERM']) {
    process.on(sign, () => { console.log(`${sign} — stopping`); stopping.abort(); });
  }

  run(token, { signal: stopping.signal }).catch((problem) => {
    console.error(String(problem));
    process.exit(1);
  });
}
