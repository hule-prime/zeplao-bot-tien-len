import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

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
  chess, xiangqi, BOARD_TURN_MS, BOARD_THINK_MS,
  TX_DOORS, TX_DOOR_NAMES, TX_PAYS, TX_SMALL, TX_BIG, TX_DICE, TX_HISTORY, TX_CHIPS,
  TX_ROLL_MS, TX_SHOW_MS, TX_BETTING_MS,
  txRoll, txTotal, isBao, txHits, txWon, doorWorth, txBoardWorth, txStaked, txOutcome,
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

test('the numbers asked for: nhất takes a whole stake off a table of machines', () => {
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
  assert.equal(BOT_STAKE, 10_000, 'and the number itself');
  // Quảng cáo **không còn** định nghĩa bằng con số này. Nó từng là `BOT_STAKE`, với lý do một
  // quảng cáo phải mua nổi một ván; lý do ấy đúng khi ván với máy là bốn nghìn, và sai khi nó là
  // mười — mười nghìn cho mười giây là một phần ba quà cả ngày, mà quà cả ngày mới là thứ người
  // ta được mong quay lại vì nó.
  assert.equal(ADS_GOLD, 8_000, 'quảng cáo có con số của riêng nó');
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
  assert.equal(STARTING_GOLD, 50_000);
  assert.equal(DAILY_GOLD, 30_000);
  assert.ok(STARTING_GOLD >= STAKES[STAKES.length - 2],
    'a first purse should open more than the cheapest table on the list');
  assert.ok(STARTING_GOLD > BOT_STAKE * 4,
    'and survive a few hands against the machines before an advertisement is the only way on');
  assert.ok(DAILY_GOLD > BOT_STAKE * 2, 'a day of gold should be worth more than one hand');
  // "Hết vàng" là chỗ **không còn bàn nào ngồi được**, và bàn rẻ nhất là một cược nhỏ nhất —
  // không phải một ván với máy. Gọi người còn ngồi được bốn bàn trên danh sách là hết vàng thì
  // cái chữ ấy thôi nói được điều gì.
  assert.equal(BROKE, MIN_STAKE, 'ngưỡng hết vàng phải là chỗ thật sự không ngồi được bàn nào');
  assert.ok(ADS_GOLD >= MIN_STAKE,
    'một quảng cáo phải mua nổi ít nhất một bàn rẻ nhất, nếu không nó chẳng giúp được gì');
  // Và trần: một đường về bàn máy dài hơn bốn quảng cáo là một việc vặt, không phải một đường về.
  assert.ok(Math.ceil(BOT_STAKE / ADS_GOLD) <= 4,
    `phải xem ${Math.ceil(BOT_STAKE / ADS_GOLD)} quảng cáo mới đủ một ván với máy`);
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
  // A world bowl is permanent and a deploy is not. A soi cầu board that starts again empty
  // every time the bot restarts is a board reaching back less far than the person reading it,
  // which is worth nothing — so it goes on disk with the gold rather than in memory with the
  // tables. Pinned at three points, because it takes all three to work: read at start, seeded
  // into the bowl, written after a throw.
  //
  // **Two bowls, two boards.** Bầu cua's run of throws and tài xỉu's are different games at
  // different lengths, and one poured into the other is a cầu drawn from somebody else's dice.
  const source = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');

  assert.match(source, /kept\.cau = Array\.isArray\(kept\.cau\)/,
    'the ledger no longer reads a run of throws back');
  assert.match(source, /kept\.cauTx = Array\.isArray\(kept\.cauTx\)/,
    'and the tài xỉu one is not read back either');
  assert.match(source, /worldBowl\(WORLD, 'baucua',[\s\S]{0,140}scores\.cau \?\? \[\]/,
    'the bầu cua bowl no longer starts from what was written down');
  assert.match(source, /worldBowl\(TX_WORLD, 'taixiu',[\s\S]{0,140}scores\.cauTx \?\? \[\]/,
    'the tài xỉu bowl no longer starts from what was written down');
  assert.match(source, /game\.world.*scores\[rules\.cau\] = game\.history.*saveScores\(\)/s,
    'a throw is no longer written down');

  // And each bowl into its own row of the ledger, chosen by which bowl it is rather than by
  // whichever name was nearest when the line was written.
  assert.match(source, /baucua: \{[\s\S]*?cau: 'cau',/, "the bầu cua bowl lost its own board");
  assert.match(source, /taixiu: \{[\s\S]*?cau: 'cauTx',/, 'the tài xỉu bowl lost its own board');

  // And only a world one. A private bowl belongs to one person for as long as they have it
  // open; writing its throws into the shared board would put one person's afternoon into
  // everybody else's history.
  const at = source.indexOf('scores[rules.cau] = game.history');
  assert.ok(source.lastIndexOf('game.world', at) > at - 60,
    'the run of throws is written for bowls that are not the world one');
});

test('a watcher has no `me`, and the page never reads through it on a bowl push', () => {
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

  // The dice half of onState, where a watcher actually turns up. One block for both bowls now,
  // which means one place to get this wrong rather than two — and the same block is what tài xỉu
  // walks through, so the check covers a screen it was never written for.
  const from = widget.indexOf("if (diceGame(next)) {\n    const mine = next.me;");
  assert.ok(from !== -1, 'the board-handover block moved');
  const block = widget.slice(from, widget.indexOf('\n  } else if (stack.length', from));
  for (const match of block.matchAll(/\bmine\./g)) {
    const before = block.slice(Math.max(0, match.index - 12), match.index);
    assert.ok(/mine &&\s*$/.test(before),
      `read through mine with nothing checking it: ...${before}mine.`);
  }
});

// ---- tài xỉu ---------------------------------------------------------------------------------
//
// Cùng ba con xúc xắc của bầu cua và không cùng một luật nào cả. Ở kia mỗi con đứng riêng; ở đây
// ba con chỉ có nghĩa lúc cộng lại, nên mọi thứ dưới đây là số học trên cái tổng ấy — và cái duy
// nhất phải giữ cho đúng là **bão chặn cả bốn cửa kia**, vì đó là chỗ nhà cái sống.

/// Every throw there is, all two hundred and sixteen of them. Exhaustive rather than sampled:
/// the numbers below are the numbers, not measurements of them.
const everyThrow = () => {
  const all = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      for (let c = 1; c <= 6; c++) all.push([a, b, c]);
    }
  }
  return all;
};

test('three dice, one to six, and a total that is the whole game', () => {
  assert.equal(TX_DICE, 3);
  assert.deepEqual(TX_DOORS, ['xiu', 'tai', 'chan', 'le', 'bao']);
  assert.ok(TX_DOORS.every((door) => TX_DOOR_NAMES[door]));
  assert.ok(TX_DOORS.every((door) => TX_PAYS[door] >= 1));

  for (let i = 0; i < 500; i++) {
    const dice = txRoll();
    assert.equal(dice.length, TX_DICE);
    assert.ok(dice.every((one) => Number.isInteger(one) && one >= 1 && one <= 6));
    assert.equal(txTotal(dice), dice[0] + dice[1] + dice[2]);
  }
});

test('tài is eleven to seventeen, xỉu is four to ten, and bão takes both', () => {
  // Cái luật ai chơi cũng biết, và cái luật ai cũng quên đúng một lần: tổng rơi vào khoảng của
  // mình mà ba con giống nhau thì vẫn thua.
  assert.deepEqual(TX_SMALL, [4, 10]);
  assert.deepEqual(TX_BIG, [11, 17]);

  assert.ok(txHits('tai', [6, 4, 1]), '11 là tài');
  assert.ok(txHits('tai', [6, 6, 5]), '17 là tài');
  assert.ok(txHits('xiu', [1, 1, 2]), '4 là xỉu');
  assert.ok(txHits('xiu', [4, 3, 3]), '10 là xỉu');
  assert.ok(!txHits('tai', [4, 3, 3]), '10 không phải tài');
  assert.ok(!txHits('xiu', [6, 4, 1]), '11 không phải xỉu');

  // Bão. Sáu cách ra, và cả sáu đều chặn.
  for (let pips = 1; pips <= 6; pips++) {
    const dice = [pips, pips, pips];
    assert.ok(isBao(dice), `${pips}-${pips}-${pips} phải là bão`);
    assert.deepEqual(txWon(dice), ['bao'],
      `bão ${pips} vẫn trả tiền cho một cửa khác — tổng là ${txTotal(dice)}`);
    for (const door of ['tai', 'xiu', 'chan', 'le']) {
      assert.ok(!txHits(door, dice), `bão ${pips} vẫn ăn cửa ${door}`);
    }
  }

  // 3-3-3 là 9, nằm gọn trong khoảng xỉu, và vẫn thua. 4-4-4 là 12, nằm gọn trong khoảng tài,
  // và vẫn thua. Đó là hai ván duy nhất trong tất cả khiến người ta phải hỏi lại luật.
  assert.equal(txTotal([3, 3, 3]), 9);
  assert.ok(!txHits('xiu', [3, 3, 3]));
  assert.equal(txTotal([4, 4, 4]), 12);
  assert.ok(!txHits('tai', [4, 4, 4]));

  // Và vì thế hai khoảng viết là 4–10 với 11–17: tổng 3 và tổng 18 chỉ có đúng một cách ra.
  assert.equal(TX_SMALL[0], 4, 'tổng 3 chỉ ra được bằng 1-1-1');
  assert.equal(TX_BIG[1], 17, 'tổng 18 chỉ ra được bằng 6-6-6');
});

test('chẵn lẻ đọc trên cùng cái tổng ấy, và cũng thua bão', () => {
  assert.ok(txHits('chan', [1, 2, 3]), '6 là chẵn');
  assert.ok(txHits('le', [1, 2, 4]), '7 là lẻ');
  assert.ok(!txHits('chan', [1, 2, 4]));
  assert.ok(!txHits('le', [1, 2, 3]));

  // Không ván nào vừa chẵn vừa lẻ, và không ván nào không chẵn cũng không lẻ — trừ bão.
  for (const dice of everyThrow()) {
    const both = txHits('chan', dice) && txHits('le', dice);
    const neither = !txHits('chan', dice) && !txHits('le', dice);
    assert.ok(!both, `${dice} vừa chẵn vừa lẻ`);
    assert.equal(neither, isBao(dice), `${dice} không thuộc bên nào mà cũng không phải bão`);
  }
});

test('mỗi ván ăn đúng hai cửa, hoặc một cửa bão', () => {
  // Một câu nói lớn nhỏ và một câu nói chẵn lẻ, cùng một cái tổng — nên ván thường bao giờ cũng
  // trả đúng hai cửa. Bão thì trả đúng một. Cái này là hình dạng của cả cái chiếu: đặt cả năm cửa
  // thì bao giờ cũng thắng hai và thua ba.
  for (const dice of everyThrow()) {
    const won = txWon(dice);
    if (isBao(dice)) {
      assert.deepEqual(won, ['bao'], `${dice}`);
    } else {
      assert.equal(won.length, 2, `${dice} trả ${won.length} cửa: ${won}`);
      assert.ok(won.includes('tai') || won.includes('xiu'), `${dice} không có bên nào`);
      assert.ok(won.includes('chan') || won.includes('le'), `${dice} không chẵn không lẻ`);
    }
  }
});

test('một cửa trúng thì về bằng đúng cái nó hứa, trượt thì mất phần đặt', () => {
  assert.equal(doorWorth(1000, 'tai', [6, 4, 1]), 1000);
  assert.equal(doorWorth(1000, 'tai', [1, 1, 2]), -1000);
  assert.equal(doorWorth(1000, 'xiu', [1, 1, 2]), 1000);
  assert.equal(doorWorth(1000, 'bao', [5, 5, 5]), 30_000);
  assert.equal(doorWorth(1000, 'bao', [5, 5, 4]), -1000);
  assert.equal(doorWorth(1000, 'tai', [5, 5, 5]), -1000, 'bão thì cửa tài mất tiền');
  assert.equal(doorWorth(0, 'tai', [6, 4, 1]), 0, 'không đặt thì không ăn');
  assert.equal(doorWorth(1000, 'rong', [6, 4, 1]), 0, 'cửa không có thì không phải là cửa');
});

test('cả bàn cược tính một lượt, và không bao giờ mất nhiều hơn đã đặt', () => {
  assert.equal(txStaked({ tai: 1000, chan: 2000 }), 3000);
  assert.equal(txStaked({}), 0);
  assert.equal(txStaked(null), 0);
  assert.equal(txBoardWorth({}, [1, 2, 3]), 0);
  assert.equal(txBoardWorth(null, [1, 2, 3]), 0);

  // Đặt tài và chẵn cùng lúc, ra 12 thì ăn cả hai; ra 11 thì ăn tài thua chẵn.
  assert.equal(txBoardWorth({ tai: 1000, chan: 1000 }, [6, 5, 1]), 2000);
  assert.equal(txBoardWorth({ tai: 1000, chan: 1000 }, [6, 4, 1]), 0);
  assert.equal(txBoardWorth({ tai: 1000, xiu: 1000 }, [5, 5, 5]), -2000, 'bão ăn cả hai bên');

  const bets = { tai: 1000, xiu: 500, chan: 2000, le: 700, bao: 300 };
  const on = txStaked(bets);
  for (const dice of everyThrow()) {
    const worth = txBoardWorth(bets, dice);
    assert.ok(worth >= -on, `${dice} mất nhiều hơn số đã đặt`);
    assert.ok(worth <= on * TX_PAYS.bao, `${dice} trả nhiều hơn cửa cao nhất`);
  }
});

test('nhà cái ăn 1/36 ở bốn cửa đều tiền, và 30/216 ở bão', () => {
  // Tính chính xác trên đủ 216 ván chứ không phải đo. 2,78% là con số cổ điển của sic bo và là
  // toàn bộ lý do bão tồn tại: bỏ bão đi thì tài xỉu là một đồng xu công bằng, và một đồng xu
  // công bằng thì cái sòng không nuôi nổi số vàng phát mỗi ngày.
  const edge = (door) => {
    let total = 0;
    for (const dice of everyThrow()) total += doorWorth(216, door, dice);
    return -total / (216 * 216);
  };

  for (const door of ['tai', 'xiu', 'chan', 'le']) {
    assert.equal(edge(door), 1 / 36, `cửa ${door} không ăn đúng 1/36`);
  }
  assert.equal(edge('bao'), 30 / 216, 'cửa bão');

  // Và nó nhẹ hơn bầu cua, đúng như thực tế: 2,78% với 7,87%. Hai trò đứng cạnh nhau trên một
  // cái menu và tiêu cùng một ví, nên chênh lệch ấy là một thứ có thật về hai trò chứ không phải
  // một con số ai đó gõ vào.
  assert.ok(edge('tai') < 17 / 216, 'tài xỉu phải nhẹ tay hơn bầu cua');
});

test('the tài xỉu dice do not come out of Math.random either', () => {
  const real = Math.random;
  Math.random = () => 0;
  try {
    const thrown = new Set();
    for (let i = 0; i < 200; i++) thrown.add(txRoll().join(''));
    assert.ok(thrown.size > 20,
      `${thrown.size} different throws out of 200 — the dice are following Math.random`);
  } finally {
    Math.random = real;
  }
});

test('and they cannot see the money either, because there is no way in', () => {
  // The same guarantee as `roll`, held down the same way: a function that takes nothing cannot
  // be told who is at the table, what is on the board, or how much of it. The easy way to make
  // a house cheat is to add a parameter here and nobody notice.
  assert.equal(txRoll.length, 0, 'txRoll() grew an argument');

  const source = readFileSync(new URL('./rules/taixiu.mjs', import.meta.url), 'utf8');
  const from = source.indexOf('export function txRoll()');
  assert.ok(from !== -1, 'the throw moved');
  const body = source.slice(from, source.indexOf('\n}', from) + 2);
  assert.ok(!/bets|placed|staked|game|seat|gold|door/.test(body),
    `the throw mentions something it has no business knowing:\n${body}`);
});

test('every pip comes up as often as every other', () => {
  const N = 40_000;
  const seen = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) for (const pips of txRoll()) seen[pips]++;

  for (let pips = 1; pips <= 6; pips++) {
    const pct = (seen[pips] / (N * TX_DICE)) * 100;
    assert.ok(Math.abs(pct - 100 / 6) < 0.5, `${pips} came up ${pct.toFixed(3)}% of the time`);
  }
});

test('the throw reads out the same way the table says it', () => {
  const plain = txOutcome([6, 4, 1]);
  assert.equal(plain.total, 11);
  assert.equal(plain.bao, false);
  assert.equal(plain.side, 'tai');
  assert.equal(plain.parity, 'le');
  assert.deepEqual(plain.won, ['tai', 'le']);

  const storm = txOutcome([2, 2, 2]);
  assert.equal(storm.total, 6);
  assert.equal(storm.bao, true);
  assert.equal(storm.side, null, 'bão không thuộc bên nào');
  assert.equal(storm.parity, null);
  assert.deepEqual(storm.won, ['bao']);

  // Và cái nó đọc ra đúng bằng cái các hàm rời rạc nói, trên đủ 216 ván.
  for (const dice of everyThrow()) {
    const read = txOutcome(dice);
    assert.deepEqual(read.won, txWon(dice));
    assert.equal(read.total, txTotal(dice));
    assert.equal(read.bao, isBao(dice));
  }
});

test('cầu tài xỉu dài hơn cầu bầu cua, vì nó là một con đường', () => {
  // Ba mươi sáu ván. Bảng bầu cua đọc theo cột — một cột là một ván — nên ba mươi là đủ rộng màn
  // hình. Bảng tài xỉu đọc theo **mạch**, và một mạch chỉ đọc được khi có đủ mạch phía sau nó.
  assert.equal(TX_HISTORY, 36);
  assert.ok(TX_HISTORY >= HISTORY);

  let history = [];
  for (let i = 0; i < 100; i++) {
    const dice = txRoll();
    history = [dice, ...history].slice(0, TX_HISTORY);
    assert.ok(history.length <= TX_HISTORY);
    assert.deepEqual(history[0], dice, 'newest first');
  }
  assert.equal(history.length, TX_HISTORY);
});

test('cái sòng chạy theo nhịp người xem chịu được', () => {
  assert.deepEqual(TX_CHIPS, CHIPS, 'hai cái bát tiêu chung một ví thì chung một thang chip');
  assert.ok(TX_ROLL_MS >= 1000, 'xóc phải ra xóc, không phải một con số hiện lên');
  // Nặn tài xỉu là hai chặng — mở nắp bát, rồi lật ba con — nên nó cần nhiều chỗ hơn cái đĩa bầu
  // cua, vốn chỉ có một chặng. Ngắn hơn thì cái nắp tự mở giữa lúc người ta đang kéo.
  assert.ok(TX_SHOW_MS > SHOW_MS, 'nặn hai chặng cần nhiều thời gian hơn nặn một chặng');
  assert.ok(TX_SHOW_MS > TX_ROLL_MS);
  assert.ok(TX_BETTING_MS >= 15_000, 'cửa đặt phải đủ rộng để đặt nhiều cửa');
});

test('the page never decides which bowl it is at by naming one of them', () => {
  // Cái lỗi này đã ra tới tay người chơi, và nó im lặng theo đúng kiểu tệ nhất.
  //
  // Khối bàn giao bàn cược trong `onState` hỏi "vẫn là cái bàn lúc nãy chứ?", và nó hỏi bằng
  // `state.kind === 'baucua'`. Ở bàn tài xỉu thì câu ấy **luôn** sai, nên `turned` luôn đúng, nên
  // **mọi** push trong lúc đang đặt đều xoá sạch chip trên trang. Bot vẫn giữ đủ — nó được báo cả
  // bàn cược — nên nhìn ra là "bấm đặt cái là mất, mà backend vẫn ghi nhận": đúng một nửa, và là
  // nửa khó tìm hơn.
  //
  // Luật rút ra và ghim ở đây: trong khối ấy, "trò xúc xắc" phải hỏi qua `diceGame`, không được
  // gọi tên một trò. Chỗ nào thật sự cần phân biệt hai trò thì phân biệt ở chỗ khác.
  const widget = readFileSync(new URL('./widget/tienlen.js', import.meta.url), 'utf8');

  const from = widget.indexOf("if (diceGame(next)) {\n    const mine = next.me;");
  assert.ok(from !== -1, 'the board-handover block moved');
  const block = widget.slice(from, widget.indexOf('\n  } else if (stack.length', from));

  for (const named of ["'baucua'", "'taixiu'"]) {
    // Trong lời bình thì được — chỗ ấy đang kể lại chính cái lỗi này.
    const code = block.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.ok(!code.includes(named),
      `khối bàn giao bàn cược gọi thẳng tên ${named}; phải hỏi qua diceGame()`);
  }

  // Và cái bàn cược của bot được lấy làm chỗ bắt đầu mỗi lần đổi bàn hay sang ván — kể cả lúc cửa
  // đặt đang mở. Trước đây chỗ này chỉ lấy khi ván đã đóng, nên ai quay lại giữa cửa đặt thì
  // không thấy tiền mình đã bỏ xuống và tưởng là mất.
  assert.match(block, /if \(turned\) \{[\s\S]{0,400}?stack = Object\.entries\(\(mine && mine\.theirs\)/,
    'the page no longer starts from the board the bot is holding');
});

test('cái bát là thứ co lại khi cột hết chỗ, và không gì được vẽ đè lên hàng nút', () => {
  // Báo về là "đám tiền đè lên nút hoàn tác, lúc bị lúc không".
  //
  // Cột của một trò xúc xắc chỉ có **một** hàng co được, là cái bát; dải tab, chiếu, dòng luật và
  // hàng chip đều cứng. Nâng `min-height` của cái bát lên cho vừa cái đĩa tròn là lấy mất đúng
  // cái tính co ấy: thiếu chỗ thì cái bát không nhường, cả cột tràn khỏi `#screen`, và thứ nằm
  // ngay dưới `#screen` là hàng nút. Hàng chip tiền — cái sát đáy nhất — rơi đè lên "Hoàn tác".
  //
  // "Lúc bị lúc không" là vì đúng một dòng `#says` (một lời từ chối) đủ đẩy nó qua ngưỡng, và
  // ván sau lời ấy tự mất.
  const css = readFileSync(new URL('./widget/style.css', import.meta.url), 'utf8');

  // Chốt chặn: tràn thì bị cắt, không được vẽ đè.
  assert.match(css, /#screen \{[^}]*overflow: hidden/s,
    'phần giữa không còn cắt phần tràn — nó sẽ vẽ đè lên hàng nút');

  // Và cái bát phải co được thật. Một con số sàn cao là một cái bát không nhường.
  for (const bowl of ['#bowl {', '#tx-bowl {']) {
    const at = css.indexOf('\n' + bowl);
    assert.notEqual(at, -1, bowl + ' đã dời đi');
    const floor = Number(/min-height: (\d+)px/.exec(css.slice(at, css.indexOf('}', at)))[1]);
    assert.ok(floor <= 110, `${bowl} có sàn ${floor}px — quá cao để nhường chỗ cho cả cột`);
  }

  // Cỡ con xúc xắc phải là hệ quả của chiều cao cái bát, không phải một con số trong stylesheet:
  // đó là cái làm cho việc co lại vô hại.
  const widget = readFileSync(new URL('./widget/tienlen.js', import.meta.url), 'utf8');
  assert.match(widget, /function dieFor\(bowlHeight, gap, biggest, below\)/, 'phép cắt đã dời đi');
  assert.match(css, /\.die \{[^}]*width: var\(--die/s, 'xúc xắc bầu cua không co theo được');
  assert.match(css, /\.tx-die \{[^}]*width: var\(--die/s, 'xúc xắc tài xỉu không co theo được');

  // Chạy lại đúng phép cắt ấy trên mọi chiều cao khung nền tảng có thể kẹp xuống, có và không có
  // dòng từ chối. Hai cái phải cùng đúng: cái đĩa phủ kín ba con, và ba con lọt trong cái bát.
  const dieFor = (h, g, big, below) => {
    const room = h - 20;
    if (!(room > 0)) return 20;
    return Math.max(20, Math.min(big,
      Math.floor(Math.min((room / Math.SQRT2 - g) / 2, (h - below - g) / 2))));
  };
  const FIXED = 42 + 103 + 21 + 41;          // tab, chiếu, dòng luật, hàng chip
  for (const frame of [460, 500, 540, 570, 620]) {
    for (const says of [0, 33]) {
      const screen = frame - 15 - 38 - 40 - 21 - says;
      const bowl = Math.max(104, screen - FIXED);
      assert.ok(bowl + FIXED <= screen, `khung ${frame}${says ? ' có says' : ''}: cột tràn`);

      const d = dieFor(bowl, 8, 58, 58);
      const side = 2 * d + 8;
      const need = Math.hypot(side, side) + 12;
      const dish = Math.min(Math.ceil(need), Math.max(60, bowl - 8));
      assert.ok(dish >= need - 0.5, `khung ${frame}: đĩa ${dish} không phủ nổi ${need.toFixed(0)}`);
      assert.ok(side <= bowl - 58, `khung ${frame}: ba con ${side} tràn khỏi bát ${bowl}`);
    }
  }
});

test('bàn cược của trang chỉ sống trong đúng cái ván nó được vẽ ra', () => {
  // Ván xóc xong, cửa đặt ván sau mở ra — mà mặt chiếu vẫn còn nguyên chip của ván trước.
  //
  // Không chỉ vẽ sai. `myBets()` đọc từ chính cái chồng chip ấy, nên chạm thêm **một** cái là
  // trang gửi đi nguyên bàn cược cũ kèm cú chạm mới, và bot đặt lại nó bằng tiền thật. Một lỗi
  // vẽ biến thành một lỗi tiền vì hai bên cùng đọc một biến.
  //
  // Cửa đặt ván sau cũng là `phase === 'betting'` ở cùng một bàn, nên câu hỏi "vẫn cái bàn ấy
  // chứ" là chưa đủ: phải là "vẫn cái bàn ấy **và cái ván ấy** chứ".
  const widget = readFileSync(new URL('./widget/tienlen.js', import.meta.url), 'utf8');

  const from = widget.indexOf("if (diceGame(next)) {\n    const mine = next.me;");
  assert.ok(from !== -1, 'the board-handover block moved');
  const block = widget.slice(from, widget.indexOf('\n  } else if (stack.length', from));

  assert.match(block, /const turned = next\.phase !== 'betting'\s*\n\s*\|\| !\(state && diceGame\(state\)\s*\n?\s*&& state\.gameId === next\.gameId\s*\n?\s*&& state\.round === next\.round\)/,
    'câu hỏi "vẫn cái bàn ấy chứ" không còn hỏi tới số ván');

  // Và cái `me` mang sang từ push chung cũng phải bỏ bàn cược lại khi sang ván mới. Bot đẩy hai
  // lần một nước — một chung không kèm `me`, một riêng có — nên nếu chỗ mang sang bê nguyên bàn
  // cược cũ thì nó sống lại đúng ở khe giữa hai cái đẩy ấy.
  assert.match(widget,
    /next\.me = diceGame\(next\) && state\.round !== next\.round\s*\n\s*\? \{ \.\.\.state\.me, bets: \{\}, staked: 0, theirs: \{\} \}/,
    'cái ghế mang sang ván mới vẫn mang theo cả bàn cược cũ');
});

test('xóc xong là ba con nằm yên, và cái bát là thứ duy nhất giấu chúng', () => {
  // Hai bản trước đều sai ở đúng một chỗ, và sai nặng dần.
  //
  // Bản đầu úp lên mỗi con một cái nắp con có chữ `?`: kéo cái bát ra để gặp ba cái nắp nữa, tức
  // là mở một thứ để lộ ra ba thứ phải mở. Bản sau bỏ nắp đi nhưng cho con chưa lật **quay
  // tiếp** — mà mở bát ra thì xúc xắc đã nằm rồi, không có cách nào nó còn quay, nên nó đọc ra
  // là cái bàn bị treo. Cả hai lần đều do người chơi tìm ra, và cả hai lần câu hỏi đều là "cái
  // này để làm gì".
  //
  // Luật ghim ở đây: **ba con chỉ quay trong lúc còn lắc**, và thứ duy nhất giấu chúng là cái
  // bát nằm đè lên.
  const widget = readFileSync(new URL('./widget/taixiu.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./widget/style.css', import.meta.url), 'utf8');

  assert.ok(!widget.includes('tx-lid'), 'ba con lại có nắp riêng');
  assert.ok(!css.includes('.tx-lid'), 'cái nắp con vẫn còn kiểu dáng trong stylesheet');
  assert.ok(!css.includes('tx-lifted'), 'và cả hiệu ứng bay của nó');

  // Hiệu ứng quay chỉ được gắn khi đang lắc. Đọc thẳng dòng dựng con xúc xắc ra mà xét.
  const made = /const die = pipDie\(pips, ([^)]*)\);/.exec(widget);
  assert.ok(made, 'chỗ dựng con xúc xắc đã dời đi');
  assert.equal(made[1].trim(), "rolling ? 'tumbling' : ''",
    `con xúc xắc được gắn hiệu ứng theo "${made[1].trim()}" — chỉ được quay lúc còn lắc`);

  // Và cái đồng hồ nhảy chấm cũng thế: chỉ chạy khi có con đang lắc.
  assert.match(widget, /if \(rolling\) spun\.push\(die\);/, 'danh sách con đang quay đã đổi cách lập');
  assert.match(widget, /if \(!spun\.length\) return;\s*\n[\s\S]{0,220}?txTumbling = setInterval/,
    'đồng hồ nhảy chấm không còn được canh theo danh sách ấy');

  // Không còn cái đồng hồ nào bắt người ta đợi để xem kết quả.
  for (const gone of ['txSchedule', 'txTurn', 'TX_TURN_MS', 'TX_LAST_MS']) {
    assert.ok(!widget.includes(gone), `${gone} vẫn còn — lại có cái gì đó bắt đợi từng con`);
  }

  // Đúng một cái nắp trong cả ván, và nó là cái bát. Kéo tới đâu ba con ló ra tới đó.
  assert.equal((widget.match(/dragOff\(/g) ?? []).length, 1,
    'có nhiều hơn một cái nắp phải mở trong một ván tài xỉu');
  assert.match(widget, /dragOff\(bat, \$\('tx-dice'\), [\s\S]*?, BAT_MS, txPeek\)/,
    'cái bát không còn để lộ dần ba con trong lúc kéo');

  // Cái bát tự đi phải **đủ chậm để với tay tới**, và vẫn phải kịp trong khoảng bot giữ kết quả
  // trên màn hình. Bản đầu để 1,8 giây: mắt còn đang ở mặt chiếu xem cửa nào của mình, ngẩng lên
  // thì cái bát đã đi rồi — và một cái nặn tự mở trước khi người ta kịp chạm thì không phải một
  // cái nặn, nó là một hiệu ứng.
  const bat = Number(/const BAT_MS = ([\d_]+)/.exec(widget)[1].replace(/_/g, ''));
  const land = Number(/const TX_LAND_MS = ([\d_]+)/.exec(widget)[1].replace(/_/g, ''));
  assert.ok(bat >= 2_500, `cái bát tự đi sau ${bat}ms — chưa kịp với tay`);
  assert.ok(bat + land * 3 < TX_SHOW_MS,
    `nặn hết ${bat + land * 3}ms mà bot chỉ giữ kết quả ${TX_SHOW_MS}ms`);
});

test('không hai lần xóc nào mang cùng một tên', () => {
  // Cái lỗi này ra tới tay người chơi và nó nói dối rất khéo: nặn được đúng **một ván**, ván sau
  // là hết nặn, ở cả hai cái bát.
  //
  // Cái bát được dựng ra mà không có số ván, nên suốt cửa đặt đầu tiên nó gửi `round ?? 1` — tức
  // là 1. Rồi `openBets` đếm `0 + 1` và gửi 1 lần nữa cho ván thứ hai. Hai lần xóc liền nhau mang
  // cùng một tên, mà cái trang thì nhớ "ván 1 tôi mở đĩa rồi" — nên ván thứ hai **không được úp
  // đĩa lên**. Không có gì báo lỗi; nó chỉ đơn giản là thôi nặn.
  const source = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');

  // Đếm từ một, ở cả chỗ dựng bàn riêng lẫn chỗ dựng bát thế giới.
  assert.equal((source.match(/^      round: 1,$/gm) ?? []).length, 2,
    'một trong hai chỗ dựng bàn không còn đặt sẵn số ván');
  assert.match(source, /game\.round = \(game\.round \?\? 0\) \+ 1;/, 'chỗ đếm ván đã dời đi');

  // Và chạy thử đúng cái vòng ấy: bốn ván liền nhau phải là bốn cái tên khác nhau.
  let round = 1;
  const names = [];
  for (let i = 0; i < 4; i++) { names.push(round ?? 1); round = (round ?? 0) + 1; }
  assert.equal(new Set(names).size, 4, `bốn ván liền nhau gọi tên nhau là ${names.join(' ')}`);
});

// ---- hai luật của cái trang, đắt tiền cả hai --------------------------------------------------

/// Mọi file kịch bản trong bundle, theo đúng thứ tự trang nạp chúng.
function widgetScripts() {
  const dir = new URL('./widget/', import.meta.url);
  const html = readFileSync(new URL('index.html', dir), 'utf8');
  return [...html.matchAll(/<script src="([\w.-]+)"><\/script>/g)]
    .map((one) => one[1])
    .filter((name) => name !== 'zeplao.js')
    .map((name) => [name, readFileSync(new URL(name, dir), 'utf8')]);
}

test('không hai file nào của trang khai trùng một cái tên ở tầng ngoài cùng', () => {
  // Mấy file này đều là **script thường**, không phải module. Nên `let` hay `function` ở tầng
  // ngoài cùng của file nào cũng nằm chung đúng một phạm vi — và hai cái trùng tên không phải là
  // một cái ghi đè cái kia, nó là `SyntaxError` ngay lúc nạp, tức là **cả trang không chạy một
  // dòng nào**. Không phải một màn hỏng: một cái khung trắng.
  //
  // Bắt được lần đầu khi `board.js` khai một `let picked` cho ô cờ đang chọn, mà `tienlen.js` đã
  // có một `picked` cho mấy lá bài đang nhấc lên. Sáu file thì mắt không canh nổi.
  const owner = new Map();
  const clash = [];
  for (const [name, src] of widgetScripts()) {
    const names = new Set();
    for (const one of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(one[1]);
    for (const one of src.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) names.add(one[1]);
    for (const found of names) {
      if (owner.has(found)) clash.push(`${found}: ${owner.get(found)} và ${name}`);
      else owner.set(found, name);
    }
  }
  assert.deepEqual(clash, [], `trùng tên là cả trang không nạp được:\n  ${clash.join('\n  ')}`);
});

test('nước máy vừa đi phải đọc ra được, nhất là ở bàn cờ tướng', () => {
  // Báo về: "ux cờ tướng như lol, đéo biết máy đi nước nào".
  //
  // Đúng, và nó là một chỗ tôi bê nguyên cách làm của bàn cờ vua sang mà không nhìn lại. Ở cờ vua
  // thì hai cái ô tô sáng đọc được — ô có nền, viền nằm trên nền. Ở cờ tướng thì **không có ô
  // vuông nào**: quân đứng trên giao điểm của một mặt gỗ kẻ lưới, nên một cái viền vuông mờ ở đó
  // là một vệt không ai thấy, và ba mươi hai cái đồng tròn na ná nhau thì mắt không so nổi với
  // trí nhớ sau mỗi lượt.
  //
  // Ba thứ chữa nó, và cả ba đều bị ghim ở đây.
  const board = readFileSync(new URL('./widget/board.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./widget/style.css', import.meta.url), 'utf8');
  const bot = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');

  // Một: bot nói ra **quân nào** vừa đi và ăn được gì. Nó biết sẵn; nói ra thì rẻ.
  assert.match(bot, /game\.last = \{[\s\S]{0,220}?piece: mover,[\s\S]{0,120}?eaten:/,
    'bot không còn nói quân nào vừa đi');
  assert.match(board, /function lastWords\(\)/, 'trang không còn đọc nước ấy ra thành chữ');

  // Hai: hai cái ô là **hai dấu khác nhau** — đi từ đâu, tới đâu — chứ không phải cùng một viền.
  assert.match(board, /at === last\.from \? ' from' : ''/, 'ô đi khỏi không còn dấu riêng');
  assert.match(board, /at === last\.to \? ' to' : ''/, 'ô tới không còn dấu riêng');
  for (const mark of ['.sq.from::after', '.sq.to::after']) {
    assert.ok(css.includes(mark), `${mark} không còn được vẽ`);
  }
  // Vẽ bằng `::after`, không bằng `box-shadow` của ô: ở cờ tướng con quân là một cái đĩa to gần
  // bằng ô, nên nó đè lên mất cái viền.
  assert.ok(!/\.sq\.last\b/.test(css), 'dấu cũ vẫn còn — hai ô lại dùng chung một viền');

  // Ba: bàn cờ tướng phải có **cung** và **sông**. Không phải trang trí — cung là chỗ tướng và sĩ
  // không ra khỏi được, sông là chỗ tốt qua rồi thì đi ngang được và tượng thì không qua. Ba luật,
  // vẽ thành hình. Không vẽ thì đó là ba luật người chơi phải nhớ thay vì nhìn.
  assert.match(board, /function drawXiangqiBoard\(/, 'cung và sông không còn được vẽ');
  assert.ok(css.includes('.palace'), 'cung không còn kiểu dáng');
  assert.ok(css.includes('.river'), 'sông không còn kiểu dáng');
});

test('nước đi của chính mình hiện ngay, không đợi bot', () => {
  // Báo về: "đánh cờ nó không ăn ngay, lag lắm".
  //
  // Đúng, và đó là cùng cái luật đã áp cho chip bầu cua từ lâu rồi mà tôi quên áp cho bàn cờ:
  // **vẽ ngay khi chạm, gửi sau**. Round-trip nhanh nhất cũng một phần mười giây, và một quân cờ
  // đứng im trong ngần ấy sau khi mình đã chạm vào ô đích thì đọc ra là cái bàn không nghe thấy
  // mình — người ta chạm lại lần nữa, và nước thứ hai mới là nước bị mất.
  //
  // Nước của **đối phương** thì đợi mạng là đúng: nó tới từ đằng kia thật.
  const widget = readFileSync(new URL('./widget/board.js', import.meta.url), 'utf8');

  const at = widget.indexOf('function playMove(move) {');
  assert.notEqual(at, -1, 'chỗ đi một nước đã dời đi');
  const body = widget.slice(at, widget.indexOf('\n}', at));

  // Vẽ trước, gửi sau — theo đúng thứ tự chữ trong hàm.
  const draws = body.indexOf('board[move.from] = 0;');
  const sends = body.indexOf('z.send(');
  assert.ok(draws >= 0 && sends >= 0, 'hàm ấy phải vừa vẽ vừa gửi');
  assert.ok(draws < sends, 'nó đang gửi trước khi vẽ — tức là vẫn đợi bot mới hiện');

  // Và khoá bàn lại ngay. Không khoá thì trong một phần mười giây ấy người ta đi thêm được một
  // nước từ một thế cờ đã cũ, bot từ chối, và cái bị mất là nước **đầu tiên**.
  assert.match(body, /state\.me\.moves = \[\];/, 'đi xong mà không khoá bàn lại');

  // Trang **không** tự suy ra hệ quả của nước đi: nó diễn lại đúng cái bot mô tả.
  assert.match(body, /move\.rook !== undefined/, 'con xe khi nhập thành không được diễn lại');
  assert.match(body, /move\.ep !== undefined/, 'con tốt bị bắt qua đường không được diễn lại');
  assert.ok(!/[^.\w]KING|castle|passant/i.test(body),
    'trang đang tự nghĩ ra luật cờ thay vì đọc lại cái bot nói');
});

test('bot mô tả trọn vẹn nước đi, kể cả chỗ bàn cờ đổi mà nước đi không nhắc tới', () => {
  // Có đúng hai chỗ như thế trong cờ vua, và cả hai đều là chỗ một ô đổi mà tên nước đi không hề
  // nói: nhập thành thì con xe cũng đi, bắt tốt qua đường thì con tốt bị ăn **không đứng ở ô
  // mình vừa tới**. Bot nói ra cả hai, nên trang vẽ lại được mà không phải biết luật.
  const back = chess.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const short = chess.moves(back).find((one) => one.from === 60 && one.to === 62);
  assert.deepEqual(chess.extrasOf(back, short).rook, { from: 63, to: 61 }, 'nhập thành gần');
  const long = chess.moves(back).find((one) => one.from === 60 && one.to === 58);
  assert.deepEqual(chess.extrasOf(back, long).rook, { from: 56, to: 59 }, 'nhập thành xa');

  const passing = chess.fromFen('8/8/8/3pP3/8/8/8/4K2k w - d6 0 1');
  const take = chess.moves(passing).find((one) => one.from === 28 && one.to === 19);
  assert.equal(chess.extrasOf(passing, take).ep, 27, 'ô con tốt bị bắt qua đường');

  // Nước thường thì không kèm gì, và một nước ăn quân bình thường cũng thế — quân bị ăn nằm
  // đúng ô mình vừa tới, nên không có gì phải nói thêm.
  const plain = chess.moves(back).find((one) => one.from === 60 && one.to === 61);
  assert.deepEqual(chess.extrasOf(back, plain), {});

  // Cờ tướng không có nước nào như thế, và hàm ấy **vẫn có mặt** — để bên gọi không phải hỏi
  // đang chơi trò nào.
  assert.deepEqual(xiangqi.extrasOf(xiangqi.start(), xiangqi.moves(xiangqi.start())[0]), {});
});

test('bàn cờ đo ra cỡ, chứ không nhờ CSS tự lo', () => {
  // Bản đầu để CSS lo: `aspect-ratio` cộng `max-width: 100%` cộng `max-height: 100%`. Nghe thì
  // đúng là "vừa khung mà giữ nguyên tỉ lệ". Nó không phải — không đặt chiều nào thì cái hộp lấy
  // cỡ **nội dung**, mà nội dung là mấy ô rỗng, nên cả bàn cờ co lại còn bằng một con tem. Đặt
  // một chiều bằng `100%` thì chiều ấy cứng, `max-*` bóp chiều kia, và tỉ lệ vỡ. Không có cách
  // viết nào của ba thuộc tính ấy ra được cái mình muốn.
  //
  // Cái mình muốn là một phép chia: **ô vuông lớn nhất mà cả bàn còn lọt khung**.
  const widget = readFileSync(new URL('./widget/board.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./widget/style.css', import.meta.url), 'utf8');

  assert.match(widget, /function sizeGrid\(grid, files, ranks\)/, 'phép đo đã dời đi');
  const rule = css.slice(css.indexOf('\n.grid {'), css.indexOf('}', css.indexOf('\n.grid {')));
  assert.ok(!rule.includes('aspect-ratio'),
    'bàn cờ lại nhờ `aspect-ratio` lo cỡ — nó sẽ co về cỡ nội dung');
  assert.match(rule, /--cell/, 'cỡ ô không còn là một biến đo được');

  // Và chạy lại đúng phép chia ấy trên mọi khung nền tảng có thể đưa ra: ô phải là số nguyên, cả
  // bàn phải lọt, và không được nhỏ tới mức không chạm nổi bằng ngón tay.
  const sizeGrid = (w, h, files, ranks) =>
    Math.max(12, Math.floor(Math.min(w / files, h / ranks)));

  for (const [wide, tall] of [[374, 300], [374, 372], [374, 420], [320, 300], [300, 260]]) {
    for (const [files, ranks] of [[8, 8], [9, 10]]) {
      const cell = sizeGrid(wide, tall, files, ranks);
      assert.ok(cell * files <= wide, `bàn ${files}×${ranks} tràn ngang ở khung ${wide}×${tall}`);
      assert.ok(cell * ranks <= tall, `bàn ${files}×${ranks} tràn dọc ở khung ${wide}×${tall}`);
      assert.ok(cell >= 26, `ô chỉ còn ${cell}px ở khung ${wide}×${tall} — ngón tay không chạm nổi`);
      assert.equal(cell, Math.floor(cell), 'ô lẻ phần mười pixel thì đường kẻ răng cưa');
    }
  }
});

test('không hai phần tử nào của trang mang cùng một id', () => {
  // Ra tới tay người chơi: "cờ vua vào còn không hiển thị gì".
  //
  // Màn cờ mang `id="board"`, mà chiếu bầu cua cũng đã mang `id="board"` từ trước.
  // `getElementById` trả về **cái đầu tiên**, nên `render()` bật tắt nhầm phần tử: nó gỡ `hidden`
  // khỏi cái chiếu bầu cua (đang nằm trong một màn khác, cũng đang ẩn) còn màn cờ thì cứ ẩn
  // nguyên. Vào cờ vua ra một khung trắng.
  //
  // Và nó hỏng cả hai đầu: hai luật CSS cùng tên `#board` đè lên nhau, nên cái chiếu bầu cua
  // nhận luôn kiểu dáng của màn cờ — sáu ô đặt cửa xếp thành một cột.
  //
  // Bộ smoke chạy trên một DOM giả **không bắt được**: nó dựng phần tử theo `Map` nên id trùng
  // gộp lại làm một, đúng cái chỗ trình duyệt không gộp. Một cái lỗi mà chính đồ nghề của mình
  // mù trước nó thì phải có luật viết ra.
  const html = readFileSync(new URL('./widget/index.html', import.meta.url), 'utf8');

  const seen = new Map();
  for (const found of html.matchAll(/id="([\w-]+)"/g)) {
    seen.set(found[1], (seen.get(found[1]) ?? 0) + 1);
  }
  const twice = [...seen].filter(([, many]) => many > 1);
  assert.deepEqual(twice, [],
    `id trùng thì getElementById chỉ thấy cái đầu: ${twice.map(([id]) => id).join(', ')}`);

  // Và mọi id trang gọi tới phải có thật ở đâu đó. `$('boardgame')` gõ nhầm một chữ thì không
  // nổ ra ngay — nó trả về `null`, rồi `.hidden = false` mới ném, ở một chỗ khác hẳn, và cái
  // vết ném ấy chỉ vào chỗ đọc chứ không chỉ vào chỗ gõ sai.
  //
  // "Ở đâu đó" gồm cả id do chính JavaScript gắn vào (`el.id = '…'`) — màn quảng cáo dựng nút
  // của nó rồi đọc lại bằng id, và đó là một cách dùng hợp lệ.
  const scripts = widgetScripts().map(([, src]) => src).join('\n');
  const made = new Set([...scripts.matchAll(/\.id = '([\w-]+)'/g)].map((one) => one[1]));
  const missing = [...new Set([...scripts.matchAll(/\$\('([\w-]+)'\)/g)].map((one) => one[1]))]
    .filter((id) => !seen.has(id) && !made.has(id));
  assert.deepEqual(missing, [], `trang gọi tới id không tồn tại: ${missing.join(', ')}`);
});

test('thứ chỉ hiện đôi lúc thì không được nằm trong dòng chảy', () => {
  // Luật này mua bằng một cái lỗi ra tới tay người chơi, và nó đáng được viết ra một lần cho
  // xong: **`#says` từng là một hàng thật**. `min-height: 0` lúc rỗng, 26px lúc có chữ, có cả
  // transition cho mượt. Nghe thì gọn.
  //
  // Nhưng cột của một trò xúc xắc chỉ có một hàng co được, nên hai mươi sáu pixel ấy đẩy cả cột
  // qua ngưỡng và hàng chip tiền rơi đè lên nút "Hoàn tác". Tệ hơn cả việc vỡ là **nó tự lành**:
  // lời nhắn hết hạn, hàng xẹp lại, bàn về như cũ. Một cái lỗi lúc bị lúc không, mà lúc không
  // thì không ai đi tìm.
  //
  // Xô cả trang đi vài chục pixel để nói một câu rồi kéo về cũng là hai lần chuyển động ở đúng
  // lúc ngón tay đang nhắm vào một cái nút — nên kể cả không vỡ thì nó vẫn sai.
  const css = readFileSync(new URL('./widget/style.css', import.meta.url), 'utf8');

  const floating = ['#says', '#promo', '#board-over', '#tx-below', '#tx-bat', '#plate', '#peek'];
  for (const one of floating) {
    // Khớp đúng dấu mở khối, không phải chỉ cái tên: `#tx-below .punters` đứng trước `#tx-below`
    // trong file, và tìm theo tên thôi thì đọc nhầm luật rồi báo sai chỗ.
    const at = [`\n${one} {`, `\n${one},`]
      .map((opener) => css.indexOf(opener))
      .filter((where) => where >= 0)
      .sort((x, y) => x - y)[0];
    assert.ok(at !== undefined, `${one} đã dời đi khỏi stylesheet`);
    const rule = css.slice(at, css.indexOf('}', at));
    assert.match(rule, /position: absolute/,
      `${one} chỉ hiện đôi lúc mà lại nằm trong dòng chảy — nó sẽ xô cả trang mỗi lần hiện ra`);
  }

  // Và nó phải **tự đi**. Một lời từ chối còn nằm đó sau khi người ta đã sửa xong là một lời nói
  // về một chuyện không còn nữa.
  const widget = readFileSync(new URL('./widget/tienlen.js', import.meta.url), 'utf8');
  assert.match(widget, /const SAYS_MS = [\d_]+;/, 'lời nhắn không còn tự hết hạn');
  assert.match(widget, /saying = setTimeout\(/, 'không còn cái hẹn giờ dọn lời nhắn đi');
});

// ---- cờ vua và cờ tướng --------------------------------------------------------------------
//
// Luật cờ kiểm bằng **perft**, và không có cách nào khác đáng tin bằng.
//
// Perft là: từ một thế cờ, đếm hết số lá ở độ sâu n. Con số ấy là một con số **đã biết** — cả
// thế giới đếm ra cùng một số cho cùng một thế — nên nó bắt được mọi luật thiếu, và bắt được cả
// những luật thiếu mà không ai nghĩ tới. Một cái test viết tay chỉ hỏi được những gì người viết
// nhớ ra để hỏi: quên luật "nhập thành không đi qua ô bị chiếu" thì cũng quên luôn cái test về
// nó. Perft thì không quên gì cả, vì nó không hỏi luật nào — nó đếm.
//
// Bốn thế dưới đây là bốn thế chuẩn ai viết engine cờ vua cũng chạy, chọn đúng để chạm vào
// những góc khuất: nhập thành hai bên, bắt tốt qua đường mở đường chiếu, phong quân bằng nước
// ăn, và một thế rối để không quân nào không được hỏi tới.

const PERFT = [
  ['mở đầu', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
  ['tốt và ep', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
  ['phong quân', 'n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1', [24, 496, 9483]],
];

const perft = (rules, pos, depth) => (depth === 0 ? 1
  : rules.moves(pos).reduce((n, move) => n + perft(rules, rules.apply(pos, move, true), depth - 1), 0));

test('cờ vua: perft khớp ở bốn thế chuẩn', () => {
  for (const [name, fen, want] of PERFT) {
    want.forEach((leaves, i) => {
      assert.equal(perft(chess, chess.fromFen(fen), i + 1), leaves, `${name} ở độ sâu ${i + 1}`);
    });
  }
});

test('cờ tướng: perft khớp ở thế khai cuộc', () => {
  // Bốn mươi bốn nước ở nước đầu, và con số ấy đã gói sẵn cả cản chân mã, mắt tượng, pháo chưa
  // có ngòi thì không ăn được, và tướng không ra khỏi cung.
  for (const [depth, leaves] of [[1, 44], [2, 1920], [3, 79666]]) {
    assert.equal(perft(xiangqi, xiangqi.start(), depth), leaves, `độ sâu ${depth}`);
  }
});

test('cờ tướng: mấy luật không có ở cờ vua', () => {
  const at = xiangqi.squareAt;
  // Tướng lệch cột, để cái thế dựng ra không tự dính luật đối mặt — mà chính cái bẫy ấy là bằng
  // chứng luật đối mặt đang chạy.
  const bare = (turn = xiangqi.RED) => {
    const board = new Int8Array(90);
    board[at(9, 3)] = xiangqi.KING | xiangqi.RED;
    board[at(0, 5)] = xiangqi.KING | xiangqi.BLACK;
    return { board, turn, half: 0, full: 1, seen: [] };
  };
  const from = (pos, square) => xiangqi.moves(pos).filter((one) => one.from === square);

  // Tướng đối mặt: quân duy nhất chắn giữa hai tướng thì không được rời khỏi cột ấy.
  const facing = bare();
  facing.board[at(9, 3)] = 0;
  facing.board[at(9, 4)] = xiangqi.KING | xiangqi.RED;
  facing.board[at(0, 5)] = 0;
  facing.board[at(0, 4)] = xiangqi.KING | xiangqi.BLACK;
  facing.board[at(5, 4)] = xiangqi.CHARIOT | xiangqi.RED;
  assert.equal(from(facing, at(5, 4)).filter((one) => xiangqi.colOf(one.to) !== 4).length, 0,
    'quân chắn giữa hai tướng rời khỏi cột được — hai tướng sẽ nhìn thẳng nhau');
  assert.ok(from(facing, at(5, 4)).length > 0, 'mà đi dọc cột ấy thì vẫn được');

  // Pháo: đi như xe, ăn thì phải có đúng một ngòi.
  const gun = bare();
  gun.board[at(5, 0)] = xiangqi.CANNON | xiangqi.RED;
  gun.board[at(3, 0)] = xiangqi.SOLDIER | xiangqi.RED;
  gun.board[at(1, 0)] = xiangqi.CHARIOT | xiangqi.BLACK;
  const shots = from(gun, at(5, 0)).map((one) => one.to);
  assert.ok(shots.includes(at(1, 0)), 'pháo có ngòi mà không ăn được quân sau ngòi');
  assert.ok(!shots.includes(at(3, 0)), 'pháo ăn mất chính cái ngòi của nó');
  gun.board[at(3, 0)] = 0;
  assert.ok(!from(gun, at(5, 0)).some((one) => one.to === at(1, 0)),
    'pháo không ngòi mà vẫn ăn được');

  // Tốt: chưa sang sông thì chỉ đi thẳng; sang rồi thì đi ngang được, và không bao giờ lùi.
  const before = bare();
  before.board[at(6, 2)] = xiangqi.SOLDIER | xiangqi.RED;
  assert.equal(from(before, at(6, 2)).length, 1, 'tốt chưa sang sông phải chỉ có một nước');
  const after = bare();
  after.board[at(4, 2)] = xiangqi.SOLDIER | xiangqi.RED;
  const wide = from(after, at(4, 2)).map((one) => one.to);
  assert.equal(wide.length, 3, 'tốt sang sông phải đi được ba hướng');
  assert.ok(!wide.includes(at(5, 2)), 'và không bao giờ lùi');

  // Mã cản chân, tượng cản mắt — hai luật không có bản tương đương nào ở cờ vua.
  const horse = bare();
  horse.board[at(5, 4)] = xiangqi.HORSE | xiangqi.RED;
  assert.equal(from(horse, at(5, 4)).length, 8, 'mã giữa bàn phải có tám nước');
  horse.board[at(4, 4)] = xiangqi.SOLDIER | xiangqi.RED;
  assert.equal(from(horse, at(5, 4)).length, 6, 'một quân cản chân phải chặn đúng hai nước');

  const elephant = bare();
  elephant.board[at(7, 2)] = xiangqi.ELEPHANT | xiangqi.RED;
  assert.equal(from(elephant, at(7, 2)).length, 4);
  elephant.board[at(6, 1)] = xiangqi.SOLDIER | xiangqi.RED;
  assert.equal(from(elephant, at(7, 2)).length, 3, 'mắt tượng bị lấp phải chặn đúng một nước');
  const river = bare();
  river.board[at(5, 2)] = xiangqi.ELEPHANT | xiangqi.RED;
  assert.equal(from(river, at(5, 2)).filter((one) => xiangqi.rowOf(one.to) < 5).length, 0,
    'tượng sang được sông');
});

test('hết nước đi: cờ vua thì hoà, cờ tướng thì thua', () => {
  // Chỗ khác nhau lớn nhất giữa hai trò, và là chỗ ai chuyển từ bên này sang bên kia cũng quên.
  const stale = chess.fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(chess.moves(stale), [], 'thế này phải hết nước đi');
  assert.equal(chess.status(stale).over, 'stalemate');
  assert.equal(chess.status(stale).winner, null, 'cờ vua: hết nước mà không bị chiếu là hoà');

  const at = xiangqi.squareAt;
  const board = new Int8Array(90);
  board[at(0, 4)] = xiangqi.KING | xiangqi.BLACK;
  board[at(1, 3)] = xiangqi.CHARIOT | xiangqi.RED;
  board[at(1, 5)] = xiangqi.CHARIOT | xiangqi.RED;
  board[at(9, 4)] = xiangqi.KING | xiangqi.RED;
  const dead = { board, turn: xiangqi.BLACK, half: 0, full: 1, seen: [] };
  assert.deepEqual(xiangqi.moves(dead), [], 'thế này phải hết nước đi');
  assert.equal(xiangqi.status(dead).winner, xiangqi.RED, 'cờ tướng: hết nước đi là thua');
});

test('cái máy thấy đường bí một nước, và đánh xong được một ván', () => {
  const mate = chess.fromFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  assert.equal(chess.nameOfMove(chess.choose(mate, 3)), 'a1a8', 'xe xuống hàng cuối là bí');

  // Và một ván trọn vẹn phải **kết thúc**. Một con máy đi loanh quanh mãi không phải là một con
  // máy yếu — nó là một cái bàn không bao giờ trả tiền cho ai.
  for (const rules of [chess, xiangqi]) {
    let pos = rules.start();
    let moves = 0;
    while (!rules.status(pos) && moves < 300) {
      const move = rules.choose(pos, 2);
      assert.ok(move, 'còn nước đi mà máy không chọn được nước nào');
      pos = rules.apply(pos, move);
      moves++;
    }
    assert.ok(rules.status(pos), `một ván chạy quá ${moves} nước mà chưa xong`);
  }
});

test('một lượt máy nghĩ không được giữ con bot lại quá lâu', () => {
  // Con bot chạy một luồng và phục vụ nhiều bàn. Một lượt nghĩ nửa giây là **mọi bàn khác đứng
  // im** trong ngần ấy — bàn tiến lên không nhận được lá bài, cái bát tài xỉu trễ mất nhịp xóc.
  // Nên trần là số nút chứ không phải đồng hồ, và đây là chỗ đo lại xem trần ấy còn đúng không.
  for (const [name, rules] of [['cờ vua', chess], ['cờ tướng', xiangqi]]) {
    let pos = rules.start();
    const spent = [];
    for (let i = 0; i < 12 && !rules.status(pos); i++) {
      const began = Date.now();
      const move = rules.choose(pos);
      spent.push(Date.now() - began);
      pos = rules.apply(pos, move);
    }
    spent.sort((a, b) => a - b);
    // Trung vị, không phải lần tệ nhất: một lần đo lẻ bị bộ dọn rác chen ngang thì nói về cái
    // máy chứ không nói về thuật toán. Lần tệ nhất để một khoảng rộng.
    assert.ok(spent[spent.length >> 1] < 150,
      `${name}: một lượt nghĩ trung vị ${spent[spent.length >> 1]}ms`);
    assert.ok(spent[spent.length - 1] < 700, `${name}: lần tệ nhất ${spent[spent.length - 1]}ms`);
  }
});

test('một bàn cờ chạy trên đồng hồ dài hơn một ván bài', () => {
  // Ở tiến lên người ta đọc mười ba lá rồi đánh; ở đây người ta **nghĩ**.
  assert.ok(BOARD_TURN_MS >= 30_000, `một nước cờ chỉ được ${BOARD_TURN_MS}ms để nghĩ`);
  assert.ok(BOARD_TURN_MS > TURN_MS, 'một nước cờ phải rộng hơn một lượt bài');
  // Và máy thì giả vờ chậm: nó tính xong trong mấy chục mili giây, mà một quân tự nhảy đúng lúc
  // tay mình vừa rời ra thì không đọc ra là có ai đang chơi.
  assert.ok(BOARD_THINK_MS >= 300, 'máy đi nhanh quá thì không đọc ra là có ai đang chơi');
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
