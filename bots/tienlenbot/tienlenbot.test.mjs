import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RANKS, SUITS, TWO, TURN_MS, REMATCH_MS, LOBBY_MS,
  rankOf, suitOf, nameOf, deck, deal,
  shapeOf, beats, isBomb, holdsAll,
  movesFrom, canAnswer, costOf, chooseMove,
  nextInRound, nextActive, opensGame, stillIn, lowestElsewhere, placeName,
  payouts, settlement, dayIn, gold,
  STARTING_GOLD, DAILY_GOLD, BOT_STAKE, MIN_STAKE, MAX_STAKE, STAKES, BROKE, ADS_GOLD, asStake,
  FACES, FACE_NAMES, DICE, ROLL_MS, SHOW_MS, CHIPS, roll, faceWorth, boardWorth, staked, tally,
} from './tienlenbot.mjs';

/// A card by name, which is how anybody talks about one.
const c = (rank, suit) => RANKS.indexOf(rank) * 4 + SUITS.indexOf(suit);
const hand = (...names) => names.map((name) => {
  const suit = name.slice(-1);
  return c(name.slice(0, -1), suit);
});
const kindOf = (...names) => shapeOf(hand(...names));

// ---- the cards ----------------------------------------------------------------------------

test('a card is one number and that number is its strength', () => {
  assert.equal(c('3', '♠'), 0, 'the three of spades is the bottom of the deck');
  assert.equal(c('2', '♥'), 51, 'the two of hearts is the top of it');
  assert.equal(deck().length, 52);
  assert.equal(new Set(deck()).size, 52);

  // The whole of the ordering, in one line: bích < chuồn < rô < cơ, and rank before suit.
  assert.ok(c('3', '♣') > c('3', '♠'));
  assert.ok(c('4', '♠') > c('3', '♥'));
  assert.ok(c('2', '♠') > c('A', '♥'));
});

test('rank and suit read back out of it', () => {
  for (const card of deck()) {
    assert.equal(nameOf(card), RANKS[rankOf(card)] + SUITS[suitOf(card)]);
    assert.equal(rankOf(card) * 4 + suitOf(card), card);
  }
  assert.equal(rankOf(c('2', '♠')), TWO);
});

test('a deal gives thirteen each and never the same card twice', () => {
  for (const players of [2, 3, 4]) {
    const hands = deal(players);
    assert.equal(hands.length, players);
    assert.ok(hands.every((one) => one.length === 13));

    const all = hands.flat();
    assert.equal(new Set(all).size, players * 13, `${players} players got a card twice`);
    assert.ok(hands.every((one) => one.every((card, i) => i === 0 || card > one[i - 1])),
      'a hand comes sorted, which is what lets the lowest card be read off the front');
  }
});

test('a short table deals thirteen each and leaves the rest in the box', () => {
  // Not seventeen each at a table of three. The game is the same game; it is quicker.
  assert.equal(deal(3).flat().length, 39);
  assert.equal(deal(2).flat().length, 26);
});

// ---- what may be put down -----------------------------------------------------------------

test('the six shapes', () => {
  assert.deepEqual(kindOf('3♠'), { kind: 'single', size: 1, top: 0 });
  assert.equal(kindOf('5♠', '5♥').kind, 'pair');
  assert.equal(kindOf('9♠', '9♣', '9♦').kind, 'triple');
  assert.equal(kindOf('J♠', 'J♣', 'J♦', 'J♥').kind, 'quad');
  assert.equal(kindOf('3♠', '4♠', '5♠').kind, 'straight');
  assert.equal(kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣').kind, 'pairs_run');
});

test('a run of pairs says how many pairs it is, because the ladder of chặt turns on it', () => {
  assert.equal(kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣').pairs, 3);
  assert.equal(
    kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣').pairs, 4);
});

test('the same card sent four times is not a tứ quý', () => {
  // The one a widget would try. It is a file anybody can edit, and four copies of the ace of
  // spades is the cheapest way to make one.
  assert.equal(shapeOf([c('A', '♠'), c('A', '♠'), c('A', '♠'), c('A', '♠')]), null);
  assert.equal(shapeOf([0, 0]), null);
  assert.equal(shapeOf([-1]), null);
  assert.equal(shapeOf([52]), null);
  assert.equal(shapeOf([1.5]), null);
  assert.equal(shapeOf([]), null);
  assert.equal(shapeOf('3♠'), null);
});

test('a two is in no run, straight or paired', () => {
  // The rule the whole endgame stands on. Without it a hand holding two 2s walks out in a
  // sảnh and the cards that were being kept to beat them never get played.
  assert.equal(kindOf('K♠', 'A♠', '2♠'), null);
  assert.equal(kindOf('Q♠', 'K♠', 'A♠', '2♠'), null);
  assert.equal(kindOf('K♠', 'K♣', 'A♠', 'A♣', '2♠', '2♣'), null);

  // And a run that stops at the ace is fine.
  assert.equal(kindOf('Q♠', 'K♠', 'A♠').kind, 'straight');
});

test('two pairs is not a đôi thông, and three of a kind plus a pair is nothing', () => {
  assert.equal(kindOf('3♠', '3♣', '4♠', '4♣'), null, 'đôi thông starts at three pairs');
  assert.equal(kindOf('3♠', '3♣', '3♦', '4♠', '4♣'), null);
  assert.equal(kindOf('3♠', '3♣', '3♦', '3♥', '4♠', '4♣'), null, 'four of a rank is not two pairs');
});

test('a run has to be consecutive and cannot wrap', () => {
  assert.equal(kindOf('3♠', '4♠', '6♠'), null);
  assert.equal(kindOf('K♠', 'A♠', '3♣'), null);
  assert.equal(kindOf('3♠', '3♣', '5♠', '5♣', '6♠', '6♣'), null);
});

// ---- who beats whom -------------------------------------------------------------------------

test('the same shape, higher card', () => {
  assert.ok(beats(kindOf('5♠'), kindOf('4♥')));
  assert.ok(!beats(kindOf('4♥'), kindOf('5♠')));

  // The suit is the tie-break and the reason the deck is one number rather than two.
  assert.ok(beats(kindOf('5♥'), kindOf('5♠')));
  assert.ok(!beats(kindOf('5♠'), kindOf('5♥')));
  assert.ok(beats(kindOf('5♦', '5♥'), kindOf('5♠', '5♣')));
});

test('anything at all beats an empty table', () => {
  assert.ok(beats(kindOf('3♠'), null));
  assert.ok(!beats(null, kindOf('3♠')));
});

test('a shape only answers its own shape and its own length', () => {
  assert.ok(!beats(kindOf('K♠', 'K♣'), kindOf('3♠')), 'a pair is not a bigger single');
  assert.ok(!beats(kindOf('A♠'), kindOf('3♠', '3♣')));
  assert.ok(!beats(kindOf('4♠', '5♠', '6♠', '7♠'), kindOf('3♠', '4♣', '5♣')),
    'a longer run is a different run, not a bigger one');
  assert.ok(beats(kindOf('4♠', '5♠', '6♠'), kindOf('3♠', '4♣', '5♣')));
});

test('the ladder of chặt', () => {
  const loneTwo = kindOf('2♠');
  const pairTwos = kindOf('2♠', '2♣');
  const threePairs = kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣');
  const fourPairs = kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣');
  const quad = kindOf('7♠', '7♣', '7♦', '7♥');

  // Ba đôi thông cuts a lone two and nothing else.
  assert.ok(beats(threePairs, loneTwo));
  assert.ok(!beats(threePairs, pairTwos), 'a pair of twos wants four of a kind or better');
  assert.ok(!beats(threePairs, quad));

  // Tứ quý cuts a lone two, a pair of them, and ba đôi thông.
  assert.ok(beats(quad, loneTwo));
  assert.ok(beats(quad, pairTwos));
  assert.ok(beats(quad, threePairs));
  assert.ok(!beats(quad, fourPairs), 'nothing cuts bốn đôi thông but a bigger one');

  // Bốn đôi thông cuts everything below it.
  assert.ok(beats(fourPairs, loneTwo));
  assert.ok(beats(fourPairs, pairTwos));
  assert.ok(beats(fourPairs, threePairs));
  assert.ok(beats(fourPairs, quad));
});

test('a bomb does not cut an ordinary card', () => {
  // The mistake that makes the game unplayable: four of a kind is not a wild card, it is an
  // answer to a two and to a smaller bomb.
  const quad = kindOf('7♠', '7♣', '7♦', '7♥');
  assert.ok(!beats(quad, kindOf('A♥')));
  assert.ok(!beats(quad, kindOf('K♠', 'K♣')));
  assert.ok(!beats(quad, kindOf('3♠', '4♠', '5♠')));
});

test('two bombs of a kind are compared like anything else', () => {
  assert.ok(beats(kindOf('8♠', '8♣', '8♦', '8♥'), kindOf('7♠', '7♣', '7♦', '7♥')));
  assert.ok(!beats(kindOf('7♠', '7♣', '7♦', '7♥'), kindOf('8♠', '8♣', '8♦', '8♥')));
  assert.ok(beats(
    kindOf('4♠', '4♣', '5♠', '5♣', '6♠', '6♣'),
    kindOf('3♠', '3♣', '4♦', '4♥', '5♦', '5♥')));
});

test('what counts as a bomb', () => {
  assert.ok(isBomb(kindOf('7♠', '7♣', '7♦', '7♥')));
  assert.ok(isBomb(kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣')));
  assert.ok(!isBomb(kindOf('9♠', '9♣', '9♦')));
  assert.ok(!isBomb(kindOf('2♥')));
  assert.ok(!isBomb(null));
});

test('a hand is checked for the cards somebody says they are playing', () => {
  const mine = hand('3♠', '4♠', '5♠');
  assert.ok(holdsAll(mine, hand('3♠', '4♠')));
  assert.ok(!holdsAll(mine, hand('3♠', '6♠')));
});

// ---- what a hand can do ---------------------------------------------------------------------

test('every shape in a hand is offered', () => {
  const mine = hand('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '7♠', '7♣', '7♦', '7♥');
  const kinds = new Set(movesFrom(mine).map((move) => move.shape.kind));

  assert.deepEqual([...kinds].sort(),
    ['pair', 'pairs_run', 'quad', 'single', 'straight', 'triple']);
});

test('a run is offered with a high card at the top as well as a low one', () => {
  // Not an optimisation. It is the difference between beating a run by a suit and having to
  // pass — a hand holding both fives can only answer 3-4-5♦ with the one it would have thrown
  // away.
  const mine = hand('3♣', '4♣', '5♠', '5♥');
  const runs = movesFrom(mine).filter((move) => move.shape.kind === 'straight');

  assert.ok(runs.some((move) => move.shape.top === c('5', '♠')));
  assert.ok(runs.some((move) => move.shape.top === c('5', '♥')));
  assert.ok(canAnswer(mine, kindOf('3♦', '4♦', '5♦')), 'and so the hand is not stuck');
});

test('a hand with nothing big enough is stuck, and says so', () => {
  assert.ok(!canAnswer(hand('3♠', '4♠'), kindOf('A♥')));
  assert.ok(canAnswer(hand('3♠', '2♠'), kindOf('A♥')));
});

test('breaking up four of a kind costs more than playing something else', () => {
  const mine = hand('7♠', '7♣', '7♦', '7♥', '9♠');
  const moves = movesFrom(mine);
  const single7 = moves.find((move) => move.cards.length === 1 && rankOf(move.shape.top) === 4);
  const single9 = moves.find((move) => move.cards.length === 1 && rankOf(move.shape.top) === 6);

  assert.ok(costOf(single7, mine) > costOf(single9, mine),
    'a seven out of a tứ quý is worth more than a nine out of nothing');
});

// ---- what the machine does --------------------------------------------------------------------

test('it goes out when it can, whatever that costs', () => {
  // Nothing is worth comparing against ending the game.
  assert.deepEqual(chooseMove(hand('2♥'), kindOf('A♠')), hand('2♥'));
});

test('it does not lead a bomb', () => {
  // Four cards traded for one round, into a table where there is nothing to cut.
  const mine = hand('5♠', '5♣', '5♦', '5♥', '3♦');
  assert.deepEqual(chooseMove(mine, null), hand('3♦'));
});

test('it keeps a two for somebody who is nearly out', () => {
  const mine = hand('2♠', '5♠');
  assert.equal(chooseMove(mine, kindOf('K♥'), { lowest: 13 }), null,
    'nobody is close, so the two is worth more than the round');
  assert.deepEqual(chooseMove(mine, kindOf('K♥'), { lowest: 1 }), hand('2♠'),
    'somebody is one card from taking the game, so it goes down');
});

test('and cuts with a bomb only when the round is worth it', () => {
  const mine = hand('5♠', '5♣', '5♦', '5♥', '3♦');
  assert.equal(chooseMove(mine, kindOf('2♥'), { lowest: 13 }), null);
  assert.deepEqual(chooseMove(mine, kindOf('2♥'), { lowest: 2 }),
    hand('5♠', '5♣', '5♦', '5♥'));
});

test('the opening play has to hold the lowest card in play', () => {
  const mine = hand('3♠', '3♣', '9♦', 'K♥');
  const opening = chooseMove(mine, null, { mustInclude: c('3', '♠') });

  assert.ok(opening.includes(c('3', '♠')), `${opening.map(nameOf)} does not open with 3♠`);
});

test('it passes rather than making a move it does not have', () => {
  assert.equal(chooseMove(hand('3♠', '4♠'), kindOf('A♥')), null);
});

test('it always finds something to lead', () => {
  // A table that stops dead because nobody would play is worse than a bad card. Every hand,
  // dealt a hundred times over, has an opening.
  for (let i = 0; i < 100; i++) {
    for (const one of deal(4)) {
      assert.ok(chooseMove(one, null), `${one.map(nameOf)} found nothing to lead`);
    }
  }
});

// ---- the turn ---------------------------------------------------------------------------------

test('the next to answer is never the one who just played', () => {
  // The loop stops one short of a full turn, which is what makes "nobody left" a real answer
  // rather than the same player being handed the turn back for ever.
  const hands = [[1], [2], [3], [4]];
  assert.equal(nextInRound(hands, new Set(), 0), 1);
  assert.equal(nextInRound(hands, new Set([1, 2, 3]), 0), null);
});

test('somebody out of cards is out of the round, and so is somebody who passed', () => {
  const hands = [[1], [], [3], [4]];
  assert.equal(nextInRound(hands, new Set(), 0), 2, 'the empty hand is stepped over');
  assert.equal(nextInRound(hands, new Set([2]), 0), 3);
});

test('at a table of two the leader is handed the round back rather than the turn', () => {
  // The bug this is really about. "Everybody has passed" is the same as "nobody can answer" at
  // a table of four and quietly wrong at a table of two, where the leader never passed.
  const hands = [[1], [2]];
  assert.equal(nextInRound(hands, new Set([1]), 1), 0,
    'which the caller then reads as the pile owner, and starts a new round');
});

test('the next to lead wraps all the way round, including back to the same seat', () => {
  assert.equal(nextActive([[1], [], []], 0), 0);
  assert.equal(nextActive([[], [2], []], 0), 1);
  assert.equal(nextActive([[], [], []], 0), null);
});

test('whoever holds the lowest card in play opens, and must open with it', () => {
  // At a full table that is the three of spades, and everybody already knows the rule. At a
  // short one the three of spades may be in the half of the deck nobody got, so the rule is
  // really about the lowest card that was dealt.
  const full = [[c('3', '♣')], [c('3', '♠')], [c('4', '♠')], [c('5', '♠')]];
  assert.deepEqual(opensGame(full), { seat: 1, card: 0 });

  const short = [[c('7', '♦'), c('9', '♠')], [c('5', '♥')]];
  assert.deepEqual(opensGame(short), { seat: 1, card: c('5', '♥') });

  // And a real deal at a short table always names a seat holding the card it names.
  for (const players of [2, 3, 4]) {
    const hands = deal(players);
    const { seat, card } = opensGame(hands);
    assert.ok(hands[seat].includes(card));
    assert.equal(card, Math.min(...hands.flat()));
  }
});

test('how many are still holding cards, and how few anybody else has', () => {
  const hands = [[1, 2, 3], [], [4], [5, 6]];
  assert.equal(stillIn(hands), 3);
  assert.equal(lowestElsewhere(hands, 0), 1, 'the empty hand is somebody who is already out');
  assert.equal(lowestElsewhere(hands, 2), 2);
  assert.equal(lowestElsewhere([[1], [], [], []], 0), 99, 'nobody else left to be close');
});

test('last place is called bét however many sat down', () => {
  assert.equal(placeName(0, 4), 'Nhất');
  assert.equal(placeName(1, 4), 'Nhì');
  assert.equal(placeName(2, 4), 'Ba');
  assert.equal(placeName(3, 4), 'Bét');
  assert.equal(placeName(1, 2), 'Bét', 'second of two is last, not second');
  assert.equal(placeName(2, 3), 'Bét');
});

test('the three waits are different lengths and in the right order', () => {
  assert.ok(TURN_MS >= 20_000, 'long enough to look at a hand of thirteen');
  assert.ok(REMATCH_MS > TURN_MS);
  assert.ok(LOBBY_MS > REMATCH_MS);
});

// ---- the two rules this file cannot see broken -------------------------------------------------

test('nobody is ever sent anybody else\'s cards', () => {
  // The one bug in a card game that nobody notices until somebody opens the network tab, and
  // by then people have been cheating for a week.
  //
  // Two pushes go out per screen: the table, to whoever has that session open, and the same
  // thing again with a hand in it, to the one person it belongs to. So the rule is that the
  // *first* of those can never carry cards, which means neither of the two functions that
  // build it may mention a hand.
  const source = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');
  const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

  const drawn = between('function tableState(game)', 'async function pushTo(');
  assert.ok(drawn.includes('cards: game.hands ? game.hands[seat].length : null'),
    'the table everybody sees should carry how many cards each seat holds');
  assert.ok(!/\bhand\b\s*[:,]/.test(drawn), `a hand got into the table everybody sees:\n${drawn}`);

  const lobby = between('function lobbyState(screen)', 'function tableState(game)');
  assert.ok(!/\bhand\b\s*[:,]/.test(lobby), 'a hand got into the lobby');

  // And the push that does carry one names the one person it is for, in the same call.
  const push = between('async function pushTo(', 'async function pushGame(');
  const before = push.slice(0, push.indexOf('hand:'));
  assert.ok(before.lastIndexOf('to: screen.userId') > before.lastIndexOf("call('pushState'"),
    'the push carrying a hand must name the one person it is for');
});

test('gold moves between the people at a table and none is made', () => {
  // A table that pays out more than it takes in is a table everybody plays at all evening, and
  // an evening later the number beside everybody's name means nothing.
  for (const count of [2, 3, 4]) {
    const share = payouts(count);
    assert.equal(share.length, count);
    assert.equal(share.reduce((sum, one) => sum + one, 0), 0, `${count} at the table`);
    assert.ok(share[0] > 0, 'first should win something');
    assert.ok(share[share.length - 1] < 0, 'last should lose something');
    assert.ok(share.every((one, i) => i === 0 || one <= share[i - 1]), 'and in that order');
  }
});

test('the numbers asked for: nhất takes two thousand off a table of machines', () => {
  const seats = [
    { userId: 'u1', displayName: 'Thọ', bot: false },
    { userId: 'm1', displayName: 'Tư Ròm', bot: true },
    { userId: 'm2', displayName: 'Út Mập', bot: true },
    { userId: 'm3', displayName: 'Ba Gà', bot: true },
  ];

  const at = (place) => {
    const order = [1, 2, 3];
    order.splice(place, 0, 0);
    return settlement(seats, order, BOT_STAKE)[0];
  };

  assert.equal(at(0).change, BOT_STAKE, 'nhất takes a stake');
  assert.equal(at(1).change, BOT_STAKE / 2, 'nhì takes half of one');
  assert.equal(at(2).change, -BOT_STAKE / 2, 'ba pays it');
  assert.equal(at(3).change, -BOT_STAKE, 'bét pays a whole one');
  assert.equal(BOT_STAKE, 4000, 'and the number itself');
});

test('two people and two machines is a table of two, and the machines are furniture', () => {
  // Said in as many words: whoever of the people went out first has won, whatever the machines
  // did in between, and the machines neither win nor lose anything.
  const seats = [
    { userId: 'u1', displayName: 'Thọ', bot: false },
    { userId: 'm1', displayName: 'Tư Ròm', bot: true },
    { userId: 'u2', displayName: 'Lan Anh', bot: false },
    { userId: 'm2', displayName: 'Út Mập', bot: true },
  ];

  // A machine came first, then Thọ, then the other machine, then Lan Anh.
  const paid = settlement(seats, [1, 0, 3, 2], 5000);

  assert.equal(paid.length, 2, 'only the people are paid');
  assert.deepEqual(paid.map((one) => [one.displayName, one.place, one.change]), [
    ['Thọ', 'Nhất', 5000],
    ['Lan Anh', 'Bét', -5000],
  ]);
});

test('a table with one person at it is played against the house, not for the room', () => {
  // Otherwise a table opened at fifty thousand and filled with machines prints gold.
  const seats = [
    { userId: 'u1', displayName: 'Thọ', bot: false },
    { userId: 'm1', displayName: 'Tư Ròm', bot: true },
  ];
  assert.equal(settlement(seats, [0, 1], 50_000)[0].change, BOT_STAKE);
});

test('a table of nobody pays nobody', () => {
  assert.deepEqual(settlement([{ userId: 'm', bot: true }], [0], 1000), []);
});

test('the day turns over at midnight in Vietnam, not in London', () => {
  // 16:30 UTC is 23:30 the same evening here; 17:30 UTC is half past midnight the next day.
  assert.equal(dayIn(Date.parse('2026-08-30T16:30:00Z')), '2026-08-30');
  assert.equal(dayIn(Date.parse('2026-08-30T17:30:00Z')), '2026-08-31');
});

test('gold is written the way it is read', () => {
  assert.equal(gold(0), '0');
  assert.equal(gold(999), '999');
  assert.equal(gold(1000), '1.000');
  assert.equal(gold(10_000), '10.000');
  assert.equal(gold(1_234_567), '1.234.567');
  assert.equal(gold(-2000), '-2.000');
});

test('a table can be opened at anything between the floor and the ceiling', () => {
  assert.equal(MIN_STAKE, 1000);
  assert.ok(STAKES.every((one) => one >= MIN_STAKE && one <= MAX_STAKE));
  assert.equal(STAKES[0], MIN_STAKE, 'the floor is the default');

  // The three presets are the common answers, not the only ones — anything typed is taken.
  assert.equal(asStake(7500), 7500);
  assert.equal(asStake('12345'), 12345);
  assert.equal(asStake(1500.6), 1501, 'rounded rather than refused');

  // And whatever a page anybody can edit sends is brought back inside.
  assert.equal(asStake(0), MIN_STAKE);
  assert.equal(asStake(-99), MIN_STAKE);
  assert.equal(asStake(MAX_STAKE * 10), MAX_STAKE);
  assert.equal(asStake('lots'), MIN_STAKE);
  assert.equal(asStake(undefined), MIN_STAKE);
  // Not a number is not a stake, however large it looks.
  assert.equal(asStake(Infinity), MIN_STAKE);
  assert.equal(asStake(NaN), MIN_STAKE);
  assert.equal(STARTING_GOLD, 20_000);
  assert.equal(DAILY_GOLD, 10_000);
  assert.ok(STARTING_GOLD >= STAKES[STAKES.length - 2],
    'a first purse should open more than the cheapest table on the list');
  assert.ok(STARTING_GOLD > BOT_STAKE * 4,
    'and survive a few hands against the machines before an advertisement is the only way on');
  assert.ok(DAILY_GOLD > BOT_STAKE * 2, 'a day of gold should be worth more than one hand');
  assert.equal(BROKE, BOT_STAKE, 'the moment there is no table to sit at is the moment to offer an ad');
  assert.ok(ADS_GOLD >= BROKE,
    'an advertisement that leaves somebody still short of the cheapest table has not helped');
});

test('nothing but declarations sits below the endless loop', () => {
  // Carobot lost three separate days to this and every one of them was invisible: a `const`
  // below the loop stays in the temporal dead zone for the life of the process, and a bare
  // call down there simply never happens. Function declarations are hoisted and work, which is
  // what makes the mistake so easy to make and so hard to see.
  const source = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');
  const below = source.slice(
    source.indexOf('  for (;;) {'),
    source.indexOf('if (process.argv[1]'));

  const offenders = below
    .split('\n')
    .filter((line) => /^  (const|let|var) /.test(line) || /^  [A-Za-z_$][\w$.]*\(/.test(line))
    .map((line) => line.trim());

  assert.deepEqual(offenders, [], `these run never or too late:\n${offenders.join('\n')}`);
});

// ---- a thousand hands played out ----------------------------------------------------------

import {
  applyPlay, applyPass, finish, TWO as _TWO,
} from './tienlenbot.mjs';

/// A table set up the way `startGame` sets one up, with no chat anywhere near it.
function tableOf(players, hands = deal(players)) {
  const opening = opensGame(hands);
  return {
    seats: Array.from({ length: players }, (_, seat) => ({ userId: `p${seat}`, bot: true })),
    hands,
    state: 'playing',
    turn: opening.seat,
    opensWith: opening.card,
    first: true,
    pile: null,
    passed: new Set(),
    finished: [],
    left: new Set(),
    ready: new Set(),
  };
}

/**
 * Plays a whole game out with the machine in every seat, checking every position on the way.
 *
 * This is the test the rest of the file cannot be. A round that ends one seat early, a turn
 * handed to somebody with no cards, a player who goes out twice — none of them look wrong on a
 * screen, and all of them are one line away in the four functions that move a table on.
 */
function playOut(players, assertions) {
  const game = tableOf(players);
  const dealt = game.hands.map((one) => [...one]);
  let turns = 0;

  while (game.state === 'playing') {
    assert.ok(++turns < 400, 'the table stopped moving');

    const seat = game.turn;
    assert.notEqual(seat, null);
    assert.ok(game.hands[seat].length, `seat ${seat} was given a turn with no cards`);
    assert.ok(!game.passed.has(seat), `seat ${seat} passed and was asked again`);

    const before = game.pile ? { ...game.pile.shape } : null;
    const cards = chooseMove(game.hands[seat], game.pile?.shape ?? null, {
      lowest: lowestElsewhere(game.hands, seat),
      mustInclude: game.first ? game.opensWith : null,
    });

    if (cards) {
      assert.ok(holdsAll(game.hands[seat], cards), 'played a card it was not holding');
      assert.ok(beats(shapeOf(cards), before), 'played something that does not beat the table');
      assert.ok(applyPlay(game, seat, cards), `${cards.map(nameOf)} was refused`);
    } else {
      assert.ok(game.pile, 'passed on an empty table');
      assert.ok(applyPass(game, seat));
    }

    assertions?.(game);
  }

  assert.equal(game.finished.length, players, 'not everybody was given a place');
  assert.equal(new Set(game.finished).size, players, 'somebody was placed twice');
  assert.ok(game.hands.every((one) => one.length === 0)
    || game.hands.filter((one) => one.length).length === 1,
    'more than one person was left holding cards');

  // Every card that was dealt is either still in a hand or was played out of one.
  game.hands.forEach((left, seat) => {
    assert.ok(left.every((card) => dealt[seat].includes(card)));
  });

  return game;
}

test('a hundred games at a full table finish, legally, with everybody placed', () => {
  for (let i = 0; i < 100; i++) playOut(4);
});

test('and at a table of two and of three', () => {
  for (let i = 0; i < 60; i++) { playOut(2); playOut(3); }
});

test('an empty table is always answered by somebody', () => {
  // Whoever wins a round leads the next one, and a leader may not pass. A table where the pile
  // is empty and the turn belongs to somebody who has gone out is a table that never moves.
  for (let i = 0; i < 50; i++) {
    playOut(4, (game) => {
      if (game.state !== 'playing') return;
      if (game.pile === null) {
        assert.ok(game.hands[game.turn].length, 'an empty table was left to somebody with no cards');
        assert.equal(game.passed.size, 0, 'a new round started with somebody already out of it');
      }
    });
  }
});

test('the first play of a game holds the lowest card in play, and nothing else has to', () => {
  for (let i = 0; i < 50; i++) {
    const game = tableOf(4);
    const opener = game.turn;
    const cards = chooseMove(game.hands[opener], null, { mustInclude: game.opensWith });

    assert.ok(applyPlay(game, opener, cards));
    assert.equal(game.first, false, 'the rule should stop applying after the opening');
  }
});

test('the opening play is refused if it does not hold that card', () => {
  const hands = [
    hand('3♠', '4♠', '5♠'),
    hand('6♠', '7♠', '8♠'),
  ];
  const game = tableOf(2, hands);

  assert.equal(game.turn, 0);
  assert.equal(applyPlay(game, 0, hand('4♠')), false, '4♠ is not the opening');
  assert.ok(applyPlay(game, 0, hand('3♠')));
});

test('a play is refused when the cards are not in the hand, or do not beat the table', () => {
  const game = tableOf(2, [hand('3♠', '4♠', '5♠'), hand('6♠', '7♠', '8♠')]);
  assert.ok(applyPlay(game, 0, hand('3♠')));

  assert.equal(applyPlay(game, 1, hand('K♥')), false, 'a card from nowhere');
  assert.equal(applyPlay(game, 1, hand('6♠', '7♠')), false, 'a pair over a single');
  assert.ok(applyPlay(game, 1, hand('6♠')));
});

test('you may not pass on an empty table', () => {
  const game = tableOf(2, [hand('3♠', '4♠'), hand('6♠', '7♠')]);
  assert.equal(applyPass(game, 0), false);
  assert.equal(game.turn, 0, 'and the turn stays where it was');
});

test('everybody passing gives the round back to whoever played last', () => {
  const game = tableOf(4, [
    hand('3♠', 'A♠'), hand('4♠', 'A♣'), hand('5♠', 'A♦'), hand('6♠', 'A♥'),
  ]);

  assert.ok(applyPlay(game, 0, hand('3♠')));
  assert.equal(game.turn, 1);
  applyPass(game, 1);
  applyPass(game, 2);
  applyPass(game, 3);

  assert.equal(game.turn, 0, 'the round comes back to the seat that played');
  assert.equal(game.pile, null, 'and the table is clear');
  assert.equal(game.passed.size, 0, 'and everybody is back in');
});

test('at a table of two, one pass ends the round', () => {
  const game = tableOf(2, [hand('3♠', 'A♠'), hand('4♠', 'A♣')]);

  assert.ok(applyPlay(game, 0, hand('3♠')));
  assert.equal(game.turn, 1);
  applyPass(game, 1);

  assert.equal(game.turn, 0);
  assert.equal(game.pile, null);
});

test('going out hands the round on rather than holding it', () => {
  // Whoever plays their last card cannot lead the next round. The seat after them does.
  const game = tableOf(3, [hand('3♠'), hand('4♠', 'K♠'), hand('5♠', 'K♣')]);

  assert.ok(applyPlay(game, 0, hand('3♠')), 'seat 0 goes out on the opening');
  assert.deepEqual(game.finished, [0]);
  assert.equal(game.turn, 1);

  applyPass(game, 1);
  applyPass(game, 2);
  assert.equal(game.turn, 1, 'the seat after the one that went out leads');
  assert.equal(game.pile, null);
});

test('the game ends when one person is left holding cards, and they come last', () => {
  const game = tableOf(2, [hand('3♠'), hand('4♠', 'K♠')]);

  assert.ok(applyPlay(game, 0, hand('3♠')));
  assert.equal(game.state, 'over');
  assert.deepEqual(game.finished, [0, 1]);
  assert.equal(placeName(1, 2), 'Bét');
});

test('walking out puts you under everybody who played it through', () => {
  // Otherwise the way never to come last is to leave whenever the cards are bad.
  const game = tableOf(4, [
    hand('3♠', 'A♠'), hand('4♠', 'A♣'), hand('5♠', 'A♦'), hand('6♠', 'A♥'),
  ]);

  // Seat 1 walks out while everybody else is still playing.
  game.hands[1] = [];
  game.left.add(1);
  game.passed.add(1);

  // The other three finish in order.
  game.finished.push(0, 2);
  game.hands[0] = [];
  game.hands[2] = [];
  finish(game);

  assert.deepEqual(game.finished, [0, 2, 3, 1],
    'the one who left is under the one who was still holding cards');
});

// ---- bầu cua tôm cá -----------------------------------------------------------------------

test('three dice, six faces, and nothing else on them', () => {
  assert.equal(DICE, 3);
  assert.deepEqual(FACES, ['bau', 'cua', 'tom', 'ca', 'ga', 'nai']);
  assert.equal(new Set(FACES).size, 6);
  assert.ok(FACES.every((face) => FACE_NAMES[face]));

  for (let i = 0; i < 500; i++) {
    const dice = roll();
    assert.equal(dice.length, DICE);
    assert.ok(dice.every((one) => FACES.includes(one)));
  }
});

test('a stake comes back with as much again for every die showing it', () => {
  // The rule everybody at a pavement table knows. A thousand on cua is worth a thousand, two or
  // three — or nothing at all, which is most of the time.
  assert.equal(faceWorth(1000, 'cua', ['cua', 'ga', 'nai']), 1000);
  assert.equal(faceWorth(1000, 'cua', ['cua', 'cua', 'nai']), 2000);
  assert.equal(faceWorth(1000, 'cua', ['cua', 'cua', 'cua']), 3000);
  assert.equal(faceWorth(1000, 'cua', ['bau', 'ga', 'nai']), -1000);
  assert.equal(faceWorth(0, 'cua', ['cua', 'cua', 'cua']), 0, 'nothing staked wins nothing');
});

test('a board is every stake on it, counted one face at a time', () => {
  const dice = ['cua', 'cua', 'ga'];
  assert.equal(boardWorth({ cua: 1000 }, dice), 2000);
  assert.equal(boardWorth({ cua: 1000, ga: 1000 }, dice), 3000);
  assert.equal(boardWorth({ cua: 1000, nai: 1000 }, dice), 1000);
  assert.equal(boardWorth({ nai: 1000, bau: 500 }, dice), -1500);
  assert.equal(boardWorth({}, dice), 0);
  assert.equal(boardWorth(null, dice), 0);
});

test('what is staked is the most a board can lose', () => {
  const bets = { cua: 1000, ga: 2000, nai: 500 };
  assert.equal(staked(bets), 3500);
  assert.equal(staked({}), 0);

  // Every throw there is, checked against the one thing that must always hold.
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      for (let c = 0; c < 6; c++) {
        const dice = [FACES[a], FACES[b], FACES[c]];
        const worth = boardWorth(bets, dice);
        assert.ok(worth >= -staked(bets), `${dice} lost more than was on the board`);
        assert.ok(worth <= staked(bets) * DICE, `${dice} paid more than three times`);
      }
    }
  }
});

test('the house edge is the drain, and it is the one everybody plays', () => {
  // A stake on one face, over every throw there is. The classic number: the house keeps a
  // little under eight percent, which is what stops the daily gold turning into a pile that
  // only ever grows.
  let total = 0;
  let throws = 0;
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      for (let c = 0; c < 6; c++) {
        total += faceWorth(1000, 'cua', [FACES[a], FACES[b], FACES[c]]);
        throws++;
      }
    }
  }
  assert.equal(throws, 216);
  const edge = -total / throws / 1000;
  assert.ok(edge > 0.07 && edge < 0.09, `house edge is ${(edge * 100).toFixed(2)}%`);
});

test('the tally says what to light up', () => {
  assert.deepEqual(tally(['cua', 'cua', 'ga']), { cua: 2, ga: 1 });
  assert.deepEqual(tally(['bau', 'tom', 'nai']), { bau: 1, tom: 1, nai: 1 });
  assert.deepEqual(tally(['ca', 'ca', 'ca']), { ca: 3 });
});

test('the chips are stakes anybody can reach', () => {
  assert.deepEqual(CHIPS, [1000, 5000, 20000]);
  assert.ok(CHIPS.every((one) => one >= MIN_STAKE));
  assert.ok(ROLL_MS >= 1000, 'a throw should be a throw, not a number appearing');
  assert.ok(SHOW_MS > ROLL_MS, 'and it should stay up long enough to be read');
});
