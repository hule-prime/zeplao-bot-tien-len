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
  chance, HISTORY,
  bombRank, isChop, worthOf, rotting, instantWin, INSTANT, PAIRS_WORTH, twoWorth,
  reckon, BLANCHE, decompose, playsAfter, unbeatable,
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
  // Đầu ván, bài còn dài: quả bom còn cả ván để chờ một con heo đáng hơn, và bốn lá đổi lấy
  // một vòng lúc này là bốn lá cho không.
  const early = hand('5♠', '5♣', '5♦', '5♥',
    '3♦', '4♦', '6♦', '7♦', '9♦', '10♦', 'J♦', 'Q♦', 'K♦');
  assert.equal(chooseMove(early, kindOf('2♥'), { lowest: 13 }), null);

  // Bài đã ngắn thì chặt, và không cần ai sắp về mới chặt: con heo ấy là con họ đang trông vào,
  // còn quả bom thì không còn ván nào để chờ nữa. Đây là chỗ máy cũ chơi dở — nó cộng thẳng
  // 120 điểm cho mọi quả bom nên nó *né* chặt, kể cả khi chặt là nước đúng.
  const late = hand('5♠', '5♣', '5♦', '5♥', '3♦');
  assert.deepEqual(chooseMove(late, kindOf('2♥'), { lowest: 13 }),
    hand('5♠', '5♣', '5♦', '5♥'), 'năm lá trên tay mà không chặt heo là giữ bom cho ván sau');

  // Và luôn chặt khi có người sắp về, dù bài còn dài.
  assert.deepEqual(chooseMove(early, kindOf('2♥'), { lowest: 2 }),
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

test('the dice do not come out of Math.random', () => {
  // They are thrown after the bets are down, in front of everybody, every twenty-five seconds —
  // and this source is public. `Math.random` is xorshift128+ and recoverable from its own
  // output, so anybody patient enough could work out what the next throw was going to be.
  //
  // Held down rather than argued about: if `roll` ever reaches for it again, this fails.
  const real = Math.random;
  Math.random = () => 0;
  try {
    const thrown = new Set();
    for (let i = 0; i < 200; i++) thrown.add(roll().join(''));
    assert.ok(thrown.size > 20,
      `${thrown.size} different throws out of 200 — the dice are following Math.random`);
  } finally {
    Math.random = real;
  }
});

test('and neither does the deal', () => {
  const real = Math.random;
  Math.random = () => 0;
  try {
    const dealt = new Set();
    for (let i = 0; i < 50; i++) dealt.add(deal(4)[0].join(','));
    assert.equal(dealt.size, 50, 'every deal should be its own');
  } finally {
    Math.random = real;
  }
});

test('chance is a number in [0, 1) and not the same one twice', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const one = chance();
    assert.ok(one >= 0 && one < 1, `${one} is not in [0, 1)`);
    seen.add(one);
  }
  assert.ok(seen.size > 1990, 'the same number keeps coming back');
});

test('the dice cannot see the money, because there is no way in', () => {
  // The plainest guarantee available: a function that takes nothing cannot be told who is at
  // the table, what is on the board, or how much of it. Pinned, because the easy way to make a
  // house cheat is to add a parameter here and nobody notice.
  assert.equal(roll.length, 0, 'roll() grew an argument');

  // The function itself, not the prose after it — the next thing in the file is a comment about
  // stakes, and a check that reads it is a check that fails for the wrong reason.
  const source = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');
  const from = source.indexOf('export function roll()');
  const body = source.slice(from, source.indexOf('\n}', from) + 2);
  assert.ok(!/bets|placed|staked|game|seat|gold/.test(body),
    `the throw mentions something it has no business knowing:\n${body}`);
});

test('every face comes up as often as every other', () => {
  const N = 60_000;
  const seen = Object.fromEntries(FACES.map((face) => [face, 0]));
  for (let i = 0; i < N; i++) for (const face of roll()) seen[face]++;

  // Three standard errors on 180.000 throws of a fair six is about 0.26 percentage points.
  for (const face of FACES) {
    const pct = (seen[face] / (N * DICE)) * 100;
    assert.ok(Math.abs(pct - 100 / 6) < 0.4, `${face} came up ${pct.toFixed(3)}% of the time`);
  }
});

test('the house edge is the one every pavement table plays, and no more', () => {
  // 17/216. Not fifty-fifty and never was: a stake comes back doubled on one die of three, and
  // three times out of five it does not come back at all. Worked out exactly rather than
  // sampled, so this is the number itself and not a measurement of it.
  let total = 0;
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      for (let c = 0; c < 6; c++) {
        total += faceWorth(216, 'cua', [FACES[a], FACES[b], FACES[c]]);
      }
    }
  }
  // A 216 stake over all 216 throws loses exactly 17 × 216 / 216 = 17 per 216 staked.
  assert.equal(total, -17 * 216);
  assert.equal(-total / (216 * 216), 17 / 216);
});

test('the board of past throws keeps thirty and forgets the rest', () => {
  assert.equal(HISTORY, 30);

  let history = [];
  for (let i = 0; i < 100; i++) {
    const dice = roll();
    history = [dice, ...history].slice(0, HISTORY);
    assert.ok(history.length <= HISTORY);
    assert.deepEqual(history[0], dice, 'newest first');
  }
  assert.equal(history.length, HISTORY);
});

test('the run of throws is written down, not kept in the head', () => {
  // The world bowl is permanent and a deploy is not. A soi cầu board that starts again empty
  // every time the bot restarts is a board reaching back less far than the person reading it,
  // which is worth nothing — so it goes on disk with the gold rather than in memory with the
  // tables. Pinned at three points, because it takes all three to work: read at start, seeded
  // into the bowl, written after a throw.
  const source = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');

  assert.match(source, /kept\.cau = Array\.isArray\(kept\.cau\)/,
    'the ledger no longer reads a run of throws back');
  assert.match(source, /history: scores\.cau/,
    'the world bowl no longer starts from what was written down');
  assert.match(source, /game\.world.*scores\.cau = game\.history.*saveScores\(\)/s,
    'a throw is no longer written down');

  // And only the world one. A private bowl belongs to one person for as long as they have it
  // open; writing its throws into the shared board would put one person's afternoon into
  // everybody else's history.
  const at = source.indexOf('scores.cau = game.history');
  assert.ok(source.lastIndexOf('game.world', at) > at - 60,
    'the run of throws is written for bowls that are not the world one');
});

test('a watcher has no `me`, and the page never reads through it on a bầu cua push', () => {
  // The one crash that got out. Somebody watching the world bowl gets `me: null`, and the
  // shared push has no `me` at all — reading `next.me.theirs` threw, and a throw inside onState
  // stops the render, so the table froze on the round before with the last round's stakes still
  // on it. It looked like a stuck board rather than an error, which is why it was reported as
  // one.
  const widget = readFileSync(new URL('./widget/tienlen.js', import.meta.url), 'utf8');

  // Kiểm bằng văn bản chứ không phải bằng cây cú pháp, nên luật phải là một luật viết được:
  // **mọi lần đọc xuyên `next.me` phải có `next.me &&` ngay trước nó**, trong vòng sáu mươi ký
  // tự. Chỗ nào cần đọc nhiều lần thì buộc vào một biến cục bộ ngay sau khi kiểm — mà đó cũng là
  // cách viết đúng hơn, nên cái test chặt ở đây không phải là cái test khó chiều.
  for (const match of widget.matchAll(/next\.me\./g)) {
    const before = widget.slice(Math.max(0, match.index - 60), match.index);
    assert.ok(before.includes('next.me &&'),
      `read through next.me with nothing checking it, at ${match.index}: `
      + `...${before.slice(-60)}next.me.`);
  }

  // The bầu cua half of onState, where a watcher actually turns up.
  const from = widget.indexOf("if (next.kind === 'baucua') {\n    const mine = next.me;");
  assert.ok(from !== -1, 'the board-handover block moved');
  const block = widget.slice(from, widget.indexOf('\n  } else if (stack.length', from));
  for (const match of block.matchAll(/\bmine\./g)) {
    const before = block.slice(Math.max(0, match.index - 12), match.index);
    assert.ok(/mine &&\s*$/.test(before),
      `read through mine with nothing checking it: ...${before}mine.`);
  }
});

// ---- thang chặt, đủ bảy bậc ------------------------------------------------------------------

test('the ladder of chặt has seven rungs and no gap in it', () => {
  const rung = (...names) => bombRank(kindOf(...names));

  assert.equal(rung('2♠'), 0, 'heo lẻ');
  assert.equal(rung('2♠', '2♥'), 1, 'đôi heo');
  assert.equal(rung('3♠', '3♣', '4♠', '4♣', '5♠', '5♣'), 2, 'ba đôi thông');
  assert.equal(rung('7♠', '7♣', '7♦', '7♥'), 3, 'tứ quý');
  assert.equal(rung('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣'), 4, 'bốn đôi thông');
  assert.equal(rung('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣'), 5, 'năm đôi');
  assert.equal(
    rung('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣', '8♠', '8♣'), 6, 'sáu đôi');

  // Không nằm trên thang thì không phải đích của chặt.
  assert.equal(rung('A♥'), null);
  assert.equal(rung('K♠', 'K♥'), null);
  assert.equal(rung('9♠', '9♣', '9♦'), null, 'bộ ba không phải bom');
});

test('a longer run of pairs cuts a shorter one, which it could not before', () => {
  const four = kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣');
  const five = kindOf('7♠', '7♣', '8♠', '8♣', '9♠', '9♣', '10♠', '10♣', 'J♠', 'J♣');
  const six = kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣', '8♠', '8♣');
  const quad = kindOf('4♠', '4♣', '4♦', '4♥');

  // Đây là lỗi cũ: năm đôi thông rơi thẳng xuống `return false`, không đè nổi cái gì.
  assert.ok(beats(five, four), 'năm đôi thông phải chặt được bốn đôi thông');
  assert.ok(beats(five, quad), 'và chặt được tứ quý');
  assert.ok(beats(six, five), 'sáu đôi thông chặt năm');
  assert.ok(!beats(four, five), 'ngược lại thì không');

  // Cùng bậc thì so lá cao nhất, không phải chặt.
  const lowFive = kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♥');
  assert.ok(beats(five, lowFive));
  assert.ok(!beats(lowFive, five));
});

test('three consecutive pairs takes a lone 2 and nothing else', () => {
  const three = kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣');
  assert.ok(beats(three, kindOf('2♠')), 'chặt được heo lẻ');
  assert.ok(!beats(three, kindOf('2♠', '2♥')), 'nhưng không chặt được đôi heo');
  assert.ok(!beats(three, kindOf('9♠', '9♣', '9♦', '9♥')), 'và không chặt được tứ quý');
});

test('a bomb landing on a 2 or on a bomb is a chặt; a higher pair is not', () => {
  const quad = kindOf('4♠', '4♣', '4♦', '4♥');
  assert.ok(isChop(quad, kindOf('2♠')));
  assert.ok(isChop(quad, kindOf('3♠', '3♣', '4♠', '4♣', '5♠', '5♣')));
  assert.ok(isChop(quad, kindOf('9♠', '9♣', '9♦', '9♥')), 'tứ quý đè tứ quý là chặt chồng');

  assert.ok(!isChop(kindOf('K♠', 'K♥'), kindOf('Q♠', 'Q♥')), 'đôi lớn hơn không phải chặt');
  assert.ok(!isChop(kindOf('2♥'), kindOf('A♠')), 'heo đè át cũng không phải chặt');
  assert.ok(!isChop(quad, null), 'dẫn bằng tứ quý thì không chặt ai cả');
});

// ---- tiền: chặt bao nhiêu, thối bao nhiêu -----------------------------------------------------

test('a black 2 and a red 2 are not the same money', () => {
  assert.equal(twoWorth(c('2', '♠')), 1);
  assert.equal(twoWorth(c('2', '♣')), 1);
  assert.equal(twoWorth(c('2', '♦')), 2);
  assert.equal(twoWorth(c('2', '♥')), 2);

  assert.equal(worthOf(hand('2♠')), 1);
  assert.equal(worthOf(hand('2♥')), 2);
  assert.equal(worthOf(hand('2♠', '2♥')), 3, 'đôi heo đen đỏ');
  assert.equal(worthOf(hand('2♦', '2♥')), 4, 'đôi heo đỏ cả hai');
});

test('what a bomb is worth is what the table pays for it', () => {
  assert.equal(worthOf(hand('7♠', '7♣', '7♦', '7♥')), 3, 'tứ quý');
  assert.equal(worthOf(hand('3♠', '3♣', '4♠', '4♣', '5♠', '5♣')), PAIRS_WORTH[3]);
  assert.equal(PAIRS_WORTH[3], 2);
  assert.equal(PAIRS_WORTH[4], 4);
  assert.equal(PAIRS_WORTH[5], 5);
  assert.equal(PAIRS_WORTH[6], 6);

  // Không phải bom, không phải heo thì không đáng gì.
  assert.equal(worthOf(hand('K♠', 'K♥')), 0);
  assert.equal(worthOf(hand('5♠', '6♠', '7♠')), 0);
});

test('what is still in a hand at the end is counted card by card', () => {
  assert.equal(rotting(hand('5♠', '9♦')), 0, 'bài thường không thối');
  assert.equal(rotting(hand('2♠')), 1);
  assert.equal(rotting(hand('2♠', '2♦')), 3, 'một đen một đỏ, tính riêng từng con');
  assert.equal(rotting(hand('7♠', '7♣', '7♦', '7♥')), 3, 'ôm tứ quý');
  assert.equal(rotting(hand('2♥', '7♠', '7♣', '7♦', '7♥')), 5, 'ôm cả heo đỏ lẫn tứ quý');

  // Năm đôi liên tiếp là một dây năm, không phải một dây ba với hai đôi thừa.
  const five = hand('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣');
  assert.equal(rotting(five), PAIRS_WORTH[5]);

  // Hai dây rời nhau thì tính hai lần.
  const two = hand('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '9♠', '9♣', '10♠', '10♣', 'J♠', 'J♣');
  assert.equal(rotting(two), PAIRS_WORTH[3] * 2);

  // Đôi heo không nằm trong đôi thông, nhưng vẫn thối theo con.
  assert.equal(rotting(hand('A♠', 'A♣', '2♠', '2♣')), 2);
});

// ---- tới trắng --------------------------------------------------------------------------------

test('the five hands that are over before they start', () => {
  const quadTwos = hand('2♠', '2♣', '2♦', '2♥', '3♠', '4♠', '5♠', '6♠', '8♠', '9♠', 'J♠', 'Q♠', 'K♦');
  assert.equal(instantWin(quadTwos), INSTANT.quadTwos);

  const dragon = hand('3♠', '4♠', '5♠', '6♠', '7♠', '8♠', '9♠', '10♠', 'J♠', 'Q♠', 'K♠', 'A♠', '3♥');
  assert.equal(instantWin(dragon), INSTANT.dragon);

  const fivePairs = hand('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣', '9♠', 'J♦', 'K♥');
  assert.equal(instantWin(fivePairs), INSTANT.fivePairs);

  const sixPairs = hand('3♠', '3♣', '5♠', '5♣', '7♠', '7♣', '9♠', '9♣', 'J♠', 'J♣', 'K♠', 'K♣', '4♦');
  assert.equal(instantWin(sixPairs), INSTANT.sixPairs);

  // Sáu đôi được phép tính cả đôi heo — nó không phải đôi thông, nó chỉ là một đôi.
  const sixWithTwos = hand('3♠', '3♣', '5♠', '5♣', '7♠', '7♣', '9♠', '9♣', 'J♠', 'J♣', '2♠', '2♣', '4♦');
  assert.equal(instantWin(sixWithTwos), INSTANT.sixPairs);
});

test('and the hands that only look like them', () => {
  // Bốn đôi thông thôi thì chưa tới trắng.
  assert.equal(
    instantWin(hand('3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '9♠', 'J♦', 'K♥', 'A♠', '7♦')),
    null);

  // Năm đôi nhưng không thông.
  assert.equal(
    instantWin(hand('3♠', '3♣', '5♠', '5♣', '7♠', '7♣', '9♠', '9♣', 'J♠', 'J♣', 'K♥', 'A♠', '4♦')),
    null);

  // Sảnh mười một lá, thiếu đúng một hạng.
  assert.equal(
    instantWin(hand('3♠', '4♠', '5♠', '6♠', '7♠', '8♠', '9♠', '10♠', 'J♠', 'Q♠', 'K♠', '3♥', '4♥')),
    null);

  // Ba con heo chưa phải tứ quý heo.
  assert.equal(
    instantWin(hand('2♠', '2♣', '2♦', '3♠', '4♠', '6♠', '8♠', '9♠', 'J♠', 'Q♠', 'K♦', '7♥', '10♣')),
    null);

  assert.equal(instantWin(hand('3♠', '4♥', '9♦')), null, 'bài thường');
});

test('a dealt table throws up a tới trắng about as often as the arithmetic says', () => {
  // Không ghim một con số chính xác — ghim rằng nó hiếm mà không phải không bao giờ, vì cả hai
  // đầu đều là lỗi: không bao giờ nghĩa là hàm sai, mà thường xuyên nghĩa là luật sai.
  let seen = 0;
  for (let i = 0; i < 4000; i++) {
    for (const one of deal(4)) if (instantWin(one)) seen++;
  }
  assert.ok(seen > 0, 'bốn nghìn ván mà không ván nào tới trắng thì hàm hỏng');
  assert.ok(seen < 16000 * 0.05, `tới trắng ${seen}/16000 tay là quá nhiều`);
});

// ---- tiền trên một cái bàn thật ---------------------------------------------------------------

/// Một cái bàn dựng tay, để hỏi luật tiền mà không phải chơi hết một ván.
function table(hands, { bots = [], stake = 1000 } = {}) {
  const seats = hands.map((_, seat) => ({
    userId: bots.includes(seat) ? `machine:${seat}` : `u${seat}`,
    displayName: bots.includes(seat) ? `Máy ${seat}` : `Người ${seat}`,
    bot: bots.includes(seat),
  }));
  return {
    kind: 'tienlen', state: 'playing', seats, hands: hands.map((one) => [...one]),
    stake, turn: 0, pile: null, passed: new Set(), finished: [], left: new Set(),
    play: new Set(), chops: new Map(), chopped: [], pot: 0,
    rot: null, owes: null, owesWhy: null, blanche: null, wonWith: null,
    first: false, opensWith: null, ready: new Set(), paidTo: new Map(), paid: [],
    touched: Date.now(),
  };
}

const paidBy = (game) => settlement(game.seats, game.finished, game.stake, {
  chops: game.chops, rot: game.rot, blanche: game.blanche, owes: game.owes,
});
const sum = (paid) => paid.reduce((total, one) => total + one.change, 0);
const forUser = (paid, id) => paid.find((one) => one.userId === id) ?? {};

test('cutting a 2 is paid by whoever put the 2 down', () => {
  const game = table([
    hand('2♥', '5♠'),
    hand('7♠', '7♣', '7♦', '7♥', '3♠'),
    hand('4♠', '4♣'),
    hand('6♠', '6♣'),
  ]);

  assert.ok(applyPlay(game, 0, hand('2♥')), 'heo đỏ xuống bàn');
  assert.ok(applyPlay(game, 1, hand('7♠', '7♣', '7♦', '7♥')), 'tứ quý chặt');

  // Heo đỏ đáng hai phần cược.
  assert.equal(game.chops.get('u1'), 2);
  assert.equal(game.chops.get('u0'), -2);
  assert.equal(game.pot, 2, 'cái nồi giờ nằm trên đầu người vừa chặt');
});

test('chặt chồng: whoever is cut last carries the whole run of it', () => {
  const game = table([
    hand('2♠', '5♠'),
    hand('7♠', '7♣', '7♦', '7♥', '3♠'),
    hand('3♣', '3♦', '4♣', '4♦', '5♣', '5♦', '6♣', '6♦', '9♠'),
    hand('8♠', '8♣'),
  ]);

  applyPlay(game, 0, hand('2♠'));                                    // heo đen, 1 phần
  applyPlay(game, 1, hand('7♠', '7♣', '7♦', '7♥'));                  // tứ quý chặt, ăn 1
  applyPlay(game, 2, hand('3♣', '3♦', '4♣', '4♦', '5♣', '5♦', '6♣', '6♦'));  // bốn đôi thông

  // Người thứ ba ăn cả nồi (1) cộng giá tứ quý (3) = 4, lấy của người thứ hai.
  assert.equal(game.chops.get('u0'), -1, 'chủ con heo mất đúng con heo của mình');
  assert.equal(game.chops.get('u1'), 1 - 4, 'người chặt giữa vừa ăn vừa bị đè');
  assert.equal(game.chops.get('u2'), 4);
  assert.equal([...game.chops.values()].reduce((a, b) => a + b, 0), 0, 'tổng bằng không');
});

test('a machine neither collects a chặt nor pays for one', () => {
  const game = table([
    hand('2♥', '5♠'),
    hand('7♠', '7♣', '7♦', '7♥', '3♠'),
    hand('4♠', '4♣'),
    hand('6♠', '6♣'),
  ], { bots: [0] });

  applyPlay(game, 0, hand('2♥'));
  applyPlay(game, 1, hand('7♠', '7♣', '7♦', '7♥'));
  assert.equal(game.chops.size, 0, 'chặt con heo của máy thì không ai được gì');
});

test('and none of it happens at a table with one person in it', () => {
  const game = table([
    hand('2♥', '5♠'),
    hand('7♠', '7♣', '7♦', '7♥', '3♠'),
  ], { bots: [1] });

  applyPlay(game, 0, hand('2♥'));
  applyPlay(game, 1, hand('7♠', '7♣', '7♦', '7♥'));
  assert.equal(game.chops.size, 0);
});

test('what is left in a losing hand goes to whoever went out first', () => {
  const game = table([hand('3♠'), hand('2♥', '2♦'), hand('4♠')]);
  game.finished = [0, 1, 2];
  game.hands = [[], hand('2♥', '2♦'), hand('4♠')];
  game.play = new Set([0, 1, 2]);
  game.state = 'over';
  reckon(game);

  assert.equal(game.rot.get('u1'), 4, 'hai con heo đỏ');
  assert.ok(!game.rot.has('u2'), 'bài thường không thối');

  const paid = paidBy(game);
  assert.equal(forUser(paid, 'u1').rot, -4000);
  assert.equal(forUser(paid, 'u0').rot, 4000, 'về nhất thu');
  assert.equal(sum(paid), 0);
});

test('a hand played out without putting down one card pays for the table', () => {
  const game = table([hand('3♠'), hand('4♠'), hand('5♠')]);
  game.finished = [0, 1, 2];
  game.hands = [[], [], hand('5♠')];
  game.play = new Set([0, 1]);            // người thứ ba chưa đánh lá nào
  game.state = 'over';
  reckon(game);

  assert.equal(game.owes, 'u2');
  assert.equal(game.owesWhy, 'cóng');

  const paid = paidBy(game);
  // Ba người: nhất +1, nhì 0, bét −1. Người cóng gánh cả phần thua.
  assert.equal(forUser(paid, 'u0').change, 1000);
  assert.equal(forUser(paid, 'u2').change, -1000);
  assert.equal(sum(paid), 0);
});

test('two people cóng and nobody pays for the table', () => {
  const game = table([hand('3♠'), hand('4♠'), hand('5♠'), hand('6♠')]);
  game.finished = [0, 1, 2, 3];
  game.hands = [[], hand('4♠'), hand('5♠'), hand('6♠')];
  game.play = new Set([0, 1]);
  game.state = 'over';
  reckon(game);
  assert.equal(game.owes, null, 'hai người cùng cóng thì không ai đền cho ai');
});

test('going out on a 2 somebody could have cut costs them the table', () => {
  const game = table([hand('2♥'), hand('3♠'), hand('4♠')]);
  game.finished = [0, 1, 2];
  game.hands = [[], hand('7♠', '7♣', '7♦', '7♥'), hand('4♠')];
  game.wonWith = hand('2♥');
  game.play = new Set([0, 1, 2]);
  game.state = 'over';
  reckon(game);

  assert.equal(game.owes, 'u1', 'người ôm tứ quý mà không chặt');
  assert.equal(game.owesWhy, 'ôm hàng');

  const paid = paidBy(game);
  assert.equal(sum(paid), 0);
  assert.ok(forUser(paid, 'u1').owes < 0 || forUser(paid, 'u1').change < 0);
});

test('and not when two of them could have', () => {
  const game = table([hand('2♥'), hand('3♠'), hand('4♠')]);
  game.finished = [0, 1, 2];
  game.hands = [[], hand('7♠', '7♣', '7♦', '7♥'), hand('9♠', '9♣', '9♦', '9♥')];
  game.wonWith = hand('2♥');
  game.play = new Set([0, 1, 2]);
  game.state = 'over';
  reckon(game);
  assert.equal(game.owes, null, 'hai người cùng ôm hàng thì không chỉ mặt ai được');
});

test('nor when the hand was not won on a 2 at all', () => {
  const game = table([hand('A♥'), hand('3♠'), hand('4♠')]);
  game.finished = [0, 1, 2];
  game.hands = [[], hand('7♠', '7♣', '7♦', '7♥'), hand('4♠')];
  game.wonWith = hand('A♥');
  game.play = new Set([0, 1, 2]);
  game.state = 'over';
  reckon(game);
  assert.equal(game.owes, null);
});

test('tới trắng takes three stakes from everybody and no placing money at all', () => {
  const game = table([hand('3♠'), hand('4♠'), hand('5♠')]);
  game.finished = [0, 1, 2];
  game.blanche = 'u0';
  const paid = paidBy(game);

  assert.equal(forUser(paid, 'u0').change, BLANCHE * 1000 * 2, 'ba lần cược từ mỗi người');
  assert.equal(forUser(paid, 'u1').change, -BLANCHE * 1000);
  assert.equal(forUser(paid, 'u2').change, -BLANCHE * 1000);
  assert.equal(forUser(paid, 'u1').placing, 0, 'không có tiền thứ hạng, vì không ai đánh gì');
  assert.equal(sum(paid), 0);
});

test('every way a hand can end still adds to nothing', () => {
  // Cái test đáng giá nhất trong file này. Lỗi tiền là lỗi duy nhất người chơi nhớ mãi, và một
  // cái bàn in ra vàng thì không ai báo — họ chỉ ở lại chơi.
  const ways = [
    { what: 'thường', build: (g) => { g.finished = [0, 1, 2, 3]; g.play = new Set([0, 1, 2, 3]); } },
    { what: 'có thối', build: (g) => {
      g.finished = [0, 1, 2, 3]; g.play = new Set([0, 1, 2, 3]);
      g.hands = [[], hand('2♥'), hand('2♠', '2♣'), hand('7♠', '7♣', '7♦', '7♥')];
    } },
    { what: 'có chặt', build: (g) => {
      g.finished = [0, 1, 2, 3]; g.play = new Set([0, 1, 2, 3]);
      g.chops = new Map([['u0', 3], ['u1', -5], ['u2', 2], ['u3', 0]]);
    } },
    { what: 'có cóng', build: (g) => {
      g.finished = [0, 1, 2, 3]; g.play = new Set([0, 1, 2]);
      g.hands = [[], [], [], hand('9♠')];
    } },
    { what: 'cóng và thối cùng lúc', build: (g) => {
      g.finished = [0, 1, 2, 3]; g.play = new Set([0, 1, 2]);
      g.hands = [[], [], hand('2♥'), hand('2♠', '7♠', '7♣', '7♦', '7♥')];
    } },
    { what: 'tới trắng', build: (g) => { g.finished = [0, 1, 2, 3]; g.blanche = 'u1'; } },
    { what: 'hai người và hai máy', build: (g) => {
      g.seats[2].bot = true; g.seats[3].bot = true;
      g.seats[2].userId = 'machine:2'; g.seats[3].userId = 'machine:3';
      g.finished = [0, 2, 1, 3]; g.play = new Set([0, 1, 2, 3]);
      g.hands = [[], [], [], hand('2♥')];
    } },
  ];

  for (const { what, build } of ways) {
    const game = table([hand('3♠'), hand('4♠'), hand('5♠'), hand('6♠')]);
    game.hands = [[], [], [], []];
    build(game);
    game.state = 'over';
    if (!game.blanche) reckon(game);
    const paid = paidBy(game);
    assert.equal(sum(paid), 0, `${what}: bàn làm ra ${sum(paid)} vàng từ hư không`);
  }
});

// ---- máy mới đấu máy cũ -----------------------------------------------------------------------

/**
 * Cái máy trước khi sửa, chép nguyên vào đây.
 *
 * Không phải để giữ lại, mà để đo. "Thông minh hơn" nói suông thì không kiểm được; hai con bot
 * ngồi đánh nhau hai nghìn ván thì kiểm được. Nó chấm điểm từng nước một và không bao giờ nhìn
 * cả tay bài — đó chính là chỗ nó thua.
 */
function greedyCost(move, hand) {
  let cost = move.shape.top - move.cards.length * 6;
  if (rankOf(move.shape.top) === _TWO) cost += 60;
  if (isBomb(move.shape)) cost += 120;

  const groups = new Map();
  for (const card of hand) {
    const rank = rankOf(card);
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank).push(card);
  }
  for (const [rank, cards] of groups) {
    const taken = move.cards.filter((card) => rankOf(card) === rank).length;
    if (taken === 0 || taken === cards.length) continue;
    if (cards.length === 4) cost += 100;
    else if (cards.length === 3 && taken === 1) cost += 15;
  }
  return cost;
}

function greedyChoose(hand, pile, { lowest = 13, mustInclude = null } = {}) {
  let moves = movesFrom(hand).filter((move) => beats(move.shape, pile));
  if (mustInclude !== null) moves = moves.filter((move) => move.cards.includes(mustInclude));
  if (!moves.length) return null;

  const out = moves.find((move) => move.cards.length === hand.length);
  if (out) return out.cards;

  const scored = moves
    .map((move) => ({ move, cost: greedyCost(move, hand) }))
    .sort((a, b) => a.cost - b.cost);
  const cheapest = scored[0];

  if (!pile) {
    const ordinary = scored.find(({ move }) => !isBomb(move.shape));
    return (ordinary ?? cheapest).move.cards;
  }
  const expensive = isBomb(cheapest.move.shape) || rankOf(cheapest.move.shape.top) === _TWO;
  if (expensive && lowest > 2) return null;
  return cheapest.move.cards;
}

/// Một ván đủ, mỗi ghế một cái đầu. Trả về ghế về nhất.
function duel(brains, hands) {
  const game = tableOf(brains.length, hands);
  const seen = [];
  let turns = 0;

  while (game.state === 'playing') {
    if (++turns > 400) return null;
    const seat = game.turn;
    const cards = brains[seat](game.hands[seat], game.pile?.shape ?? null, {
      lowest: lowestElsewhere(game.hands, seat),
      mustInclude: game.first ? game.opensWith : null,
      seen: [...seen],
    });
    if (cards) { seen.push(...cards); applyPlay(game, seat, cards); } else applyPass(game, seat);
  }
  return game.finished[0];
}

test('the machine that reads the whole hand beats the one that reads one play', () => {
  // Ngưỡng 60%. Dưới đó thì công sức phân rã bài không đáng, và nói "thông minh hơn" là nói
  // suông. Hai ghế, đổi chỗ mỗi ván để không ai được lợi vì đi trước.
  //
  // Đo được 62% ở bàn hai người và 63–65% ở bàn bốn. Ngưỡng đặt ở 57%, thấp hơn số đo khoảng
  // bốn lần sai số — một cái test chập chờn còn tệ hơn không có test, vì lần đỏ nào cũng bị coi
  // là "chạy lại phát nữa xem".
  for (const players of [2, 4]) {
    const N = 1200;
    let won = 0;
    let played = 0;

    for (let i = 0; i < N; i++) {
      const hands = deal(players);
      // Đổi chỗ mỗi ván, để không ai được lợi vì cái ghế đi trước.
      const brains = Array.from({ length: players },
        (_, seat) => ((seat + i) % 2 === 0 ? chooseMove : greedyChoose));
      const first = duel(brains, hands.map((one) => [...one]));
      if (first === null) continue;
      played++;
      if (brains[first] === chooseMove) won++;
    }

    const rate = won / played;
    console.log(`    bàn ${players} người · máy mới thắng ${(rate * 100).toFixed(1)}% `
      + `(${won}/${played})`);
    assert.ok(played > N * 0.98, `${N - played} ván không kết thúc`);
    assert.ok(rate >= 0.57,
      `bàn ${players}: máy mới chỉ thắng ${(rate * 100).toFixed(1)}% (${won}/${played})`);
  }
});

test('and it does it inside a turn nobody waits for', () => {
  // Bàn bốn máy nghĩ nối tiếp nhau. Một nước 50ms là bốn nước 200ms, đã thấy ì; chậm hơn nữa
  // thì cái bàn đứng hình chứ không phải cái máy đang suy nghĩ.
  const took = [];
  for (let i = 0; i < 200; i++) {
    const hand = deal(4)[0];
    const began = performance.now();
    chooseMove(hand, null, { lowest: 13, seen: [] });
    took.push(performance.now() - began);
  }
  took.sort((a, b) => a - b);
  const middle = took[Math.floor(took.length / 2)];
  const worst = took[took.length - 1];

  // Trung vị, không phải lần tệ nhất.
  //
  // Cái phải trả lời là "một nước có chậm tới mức bàn bốn máy thấy ì không", mà một lần đo lẻ
  // bị bộ dọn rác hay bộ định thời của máy chen ngang thì không trả lời câu đó — nó chỉ nói máy
  // lúc ấy đang bận. Ghim trung vị chặt, và để lần tệ nhất một khoảng rộng: nếu phân rã bài
  // chậm đi thật thì trung vị nhảy trước tiên.
  assert.ok(middle < 15, `nước trung vị mất ${middle.toFixed(1)}ms`);
  assert.ok(worst < 250, `nước chậm nhất mất ${worst.toFixed(1)}ms`);
});

test('a hand cut into the fewest plays is cut correctly', () => {
  // Sáu lá này không phải hai sảnh — nó là ba đôi thông, và ba đôi thông là *một* nước. Đúng
  // cái bẫy: hai dây song song cùng khoảng bao giờ cũng đồng thời là một dây đôi thông, nên chỗ
  // bóc dây có ích lại nằm ở hai dây **khác độ dài**.
  assert.equal(decompose(hand('5♠', '5♣', '6♠', '6♣', '7♠', '7♣')).plays, 1, 'ba đôi thông');

  // Đây mới là chỗ nó có ích. Sảnh 3-4-5-6-7 rồi còn 5♣6♣7♣ là hai nước; mà `movesFrom` không
  // bao giờ sinh ra cái sảnh thứ hai, nên nếu chỉ dựa vào nó thì tay này bị đọc thành ba nước
  // (ba đôi thông, rồi 3♠, rồi 4♠).
  const stagger = hand('3♠', '4♠', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣');
  assert.equal(decompose(stagger).plays, 2, 'sảnh dài rồi sảnh ngắn');

  assert.equal(decompose(hand('7♠', '7♣', '7♦', '7♥')).plays, 1, 'tứ quý là một nước');
  assert.equal(decompose(hand('3♠', '5♣', '9♦')).plays, 3, 'ba lá rời là ba nước');
  assert.equal(decompose(hand('3♠', '4♣', '5♦', '9♦')).plays, 2, 'một sảnh và một lá');
  assert.equal(decompose([]).plays, 0);

  // Và đọc lại được số nước còn lại sau một nước bất kỳ.
  const plan = decompose(hand('3♠', '4♣', '5♦', '9♦'));
  assert.equal(playsAfter(plan, hand('3♠', '4♣', '5♦')), 1);
  assert.equal(playsAfter(plan, hand('9♦')), 1);
  assert.equal(playsAfter(plan, hand('3♠')), 3, 'xé sảnh thì còn ba nước lẻ');
});

test('it does not break a run it did not have to break', () => {
  // Chỗ máy cũ mù: `costOf` phạt xé tứ quý và bộ ba, không phạt xé sảnh. Rút con 7 ra khỏi
  // 5-6-7-8-9 là mất cả dây, mà nó không thấy gì cả.
  const mine = hand('5♠', '6♠', '7♠', '8♠', '9♠', '3♦');
  assert.deepEqual(chooseMove(mine, null), hand('3♦'), 'dẫn bằng lá rời, không phải lá trong dây');
  assert.deepEqual(chooseMove(mine, kindOf('4♦'), { lowest: 13 }), hand('5♠'),
    'phải đè thì đè bằng lá đầu dây, chứ không rút ruột giữa dây');
});

test('the machine is told what was played and never what is held', () => {
  // Cái máy nhìn được bài người khác là cái máy không ai thắng nổi, và là gian lận. `chooseMove`
  // nhận đúng: tay của chính nó, cái đang nằm trên bàn, ai còn mấy lá, và những gì đã đánh ra.
  const source = readFileSync(new URL('./rules/tienlen.mjs', import.meta.url), 'utf8');
  const from = source.indexOf('export function chooseMove');
  const body = source.slice(from, source.indexOf('\n}', from));
  assert.ok(!/hands|game\.|seats/.test(body),
    `máy đang nhìn thấy thứ nó không được nhìn:\n${body}`);

  // Và `seen` là bài đã đánh, nên đưa vào cả bộ bài thì không còn gì ngoài kia để đè.
  const everything = deck().filter((card) => card !== c('3', '♠') && card !== c('2', '♥'));
  assert.ok(unbeatable(kindOf('2♥'), hand('2♥'), everything), 'heo đỏ là lá không ai đè được');
  assert.ok(!unbeatable(kindOf('3♠'), hand('3♠'), []), 'chưa ai đánh gì thì 3 bích đè được hết');
});

test('the ladder the widget draws is the ladder the bot plays', () => {
  // Widget giữ một bản sao của `beats` để biết lá nào sáng lên được — hỏi bot thì mỗi cú chạm
  // phải đi một vòng mạng. Bản sao đó là bản sao duy nhất được phép, và cái giá của nó là đúng
  // cái vừa xảy ra: thang chặt của bot lên bảy bậc, thang của widget vẫn bốn, và người chơi
  // ngồi nhìn dây năm đôi thông không chịu sáng.
  const widget = readFileSync(new URL('./widget/tienlen.js', import.meta.url), 'utf8');
  // Cắt *sau* dòng mốc mở và *trước* dòng mốc đóng — hai dòng ấy là chú thích, và một chú thích
  // lọt vào `new Function` là một lỗi cú pháp chứ không phải một luật sai.
  const open = widget.indexOf('>>> luật chung với bot');
  const shut = widget.indexOf('// >>> hết luật chung <<<');
  assert.ok(open !== -1 && shut > open, 'mất dấu mốc quanh khối luật của widget');
  const from = widget.indexOf('\n', open) + 1;
  const to = shut;

  const theirs = new Function('RANKS', 'SUITS', 'TWO', 'rankOf', 'suitOf',
    `${widget.slice(from, to)}; return beats;`)(RANKS, SUITS, TWO, rankOf, suitOf);

  // Mọi cặp bộ đáng quan tâm, hỏi cả hai bên và bắt trả lời giống nhau.
  const shapes = [
    ['2♠'], ['2♥'], ['A♥'], ['2♠', '2♥'], ['2♠', '2♣'], ['K♠', 'K♥'],
    ['9♠', '9♣', '9♦'], ['4♠', '4♣', '4♦', '4♥'], ['9♠', '9♣', '9♦', '9♥'],
    ['5♠', '6♠', '7♠'], ['5♠', '6♠', '7♠', '8♠'],
    ['3♠', '3♣', '4♠', '4♣', '5♠', '5♣'],
    ['7♠', '7♣', '8♠', '8♣', '9♠', '9♣'],
    ['3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣'],
    ['3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣'],
    ['3♠', '3♣', '4♠', '4♣', '5♠', '5♣', '6♠', '6♣', '7♠', '7♣', '8♠', '8♣'],
  ].map((names) => kindOf(...names));

  let asked = 0;
  for (const mine of shapes) {
    for (const under of [null, ...shapes]) {
      assert.equal(beats(mine, under), theirs(mine, under),
        `bot và widget không đồng ý về ${mine.kind}/${mine.size} đè ${under && under.kind}`);
      asked++;
    }
  }
  assert.ok(asked > 200, 'hỏi quá ít cặp để tin');
});

test('no animation is the only reason something is visible', () => {
  // Đã cắn hai lần. Lần đầu là con xúc xắc: keyframe bắt đầu từ `opacity: 0` với `fill-mode:
  // both`, nên animation không chạy là xúc xắc **tàng hình vĩnh viễn**. Lần thứ hai là bảng kết
  // quả, y hệt — cả bảng biến mất, và biến mất thì không ai báo lỗi, người ta chỉ thấy game hỏng.
  //
  // Luật: `both` và `forwards` giữ khung đầu tiên suốt quãng chờ, nên khung đầu tiên không được
  // là khung vô hình. Animation được quyền quyết định một thứ *đến* thế nào; không được là lý do
  // duy nhất nhìn thấy nó.
  const css = readFileSync(new URL('./widget/style.css', import.meta.url), 'utf8');

  const frames = new Map();
  for (const found of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
    frames.set(found[1], found[2]);
  }
  assert.ok(frames.size > 3, `chỉ đọc được ${frames.size} keyframes — regex hỏng rồi`);

  const invisible = (body) => {
    // Khung đầu tiên: `from`, hoặc `0%`.
    const first = body.match(/(?:^|\n)\s*(?:from|0%)\s*\{([^}]*)\}/);
    return !!first && /opacity:\s*0\s*[;}]/.test(first[1]);
  };

  for (const rule of css.matchAll(/animation:\s*([\w-]+)([^;]*);/g)) {
    const [, name, rest] = rule;
    if (!/\b(both|backwards)\b/.test(rest)) continue;
    const body = frames.get(name);
    if (!body) continue;
    assert.ok(!invisible(body),
      `@keyframes ${name} bắt đầu từ opacity 0 và được dùng với "${rest.trim()}" — `
      + 'animation không chạy là thứ đó không bao giờ hiện ra');
  }
});
