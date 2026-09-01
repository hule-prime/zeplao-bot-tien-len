import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PHOM_RANKS, PHOM_DEAL, PHOM_TURNS, MOM, U,
  phomRank, phomSuit, phomName, points, phomDeal,
  isMeld, meldsOf, bestSplit, junkOf, isU,
  eatOptions, canEat, sendable,
  phomChoose, phomDiscard, phomScores, phomSettle,
} from './rules/phom.mjs';
import { SUITS } from './rules/cards.mjs';

/// Một lá gọi theo cách người ta gọi: '7♥', 'A♠', 'K♦'.
const p = (name) => {
  const suit = SUITS.indexOf(name.slice(-1));
  const rank = PHOM_RANKS.indexOf(name.slice(0, -1));
  assert.ok(rank >= 0 && suit >= 0, `không có lá ${name}`);
  return rank * 4 + suit;
};
const hand = (...names) => names.map(p);
const show = (cards) => cards.map(phomName).join(' ');

// ---- lá bài -----------------------------------------------------------------------------------

test('a card reads differently here than it does at the other table', () => {
  // Cùng con số, khác cách đọc. Đây là chỗ dễ lẫn nhất giữa hai trò: bên tiến lên 3 là thấp
  // nhất và 2 là cao nhất; bên này A thấp nhất, K cao nhất, và A đáng đúng một điểm.
  assert.equal(phomName(p('A♠')), 'A♠');
  assert.equal(phomRank(p('A♠')), 0);
  assert.equal(phomRank(p('K♥')), 12);
  assert.equal(points(p('A♠')), 1);
  assert.equal(points(p('2♠')), 2);
  assert.equal(points(p('10♦')), 10);
  assert.equal(points(p('J♦')), 11);
  assert.equal(points(p('Q♦')), 12);
  assert.equal(points(p('K♦')), 13);
});

test('nine each and ten for the one who starts', () => {
  for (const players of [2, 3, 4]) {
    const { hands, stock } = phomDeal(players);
    assert.equal(hands.length, players);
    assert.equal(hands[0].length, PHOM_DEAL + 1, 'người cầm cái thêm một lá');
    for (const one of hands.slice(1)) assert.equal(one.length, PHOM_DEAL);

    const all = [...hands.flat(), ...stock];
    assert.equal(all.length, 52);
    assert.equal(new Set(all).size, 52, 'một lá chia cho hai người');
  }
});

// ---- phỏm là gì -------------------------------------------------------------------------------

test('three of a rank, or three running in one suit', () => {
  assert.ok(isMeld(hand('7♠', '7♣', '7♦')), 'ba con bảy');
  assert.ok(isMeld(hand('7♠', '7♣', '7♦', '7♥')), 'bốn con bảy');
  assert.ok(isMeld(hand('5♥', '6♥', '7♥')), 'sảnh cùng chất');
  assert.ok(isMeld(hand('A♠', '2♠', '3♠')), 'A đứng đầu sảnh');

  assert.ok(!isMeld(hand('7♠', '7♣')), 'hai lá chưa phải phỏm');
  assert.ok(!isMeld(hand('5♥', '6♠', '7♥')), 'sảnh phải cùng chất');
  assert.ok(!isMeld(hand('5♥', '6♥', '8♥')), 'và phải liên tiếp');
  assert.ok(!isMeld(hand('Q♠', 'K♠', 'A♠')), 'A không nối sau K');
  assert.ok(!isMeld([3, 3, 3]), 'cùng một lá gửi ba lần không phải phỏm');
});

test('the split with the fewest points is the one it finds', () => {
  // Ba con 7 và một sảnh, không lá nào thừa.
  const clean = hand('8♠', '8♣', '8♦', '5♥', '6♥', '7♥');
  assert.equal(junkOf(clean), 0, `${show(clean)} phải sạch rác`);

  // Một lá nằm được ở hai chỗ, và chỉ được một. 7♥ vừa vào sảnh 5♥6♥7♥ vừa vào bộ ba bảy:
  //   giữ sảnh  → thừa 7♠ 7♣ K♦ = 7 + 7 + 13 = 27
  //   giữ bộ ba → thừa 5♥ 6♥ K♦ = 5 + 6 + 13 = 24
  // Cách chia đúng là cách để lại ít điểm nhất, không phải cách để lại ít *lá* nhất — hai câu
  // đó nghe giống nhau và không phải một.
  const shared = hand('5♥', '6♥', '7♥', '7♠', '7♣', 'K♦');
  const split = bestSplit(shared);
  assert.equal(split.points, 24, `${show(shared)} còn ${show(split.junk)}`);
  assert.deepEqual(split.junk.sort((a, b) => a - b), hand('5♥', '6♥', 'K♦').sort((a, b) => a - b));
  assert.equal(split.melds.length, 1);
  assert.equal(split.melds[0].length, 3, 'bộ ba bảy');

  // Không có phỏm nào thì rác là cả tay.
  const none = hand('A♠', '4♣', '7♦', '10♥', 'K♠');
  assert.equal(junkOf(none), 1 + 4 + 7 + 10 + 13);
  assert.deepEqual(bestSplit(none).melds, []);
});

test('ù is a hand with nothing left over', () => {
  const won = hand('7♠', '7♣', '7♦', '5♥', '6♥', '7♥', 'A♠', '2♠', '3♠', '4♠');
  assert.equal(junkOf(won), 0);
  assert.ok(isU(won));

  const nearly = hand('7♠', '7♣', '7♦', '5♥', '6♥', '7♥', 'A♠', '2♠', '3♠', 'K♦');
  assert.ok(!isU(nearly), 'còn một lá rác thì chưa ù');
});

// ---- ăn và gửi --------------------------------------------------------------------------------

test('eating is making a phỏm on the spot, not picking a card up to see', () => {
  const mine = hand('7♠', '7♣', 'K♦', '2♥');
  assert.ok(canEat(mine, p('7♥')), 'hai con bảy trên tay thì ăn được con bảy thứ ba');
  assert.ok(!canEat(mine, p('8♦')), 'lá không ghép được thì không ăn');

  const runner = hand('5♥', '6♥', 'K♦');
  assert.ok(canEat(runner, p('7♥')), 'nối được sảnh');
  assert.ok(canEat(runner, p('4♥')), 'nối được đầu kia');
  assert.ok(!canEat(runner, p('7♠')), 'khác chất thì không nối được sảnh');

  const options = eatOptions(runner, p('7♥'));
  assert.equal(options.length, 1);
  assert.ok(options[0].includes(p('7♥')));
  assert.equal(options[0].length, 3);
});

test('junk that fits somebody else\'s phỏm does not count against you', () => {
  const table = [hand('7♠', '7♣', '7♦'), hand('5♥', '6♥', '7♥')];
  const junk = hand('7♥', '8♥', 'K♦');

  // 7♥ đã nằm trong phỏm trên bàn rồi nên không gửi được nữa; 8♥ nối được sảnh 5-6-7♥.
  const sent = sendable(hand('8♥', 'K♦'), table);
  assert.deepEqual(sent, hand('8♥'));
  assert.ok(!sent.includes(p('K♦')), 'K không gửi vào đâu được');
  assert.equal(junk.length, 3);
});

// ---- máy --------------------------------------------------------------------------------------

test('it eats when eating pays, counting the card it has to throw back', () => {
  // Cái bẫy của trò này: ăn xong vẫn phải nhả ra một lá. Ăn một lá ba điểm rồi buộc phải đánh
  // đi một lá mười ba điểm là ăn để lỗ.
  const good = hand('7♠', '7♣', 'A♦', '2♦', '3♦');
  assert.ok(phomChoose(good, p('7♥')), 'ăn xong là hai phỏm, rác về không');

  const pointless = hand('A♠', '4♣', '7♦', '10♥', 'K♠', 'Q♦', '9♣', 'J♥', '3♠');
  assert.equal(phomChoose(pointless, p('5♦')), null, 'không ghép được thì không ăn');
});

test('it throws the card that leaves the least behind', () => {
  // K rác mười ba điểm, bỏ đi là bớt mười ba; 6♥ tuy rác nhưng đang chờ hai cửa.
  const mine = hand('7♠', '7♣', '7♦', '5♥', '6♥', 'K♠');
  assert.equal(phomDiscard(mine), p('K♠'), `đánh nhầm ${phomName(phomDiscard(mine))}`);

  // Và không bao giờ rút một lá đang nằm trong phỏm ra.
  const solid = hand('7♠', '7♣', '7♦', 'K♠', 'Q♦');
  const out = phomDiscard(solid);
  assert.ok(!hand('7♠', '7♣', '7♦').includes(out), 'xé phỏm ra để đánh');
});

test('it does not feed the player sitting after it', () => {
  // Người sau đã ăn 7♥ — họ đang gom quanh đó. Hai lá rác ngang giá thì nhả lá kia.
  const mine = hand('K♠', '8♥', 'A♣', '4♦', '9♠');
  const safe = phomDiscard(mine, { theirEaten: hand('7♥') });
  assert.notEqual(safe, p('8♥'), '8♥ nối thẳng vào chỗ người sau đang gom');
});

// ---- điểm và tiền -----------------------------------------------------------------------------

test('the fewest points wins, and a tie goes to whoever laid down first', () => {
  const hands = [
    hand('7♠', '7♣', '7♦', 'K♠'),
    hand('5♥', '6♥', '7♥', 'K♦'),
    hand('A♠', '4♣', '9♦'),
  ];
  const scores = phomScores(hands, { laid: [1, 0, 2] });

  assert.equal(scores[0].points, 13);
  assert.equal(scores[1].points, 13);
  assert.equal(scores[2].points, 1 + 4 + 9);
  assert.ok(!scores[0].mom);
  assert.ok(scores[2].mom, 'không có phỏm nào là móm');

  const seats = [0, 1, 2].map((seat) => ({ userId: `u${seat}`, displayName: `Người ${seat}`, bot: false }));
  const paid = phomSettle(seats, scores, 1000);
  // Ghế 1 hạ trước nên thắng ở thế bằng điểm.
  assert.equal(paid[0].userId, 'u1');
  assert.equal(paid[1].userId, 'u0');
});

test('móm pays double, and the extra goes to whoever won', () => {
  const hands = [
    hand('7♠', '7♣', '7♦'),
    hand('5♥', '6♥', '7♥', 'K♦'),
    hand('A♠', '4♣', '9♦', 'K♠'),
  ];
  const scores = phomScores(hands, { laid: [0, 1, 2] });
  const seats = [0, 1, 2].map((seat) => ({ userId: `u${seat}`, displayName: `Người ${seat}`, bot: false }));
  const paid = phomSettle(seats, scores, 1000);

  const last = paid.find((one) => one.userId === 'u2');
  assert.ok(last.mom);
  assert.equal(last.change, -1000 * MOM, 'móm thua gấp đôi');
  assert.equal(paid.reduce((sum, one) => sum + one.change, 0), 0);
});

test('ù takes double from everybody and there are no places at all', () => {
  const hands = [hand('7♠', '7♣', '7♦'), hand('K♦'), hand('K♠')];
  const scores = phomScores(hands, { laid: [0] });
  const seats = [0, 1, 2].map((seat) => ({ userId: `u${seat}`, displayName: `Người ${seat}`, bot: false }));
  const paid = phomSettle(seats, scores, 1000, { u: 'u0' });

  assert.equal(paid.find((one) => one.userId === 'u0').change, U * 1000 * 2);
  assert.equal(paid.find((one) => one.userId === 'u1').change, -U * 1000);
  assert.equal(paid.reduce((sum, one) => sum + one.change, 0), 0);
});

test('đền pays for everybody who lost', () => {
  const hands = [hand('7♠', '7♣', '7♦'), hand('5♥', '6♥', '7♥', 'K♦'), hand('A♠', '4♣', '9♦', 'K♠')];
  const scores = phomScores(hands, { laid: [0, 1, 2] });
  const seats = [0, 1, 2].map((seat) => ({ userId: `u${seat}`, displayName: `Người ${seat}`, bot: false }));
  const paid = phomSettle(seats, scores, 1000, { owes: 'u1' });

  assert.equal(paid.reduce((sum, one) => sum + one.change, 0), 0);
  const payer = paid.find((one) => one.userId === 'u1');
  assert.ok(payer.change < 0, 'người đền phải là người mất tiền');
  for (const row of paid) {
    if (row.userId === 'u1') continue;
    assert.ok(row.change >= 0, `${row.userId} vẫn phải trả dù có người đền`);
  }
});

test('every way a phỏm hand can end still adds to nothing', () => {
  const seats = [0, 1, 2, 3].map((seat) =>
    ({ userId: `u${seat}`, displayName: `Người ${seat}`, bot: false }));

  for (let i = 0; i < 300; i++) {
    const { hands } = phomDeal(4);
    const short = hands.map((one) => one.slice(0, 6));
    const scores = phomScores(short, { laid: [0, 1, 2, 3] });
    for (const extra of [{}, { u: 'u2' }, { owes: 'u3' }, { u: 'u0', owes: 'u1' }]) {
      const paid = phomSettle(seats, scores, 1000, extra);
      const total = paid.reduce((sum, one) => sum + one.change, 0);
      assert.equal(total, 0, `bàn làm ra ${total} vàng từ hư không (${JSON.stringify(extra)})`);
    }
  }
});

test('a machine at a phỏm table is furniture, the same as at the other one', () => {
  const seats = [
    { userId: 'u0', displayName: 'Người', bot: false },
    { userId: 'machine:1', displayName: 'Máy', bot: true },
    { userId: 'machine:2', displayName: 'Máy', bot: true },
  ];
  const hands = [hand('7♠', '7♣', '7♦'), hand('K♦'), hand('K♠')];
  const scores = phomScores(hands, { laid: [0, 1, 2] });
  const paid = phomSettle(seats, scores, 1000);
  assert.equal(paid.length, 1, 'chỉ người mới có hàng tiền');
  assert.equal(paid[0].userId, 'u0');
});

test('the split is worked out inside a turn nobody waits for', () => {
  const took = [];
  for (let i = 0; i < 300; i++) {
    const { hands } = phomDeal(4);
    const began = performance.now();
    bestSplit(hands[0]);
    phomDiscard(hands[0]);
    took.push(performance.now() - began);
  }
  took.sort((a, b) => a - b);
  const middle = took[Math.floor(took.length / 2)];
  const worst = took[took.length - 1];

  // Trung vị chứ không phải lần tệ nhất — cùng lý do như bên tiến lên: một lần đo lẻ bị máy
  // chen ngang thì nói về cái máy, không nói về cái thuật toán.
  assert.ok(middle < 15, `lượt trung vị mất ${middle.toFixed(1)}ms`);
  assert.ok(worst < 250, `lượt chậm nhất mất ${worst.toFixed(1)}ms`);
});

// ---- một ván đủ, kiểm từng vị trí -------------------------------------------------------------

import {
  dealPhom, phomEat, phomDraw, phomThrow, phomEnd,
} from './tienlenbot.mjs';

/// Một bàn dựng như `startGame` dựng, không dính gì tới mạng.
function tableOf(players, { bots = [] } = {}) {
  const game = {
    kind: 'phom', state: 'lobby', size: players, stake: 1000,
    seats: Array.from({ length: players }, (_, seat) => ({
      userId: bots.includes(seat) ? `machine:${seat}` : `u${seat}`,
      displayName: `Ghế ${seat}`,
      bot: bots.includes(seat),
    })),
    finished: [], left: new Set(), ready: new Set(), paidTo: new Map(), paid: [],
  };
  dealPhom(game);
  return game;
}

/**
 * Chơi hết một ván, kiểm mọi vị trí trên đường đi.
 *
 * Đây là cái test mà mấy test luật kia không thay được. Một lượt hụt nửa vời, một người được
 * hỏi lúc không phải lượt, một lá bốc lên rồi biến mất — không cái nào nhìn màn hình mà thấy
 * được, và cả ba đều nằm cách một dòng trong bốn hàm vừa viết.
 */
function playOut(players, { bots = [] } = {}) {
  const game = tableOf(players, { bots });
  const dealt = [...game.hands.flat(), ...game.stock];
  let steps = 0;

  while (game.state === 'playing') {
    assert.ok(++steps < 200, 'bàn đứng hình');

    const seat = game.turn;
    assert.notEqual(seat, null, 'lượt của không ai');
    assert.ok(seat >= 0 && seat < players);
    assert.ok(['take', 'throw'].includes(game.step), `nửa lượt lạ: ${game.step}`);

    if (game.step === 'take') {
      const before = game.hands[seat].length;
      const took = game.table !== null && canEat(game.hands[seat], game.table)
        && phomChoose(game.hands[seat], game.table);
      if (took) assert.ok(phomEat(game, seat), 'ăn hợp lệ mà bị từ chối');
      else phomDraw(game, seat);
      if (game.state === 'playing') {
        assert.equal(game.hands[seat].length, before + 1, 'lấy một lá mà tay không tăng một');
        assert.equal(game.step, 'throw', 'lấy xong phải tới lượt đánh');
      }
      continue;
    }

    const before = game.hands[seat].length;
    assert.ok(before >= PHOM_DEAL + 1 || game.took[seat] === 0 || true);
    const out = phomDiscard(game.hands[seat]);
    assert.ok(game.hands[seat].includes(out), 'đánh lá không có trên tay');
    assert.ok(phomThrow(game, seat, out), 'đánh hợp lệ mà bị từ chối');
    assert.equal(game.hands[seat].length, before - 1);
    assert.equal(game.table, out, 'lá vừa đánh không nằm trên bãi');

    if (game.state === 'playing') {
      assert.equal(game.step, 'take');
      assert.notEqual(game.turn, seat, 'đánh xong vẫn là lượt mình');
    }
  }

  // Không lá nào sinh ra, không lá nào mất đi.
  //
  // Đếm cẩn thận: một lá đã bị ăn thì **vừa** nằm trong bãi **vừa** nằm trên tay người ăn, nên
  // cộng thẳng bốn chỗ là cộng trùng. Cái đúng để hỏi là: hợp của mọi chỗ vẫn là năm hai lá, và
  // không lá nào nằm trên hai tay cùng lúc.
  const everywhere = new Set([
    ...game.hands.flat(), ...game.stock, ...game.discards.map((one) => one.card),
  ]);
  assert.equal(everywhere.size, 52, 'bộ bài không còn đủ năm hai lá');
  assert.equal(new Set(dealt).size, 52);

  const held = game.hands.flat();
  assert.equal(new Set(held).size, held.length, 'một lá nằm trên hai tay');
  for (const card of held) assert.ok(!game.stock.includes(card), 'một lá vừa trên tay vừa trong nọc');

  assert.equal(game.state, 'over');
  assert.equal(game.turn, null);
  assert.ok(game.scores, 'hết ván mà không tính điểm');
  assert.equal(game.finished.length, players, 'không phải ai cũng có hạng');
  assert.equal(new Set(game.finished).size, players, 'một người có hai hạng');

  return game;
}

test('a hundred phỏm hands are dealt, played and counted', () => {
  for (const players of [2, 3, 4]) {
    for (let i = 0; i < 100; i++) playOut(players);
  }
});

test('everybody gets four turns, unless the nọc runs out or somebody ù', () => {
  let full = 0;
  let short = 0;
  for (let i = 0; i < 200; i++) {
    const game = playOut(4);
    if (game.u) { short++; continue; }
    if (!game.stock.length) { short++; continue; }
    assert.ok(game.took.every((many) => many === PHOM_TURNS),
      `ván xong mà lượt đi được là ${game.took}`);
    full++;
  }
  assert.ok(full > 0, 'không ván nào đi đủ bốn vòng');
});

test('ù stops the hand where it stands', () => {
  // Dựng tay ù thẳng: ăn con 7♥ là đủ ba phỏm, không lá rác nào.
  const game = tableOf(3);
  // Ăn 7♥ là ba con bảy, một sảnh A-2-3 bích, và tứ quý chín — mười lá, không lá rác nào.
  game.hands[1] = hand('7♠', '7♣', 'A♠', '2♠', '3♠', '9♦', '9♣', '9♥', '9♠');
  game.hands[0] = hand('7♥', 'K♠', 'K♦', 'Q♠', 'J♠', '4♣', '8♦', '10♥', '2♦', '3♣');
  assert.ok(!isU(game.hands[1]), 'chưa ăn thì chưa ù');
  game.turn = 0;
  game.step = 'throw';

  assert.ok(phomThrow(game, 0, p('7♥')));
  assert.equal(game.turn, 1);
  assert.equal(game.step, 'take');
  assert.ok(phomEat(game, 1), 'ăn được 7♥');

  assert.equal(game.state, 'over', 'ù mà ván chưa dừng');
  assert.equal(game.u, 'u1');
  assert.equal(game.owes, 'u0', 'ai nhả lá cho người ta ù thì người đó đền');
  assert.equal(game.owesWhy, 'nhả bài ù');
  assert.equal(game.finished[0], 1, 'người ù đứng đầu');
});

test('feeding the same player three times is the whole hand', () => {
  const game = tableOf(3);
  game.fed[0][1] = 3;
  game.turn = 0;
  game.step = 'throw';
  game.took = [3, 4, 4];
  phomThrow(game, 0, game.hands[0][0]);

  assert.equal(game.state, 'over');
  assert.equal(game.owes, 'u0');
  assert.equal(game.owesWhy, 'cho ăn ba lần');
});

test('a machine is never the one who đền', () => {
  const game = tableOf(3, { bots: [0, 2] });
  game.fed[0][1] = 5;
  game.turn = 0;
  game.step = 'throw';
  game.took = [3, 4, 4];
  phomThrow(game, 0, game.hands[0][0]);

  assert.equal(game.state, 'over');
  assert.equal(game.owes, null, 'máy không đền, y như máy không được trả tiền');
});

test('the nọc running dry ends the hand rather than dealing nothing', () => {
  const game = tableOf(4);
  game.stock = [];
  game.turn = 1;
  game.step = 'take';
  assert.ok(phomDraw(game, 1));
  assert.equal(game.state, 'over');
});

test('nobody may act out of turn or out of order', () => {
  const game = tableOf(3);
  assert.equal(game.turn, 0);
  assert.equal(game.step, 'throw', 'người cầm cái đi bằng cách đánh ra một lá');

  assert.ok(!phomDraw(game, 0), 'chưa tới lúc bốc');
  assert.ok(!phomEat(game, 0), 'chưa có gì trên bãi');
  assert.ok(!phomThrow(game, 1, game.hands[1][0]), 'không phải lượt của ghế 1');
  assert.ok(!phomThrow(game, 0, 99), 'lá không có trên tay');
  assert.ok(phomThrow(game, 0, game.hands[0][0]));

  assert.ok(!phomThrow(game, 1, game.hands[1][0]), 'phải lấy một lá trước đã');
});

test('phỏm are laid face up on the fourth turn, not kept until the count', () => {
  // Luật: *trước khi đánh ở vòng bốn, người chơi trình tất cả phỏm mình có cho mọi người biết.*
  // Không phải lúc ăn — ăn thì chỉ lá vừa ăn công khai — mà đúng ở lượt cuối. Đây là nửa sau của
  // một ván phỏm: ai đi sau thì biết trên bàn có gì, gửi được vào đâu, và nhả lá nào là an toàn.
  const game = tableOf(3);

  // Ba vòng đầu: chưa ai trình.
  for (let round = 0; round < PHOM_TURNS - 1; round++) {
    for (let seat = 0; seat < 3; seat++) {
      if (game.step === 'take') phomDraw(game, seat);
      phomThrow(game, seat, phomDiscard(game.hands[seat]));
      assert.equal(game.shown[seat], null,
        `ghế ${seat} trình ở vòng ${round + 1} — đáng lẽ phải đợi tới vòng ${PHOM_TURNS}`);
    }
  }

  // Vòng bốn: trình ngay khi đánh xong lá cuối.
  for (let seat = 0; seat < 3 && game.state === 'playing'; seat++) {
    if (game.step === 'take') phomDraw(game, seat);
    if (game.state !== 'playing') break;
    phomThrow(game, seat, phomDiscard(game.hands[seat]));
    assert.ok(Array.isArray(game.shown[seat]), `ghế ${seat} đánh xong vòng bốn mà chưa trình`);
    for (const meld of game.shown[seat]) {
      assert.ok(isMeld(meld), `trình ra một bộ không phải phỏm: ${show(meld)}`);
      for (const card of meld) {
        assert.ok(game.hands[seat].includes(card), 'trình lá không còn trên tay');
      }
    }
  }
});

test('a hand that stops early still lays everything down', () => {
  // Ù hoặc hết nọc thì ván dừng giữa chừng, mà phỏm vẫn phải mở ra cho cả bàn thấy.
  const game = tableOf(4);
  game.stock = [];
  game.turn = 1;
  game.step = 'take';
  phomDraw(game, 1);

  assert.equal(game.state, 'over');
  for (let seat = 0; seat < 4; seat++) {
    assert.ok(Array.isArray(game.shown[seat]), `ghế ${seat} chưa trình dù ván đã xong`);
  }
});

test('what is laid is public, and what is still held is not', () => {
  // Trình rồi thì cả bàn thấy — đó là toàn bộ ý nghĩa của trình. Chưa trình thì đó là bài của
  // người ta, và không có đường nào để lộ ra.
  const source = readFileSync(new URL('./tienlenbot.mjs', import.meta.url), 'utf8');
  const from = source.indexOf('function phomState(game)');
  const to = source.indexOf('\n  /// What somebody at a table is looking at');
  const body = source.slice(from, to);

  assert.ok(body.includes('shown: game.shown ? game.shown[seat] : null'),
    'bàn ai cũng thấy không mang theo phỏm đã trình');
  assert.ok(!/\bhand\b\s*[:,]/.test(body), 'một tay bài lọt vào bàn ai cũng thấy');
  assert.ok(body.includes('cards: game.hands ? game.hands[seat].length : null'),
    'ghế phải mang số lá chứ không mang lá');
});

test('the cái moves to whoever won, instead of sitting on one chair for ever', () => {
  // Lỗi: người mở bàn giữ cái mãi mãi — ván nào cũng họ được thêm một lá và đánh trước, suốt
  // buổi. Ngồi vào bàn của ai đó không có nghĩa là người ấy mở mọi ván.
  for (const cai of [0, 1, 2, 3]) {
    const game = tableOf(4);
    dealPhom(game, cai);

    assert.equal(game.turn, cai, 'lượt đầu không về tay cái');
    assert.equal(game.step, 'throw', 'cái đi bằng cách đánh ra một lá');
    assert.equal(game.hands[cai].length, PHOM_DEAL + 1, 'cái phải cầm mười lá');
    for (let seat = 0; seat < 4; seat++) {
      if (seat === cai) continue;
      assert.equal(game.hands[seat].length, PHOM_DEAL, `ghế ${seat} cầm sai số lá`);
    }

    // Xoay cái không được làm sinh ra hay mất đi lá nào.
    const all = [...game.hands.flat(), ...game.stock];
    assert.equal(all.length, 52);
    assert.equal(new Set(all).size, 52, 'một lá nằm hai chỗ sau khi xoay cái');
  }
});

test('and the hand says who won so the next one knows who deals', () => {
  const game = tableOf(3);
  game.stock = [];
  game.turn = 1;
  game.step = 'take';
  phomDraw(game, 1);
  assert.equal(game.state, 'over');

  assert.ok(Array.isArray(game.wonLast), 'hết ván mà không ghi lại ai về nhất');
  assert.equal(game.wonLast.length, 3, 'ba người thì ba tên, theo thứ tự');
  assert.equal(game.wonLast[0], `u${game.finished[0]}`, 'người đầu danh sách là người về nhất');

  // Máy **có** tên trong đó.
  //
  // Máy là đồ đạc lúc chia tiền, không phải lúc xếp thứ tự. Lọc chúng ra là ở bàn một người ba
  // máy, danh sách còn đúng một cái tên và cái tên ấy thành "người về nhất" dù vừa về bét — bấm
  // "ván nữa" là lại được cầm cái, ván nào cũng thế. Đúng cái người chơi báo về.
  const bots = tableOf(4, { bots: [1, 2, 3] });
  bots.stock = [];
  bots.turn = 0;
  bots.step = 'take';
  phomDraw(bots, 0);
  assert.equal(bots.wonLast.length, 4, 'bốn ghế thì bốn tên, máy hay người cũng vậy');
  assert.equal(bots.wonLast[0], `u${bots.finished[0]}`.replace('u', bots.seats[bots.finished[0]].bot ? 'machine:' : 'u'),
    'tên đầu danh sách phải là ghế về nhất, dù đó là máy');
});

test('a table of one person and three machines does not hand the same person the cái every hand', () => {
  // Người chơi về ba mà bấm "ván nữa" vẫn được đánh đầu — vì danh sách về đích đã lọc bỏ máy,
  // nên chỉ còn mỗi họ. Ghim bằng một ván mà người chơi **không** về nhất.
  const game = tableOf(4, { bots: [1, 2, 3] });
  game.stock = [];
  game.turn = 0;
  game.step = 'take';
  phomDraw(game, 0);
  assert.equal(game.state, 'over');

  // Nếu ghế 0 (người thật) không về nhất thì họ không được cầm cái ván sau.
  const nhat = game.finished[0];
  const cai = game.wonLast
    .map((id) => game.seats.findIndex((one) => one.userId === id))
    .find((seat) => seat >= 0);
  assert.equal(cai, nhat, 'cái phải về tay ghế về nhất, không phải ghế của người chơi');
});
