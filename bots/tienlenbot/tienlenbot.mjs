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
import { randomInt } from 'node:crypto';
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

// ---- luật, ở nơi luật sống --------------------------------------------------------------------
//
// Ba trò và một cái ví. Mỗi luật chơi là một file thuần, không biết gì về mạng, và cái file này
// chỉ còn lại phần nói chuyện với ứng dụng. Tái xuất hết ở đây vì hai lý do: mọi thứ bên dưới
// gọi thẳng như trước, và bộ test — vốn nhập từ `tienlenbot.mjs` — không phải đổi một dòng nào
// chỉ vì bài được dọn sang phòng khác.
export * from './rules/cards.mjs';
export * from './rules/tienlen.mjs';
export * from './rules/phom.mjs';
export * from './rules/baucua.mjs';
export * from './rules/taixiu.mjs';
export * from './economy.mjs';

import {
  RANKS, SUITS, TWO, rankOf, suitOf, nameOf, deck, deal, chance,
} from './rules/cards.mjs';
import {
  shapeOf, beats, isBomb, holdsAll, movesFrom, canAnswer, costOf, chooseMove,
  isChop, worthOf, rotting, instantWin, INSTANT,
  TURN_MS, REMATCH_MS, LOBBY_MS, THINK_MS, PLACES, placeName, MACHINES,
  nextInRound, nextActive, opensGame, stillIn, lowestElsewhere,
} from './rules/tienlen.mjs';
import {
  PHOM_DEAL, PHOM_TURNS, PHOM_THINK_MS, phomDeal, bestSplit, junkOf, isU, isMeld,
  canEat, eatOptions, phomChoose, phomDiscard, phomScores, phomSettle, points as phomPoints,
} from './rules/phom.mjs';
import {
  FACES, FACE_NAMES, DICE, ROLL_MS, SHOW_MS, HISTORY, BETTING_MS, CHIPS, WORLD,
  BAUCUA_SEATS, roll, faceWorth, boardWorth, staked, tally,
} from './rules/baucua.mjs';
import {
  TX_DOORS, TX_DOOR_NAMES, TX_PAYS, TX_SMALL, TX_BIG, TX_WORLD,
  TX_ROLL_MS, TX_SHOW_MS, TX_BETTING_MS, TX_HISTORY, TX_CHIPS,
  txRoll, txBoardWorth, txStaked, txOutcome,
} from './rules/taixiu.mjs';
import {
  STARTING_GOLD, DAILY_GOLD, BOT_STAKE, STAKES, MIN_STAKE, MAX_STAKE, asStake,
  ADS_MS, ADS_GOLD, ADS_PER_DAY, BROKE, payouts, dayIn, gold, settlement,
} from './economy.mjs';

// ---- two bowls, one set of machinery --------------------------------------------------------
//
// Bầu cua and tài xỉu are the same table with different mats: nobody takes turns, everybody
// stakes on the same three dice at once, a clock closes the board, and the throw pays every
// stake at the same instant. What actually differs between them is five things — what the doors
// are called, what a board on them is worth, how much is on it, how the dice are made, and how
// long each part of the round takes. So that is what this table holds, and everything below asks
// it rather than asking which game this is.
//
// Module scope on purpose. Everything inside `run` that would want this sits *below* the endless
// loop, where a `const` stays in the temporal dead zone for the life of the process.
const BOWLS = {
  baucua: {
    doors: FACES,
    worth: boardWorth,
    staked,
    roll,
    chips: CHIPS,
    history: HISTORY,
    betting: BETTING_MS,
    rolling: ROLL_MS,
    showing: SHOW_MS,
    // Where this bowl's run of throws is kept between deploys, in the ledger beside the gold.
    cau: 'cau',
  },
  taixiu: {
    doors: TX_DOORS,
    worth: txBoardWorth,
    staked: txStaked,
    roll: txRoll,
    chips: TX_CHIPS,
    history: TX_HISTORY,
    betting: TX_BETTING_MS,
    rolling: TX_ROLL_MS,
    showing: TX_SHOW_MS,
    cau: 'cauTx',
  },
};

/// Whether this table is one of the two bowls. Asked in a dozen places, and every one of them
/// used to name bầu cua — which is how a second dice game turns into a second copy of the bot.
const isDice = (game) => !!game && !!BOWLS[game.kind];

// ---- what the room is told ----------------------------------------------------------------

export const SAY = {
  greeting: (handle) => `Chào cả nhà. Gõ @${handle} để mở bàn: tiến lên miền nam, đánh phỏm, `
    + 'bầu cua tôm cá, hoặc tài xỉu.',
  // Which game, by name. A room can hold a table of each at once, and a line that only said
  // "mở bàn" would have somebody sitting down at phỏm expecting thirteen cards.
  opened: (who, size, stake, kind = 'tienlen') =>
    `${who} mở bàn ${kind === 'phom' ? 'phỏm' : 'tiến lên'} ${size} người `
    + `· cược ${gold(stake)} vàng.`,
  started: (names, kind = 'tienlen') =>
    `Bàn ${kind === 'phom' ? 'phỏm' : 'tiến lên'} đã bắt đầu: ${names.join(', ')}.`,
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
  pinned: 'Lá này nằm trong phỏm đã ăn — không đánh đi được.',
  notNow: 'Nước này không đi được lúc này.',
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

  // Chặt, and what it costs whoever is being cut.
  //
  // Paid the moment it lands rather than at the end, because that is when it happened and a
  // table that shows the money a minute later is a table nobody connects to the card.
  if (game.pile && isChop(shape, game.pile.shape)) chop(game, seat, game.pile);

  const played = new Set(cards);
  game.hands[seat] = game.hands[seat].filter((card) => !played.has(card));
  game.pile = { cards: [...cards].sort((a, b) => a - b), shape, seat };
  game.first = false;
  game.touched = Date.now();
  if (game.play) game.play.add(seat);
  // Everything that has gone face up in front of everybody. The machine is allowed this and
  // nothing else — it is what anybody sitting there has been watching all hand.
  if (game.seen) game.seen.push(...cards);

  if (!game.hands[seat].length) {
    game.finished.push(seat);
    // What they went out on. Needed at the end for đền: going out on a 2 that somebody at the
    // table could have cut is the one way to lose a hand you had already won.
    game.wonWith = [...cards];
  }

  // One person left holding cards is the end of it — there is nobody for them to beat.
  if (stillIn(game.hands) <= 1) { finish(game); return true; }

  advance(game, seat);
  return true;
}

/**
 * Somebody's bomb landing on somebody else's, and the money that moves.
 *
 * The pot is what the person now holding the pile stands to lose if they in turn are cut: what
 * they collected when they cut, plus what their own bomb is worth. So the ladder pays the way a
 * real table pays — every chặt takes the whole run of them, and whoever is cut last carries all
 * of it. Three chops deep, the first person is down what their 2 was worth and no more; it is
 * the middle two who bleed.
 *
 * Only between people. A machine neither collects nor pays — it does not at the end of the hand
 * either, and money that came out of furniture would be money made out of nothing.
 */
function chop(game, seat, pile) {
  const mine = game.seats[seat];
  const theirs = game.seats[pile.seat];
  if (!mine || !theirs || mine.bot || theirs.bot) return;
  if (game.seats.filter((one) => !one.bot).length < 2) return;

  const take = worthOf(pile.cards) + (game.pot ?? 0);
  if (!take) return;

  game.chops = game.chops ?? new Map();
  game.chops.set(mine.userId, (game.chops.get(mine.userId) ?? 0) + take);
  game.chops.set(theirs.userId, (game.chops.get(theirs.userId) ?? 0) - take);
  game.pot = take;
  game.chopped = [...(game.chopped ?? []), {
    by: mine.userId, byName: mine.displayName,
    from: theirs.userId, fromName: theirs.displayName,
    cards: [...pile.cards], take,
  }];
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
  // Nothing carries over to a fresh table. The pot is a thing about one pile.
  game.pot = 0;

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

  // Who leads the next one, if there is a next one.
  //
  // Read here, while `finished` still says — `startGame` clears it, and by the time a rematch
  // is asked for there is nothing left to ask. Kept as the whole order rather than just the
  // winner, because the winner is exactly the person most likely to take their money and go:
  // the next hand then starts from whoever came second and is still sitting there.
  // **Máy cũng tính.**
  //
  // Ở đây máy không phải đồ đạc. Chúng là đồ đạc lúc chia tiền — không thu, không trả — nhưng
  // lúc xếp thứ tự thì chúng ngồi ở bàn như mọi người. Lọc chúng ra khỏi danh sách này là ở bàn
  // một người với ba máy, danh sách chỉ còn đúng một cái tên, và cái tên ấy là "người về nhất"
  // dù họ vừa về bét. Người chơi bấm "ván nữa" và lại được đi đầu, ván nào cũng thế.
  game.wonLast = game.finished
    .filter((seat) => game.seats[seat])
    .map((seat) => game.seats[seat].userId);

  if (!isDice(game) && !game.blanche) reckon(game);
}

/**
 * What the end of the hand costs, beyond where everybody came.
 *
 * Two things, and neither can be known a card earlier: what is still in the losing hands, and
 * whether anybody has to answer for the whole table.
 *
 * All of it is between people only. At a table with one person in it the machines are
 * furniture — they do not pay for coming last and they do not pay for anything else either.
 */
export function reckon(game) {
  const people = game.seats.filter((one) => !one.bot);
  if (people.length < 2) return;

  const human = (seat) => game.seats[seat] && !game.seats[seat].bot;

  // Thối: what never got played, counted against whoever went out first.
  game.rot = new Map();
  game.hands.forEach((hand, seat) => {
    if (!hand.length || !human(seat)) return;
    const worth = rotting(hand);
    if (worth) game.rot.set(game.seats[seat].userId, worth);
  });

  // Cóng: a whole hand and not one card played. They pay the table's placing money for
  // everybody, which is the whole of the penalty and the reason nobody sits one out.
  //
  // Two people cóng and nobody đền. Both of them lost by not playing; making one of them pay
  // for the other as well is an arithmetic that only ever reads as a fault.
  const cold = game.seats
    .map((one, seat) => seat)
    .filter((seat) => human(seat) && !game.play.has(seat) && !game.left.has(seat));
  if (cold.length === 1) { game.owes = game.seats[cold[0]].userId; game.owesWhy = 'cóng'; return; }
  if (cold.length > 1) return;

  // Ôm hàng không chặt: the hand was won on a 2 that somebody sitting there could have cut and
  // did not. Having the bomb and keeping it is a choice, and this is what the choice costs.
  //
  // Only when exactly one person could have. With two of them there is no one to point at, and
  // a penalty that lands on whoever happens to sit lower is worse than no penalty.
  const won = game.wonWith && shapeOf(game.wonWith);
  if (!won || rankOf(won.top) !== TWO) return;

  const holding = game.hands
    .map((hand, seat) => ({ hand, seat }))
    .filter(({ hand, seat }) => hand.length && human(seat) && !game.left.has(seat))
    .filter(({ hand }) => movesFrom(hand).some((move) => isChop(move.shape, won)
      && beats(move.shape, won)));

  if (holding.length === 1) {
    game.owes = game.seats[holding[0].seat].userId;
    game.owesWhy = 'ôm hàng';
  }
}

// ---- phỏm, as functions with no opinions about chat -------------------------------------------
//
// Same shape as the tiến lên machine above and for the same reason: every one of these takes a
// table from one legal position to the next, and none of it can be checked by looking at a
// screen. A turn here is two halves — take a card, then throw one — and the half a table is in
// is the thing most easily got wrong.

/**
 * Deals a phỏm hand. The cái holds ten and starts by throwing one away.
 *
 * **Who the cái is moves.** It was always seat zero, which is whoever opened the table — so the
 * same person got the extra card and the first throw every hand, for ever. At a real table the
 * cái passes: whoever won the last hand takes it. Sitting down at somebody's table should not
 * mean they open every hand of the evening.
 */
export function dealPhom(game, cai = 0) {
  const { hands, stock } = phomDeal(game.seats.length);
  // `phomDeal` puts the ten-card hand first; turn the ring so it lands on the cái.
  const many = hands.length;
  game.hands = hands.map((_, seat) => hands[(seat - cai + many) % many]);
  game.stock = stock;
  game.table = null;
  game.tableFrom = null;
  game.pile = null;
  game.discards = [];
  game.took = game.seats.map(() => 0);
  game.eaten = game.seats.map(() => []);
  // Bộ đã ăn, khoá lại. Ăn được là vì lá ấy vào phỏm, nên phỏm ấy phải đứng: không rút ruột nó
  // để ăn tiếp, và không đánh lá của nó đi.
  game.melded = game.seats.map(() => []);
  // Phỏm đã trình, của từng ghế. `null` là chưa tới lượt trình.
  game.shown = game.seats.map(() => null);
  game.fed = game.seats.map(() => game.seats.map(() => 0));
  game.laid = [];
  game.u = null;
  game.uWith = null;
  game.owes = null;
  game.owesWhy = null;
  game.scores = null;
  game.turn = cai;
  // The cái already has their card for this turn — it was dealt to them.
  game.step = 'throw';
  game.state = 'playing';
  game.touched = Date.now();
}

/// Takes the card the player before threw, if it makes a phỏm on the spot.
export function phomEat(game, seat) {
  if (game.step !== 'take' || game.turn !== seat) return false;
  if (game.table === null) return false;

  const locked = game.melded[seat] ?? [];
  const ways = eatOptions(game.hands[seat], game.table, locked);
  if (!ways.length) return false;

  // Ăn vào bộ nào, khi có nhiều cách. Chọn cách để lại ít điểm rác nhất — không có nước nào để
  // chơi sai ở đây, nên hỏi là bắt người ta bấm thêm một lần để đồng ý với câu trả lời duy nhất.
  const card = game.table;
  const held = [...game.hands[seat], card];
  let meld = ways[0];
  let least = Infinity;
  for (const way of ways) {
    const junk = junkOf(held, [...locked, way]);
    if (junk < least) { least = junk; meld = way; }
  }

  const from = game.tableFrom;
  game.hands[seat] = held.sort((a, b) => a - b);
  game.eaten[seat].push(card);
  game.melded[seat] = [...locked, [...meld].sort((a, b) => a - b)];
  // Who has been feeding whom. Three times to the same person and the hand is on them.
  if (from !== null && from !== seat) game.fed[from][seat]++;
  game.table = null;
  game.tableFrom = null;
  game.step = 'throw';
  game.touched = Date.now();

  phomCheckU(game, seat, from);
  return true;
}

/// Takes the top of the nọc. The nọc running dry ends the hand where it stands.
export function phomDraw(game, seat) {
  if (game.step !== 'take' || game.turn !== seat) return false;
  if (!game.stock.length) { phomEnd(game); return true; }

  const card = game.stock.shift();
  game.hands[seat] = [...game.hands[seat], card].sort((a, b) => a - b);
  // The card nobody was offered is nobody's fault, so a ù off the nọc owes nothing to anybody.
  game.table = null;
  game.tableFrom = null;
  game.step = 'throw';
  game.touched = Date.now();

  phomCheckU(game, seat, null);
  return true;
}

/// Ù, which stops the hand where it is. `from` is whoever's card it was, if it was anybody's.
function phomCheckU(game, seat, from) {
  if (!isU(game.hands[seat], game.melded[seat] ?? [])) return;
  game.u = game.seats[seat].userId;
  game.uWith = [...game.hands[seat]];
  game.laid = [seat];
  // Đền: the card that made it was thrown by somebody, and throwing the card somebody ù's on is
  // the one mistake in phỏm that costs the whole hand rather than a few points.
  if (from !== null && from !== undefined && from !== seat
    && !game.seats[from].bot && !game.seats[seat].bot) {
    game.owes = game.seats[from].userId;
    game.owesWhy = 'nhả bài ù';
  }
  phomEnd(game);
}

/// Throws a card away, which is the other half of a turn and the end of it.
export function phomThrow(game, seat, card) {
  if (game.step !== 'throw' || game.turn !== seat) return false;
  if (!game.hands[seat].includes(card)) return false;
  // Lá trong một bộ đã ăn thì không đánh đi được. Ở bàn thật nó nằm ngửa trước mặt và không ai
  // với tới; ở đây phải nói ra thành luật.
  if ((game.melded[seat] ?? []).some((meld) => meld.includes(card))) return false;

  game.hands[seat] = game.hands[seat].filter((one) => one !== card);
  game.table = card;
  game.tableFrom = seat;
  game.discards.push({ seat, card });
  game.took[seat]++;
  game.touched = Date.now();

  // Trình.
  //
  // Luật: *trước khi đánh ở vòng bốn, người chơi trình tất cả phỏm mình có cho mọi người biết.*
  // Không phải lúc ăn — ăn thì chỉ lá vừa ăn là công khai, còn hai lá kia vẫn nằm trên tay — mà
  // đúng ở lượt cuối, và trình xong thì cả bàn nhìn thấy.
  //
  // Đây là thứ làm nên nửa sau của một ván phỏm: người đi sau biết trên bàn đang có những phỏm
  // nào, biết lá rác của mình gửi được vào đâu, và biết lá nào nhả ra là an toàn. Một ván mà
  // phỏm chỉ hiện lúc tính điểm là một ván đã bỏ mất đoạn ấy.
  if (game.took[seat] >= PHOM_TURNS && !game.shown[seat]) {
    const laid = bestSplit(game.hands[seat], game.melded[seat] ?? []).melds;
    game.shown[seat] = laid;
    // Ai trình trước, theo đúng thứ tự trình — bằng điểm thì ai trình sau thua, nên thứ tự này
    // là một phần của luật chứ không phải để trang trí.
    if (laid.length) game.laid.push(seat);
  }

  // Everybody has had their four. The last card thrown is the chốt and nobody answers it.
  if (game.took.every((many) => many >= PHOM_TURNS)) { phomEnd(game); return true; }

  game.turn = (seat + 1) % game.seats.length;
  game.step = 'take';
  return true;
}

/**
 * The end of the hand: lay down, send what fits, and count what is left.
 *
 * Sending is worked out here rather than asked for. A player who has laid a phỏm may push their
 * leftovers onto anybody's — it is never a choice worth making badly, and a screen that asked
 * would be asking somebody to click four times to agree with the only sensible answer.
 */
export function phomEnd(game) {
  if (game.state === 'over') return;

  // Ai chưa kịp trình thì trình nốt ở đây — ván có thể dừng giữa chừng vì có người ù hoặc vì
  // hết nọc, và lúc ấy phỏm vẫn phải mở ra cho cả bàn thấy.
  for (let seat = 0; seat < game.seats.length; seat++) {
    if (game.shown[seat]) continue;
    const laid = bestSplit(game.hands[seat], game.melded[seat] ?? []).melds;
    game.shown[seat] = laid;
    if (laid.length && !game.laid.includes(seat)) game.laid.push(seat);
  }

  game.scores = phomScores(game.hands, { laid: game.laid, locked: game.melded });

  // Đền: three of somebody's cards eaten by the same person. Their hand, their bill.
  if (!game.owes) {
    for (let from = 0; from < game.seats.length; from++) {
      if (game.seats[from].bot) continue;
      for (let to = 0; to < game.seats.length; to++) {
        if (from === to || game.seats[to].bot) continue;
        if (game.fed[from][to] >= 3) {
          game.owes = game.seats[from].userId;
          game.owesWhy = 'cho ăn ba lần';
        }
      }
    }
  }

  // The order the table came in, for the screen that reads it out.
  game.finished = [...game.scores]
    .sort((a, b) => a.points - b.points || a.laidAt - b.laidAt)
    .map((one) => one.seat);
  if (game.u !== null) {
    const won = game.seats.findIndex((one) => one.userId === game.u);
    if (won >= 0) game.finished = [won, ...game.finished.filter((seat) => seat !== won)];
  }

  // Ai làm cái ván sau. Đọc ở đây, lúc `finished` còn nói — `dealPhom` xoá nó đi, và tới lúc
  // có người bấm "ván nữa" thì không còn gì để hỏi. Giữ nguyên thứ tự chứ không chỉ giữ người
  // đầu, vì người về nhất chính là người dễ cầm tiền đi về nhất.
  // **Máy cũng tính.**
  //
  // Ở đây máy không phải đồ đạc. Chúng là đồ đạc lúc chia tiền — không thu, không trả — nhưng
  // lúc xếp thứ tự thì chúng ngồi ở bàn như mọi người. Lọc chúng ra khỏi danh sách này là ở bàn
  // một người với ba máy, danh sách chỉ còn đúng một cái tên, và cái tên ấy là "người về nhất"
  // dù họ vừa về bét. Người chơi bấm "ván nữa" và lại được đi đầu, ván nào cũng thế.
  game.wonLast = game.finished
    .filter((seat) => game.seats[seat])
    .map((seat) => game.seats[seat].userId);

  game.state = 'over';
  game.turn = null;
  game.step = null;
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
    commands: [{
      command: 'tienlen',
      description: 'Mở bàn: tiến lên, phỏm, bầu cua hay tài xỉu',
    }],
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
      // The world bowl's run of throws. On disk with the gold rather than in memory with the
      // tables: the bowl is permanent and a deploy takes minutes, but a soi cầu board that
      // starts again empty every deploy is a board nobody can use — the whole point of it is
      // that it reaches further back than the session looking at it.
      kept.cau = Array.isArray(kept.cau) ? kept.cau.slice(0, HISTORY) : [];
      // And the tài xỉu one, which is its own run and its own length. Two bowls, two boards:
      // pouring one into the other would be reading somebody else's game as this one's cầu.
      kept.cauTx = Array.isArray(kept.cauTx) ? kept.cauTx.slice(0, TX_HISTORY) : [];
      return kept;
    } catch {
      // No file yet, or one somebody edited into nonsense. An empty ledger is the honest
      // starting point — refusing to run because a scoreboard is missing would take the games
      // down with it.
      return { people: {}, offset: 0, greeted: {}, cau: [], cauTx: [] };
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
  /**
   * Pays a phỏm hand.
   *
   * Its own function rather than a branch inside `settle`, because the two games arrive at a
   * number completely differently — one by where people came, one by what is left in their
   * hands — and the only thing they share is the ledger they write into. That part is here.
   */
  function settlePhom(game) {
    if (!game.scores) return;

    const owed = phomSettle(game.seats, game.scores, game.solo ? BOT_STAKE : game.stake, {
      u: game.u,
      owes: game.owes,
    });

    for (const one of owed) {
      const already = game.paidTo.get(one.userId) ?? 0;
      let moving = one.change - already;
      if (moving) {
        const row = rowFor(one.userId, one.displayName);
        if (moving < 0) moving = -Math.min(-moving, row.gold);
        row.gold += moving;
        game.paidTo.set(one.userId, already + moving);
        one.change = already + moving;
        saveScores();
      } else {
        one.change = already;
      }
      // The place a phỏm hand came in, in the words the rest of the bot uses.
      one.place = placeName(one.place, one.of);
    }

    if (!game.counted) {
      game.counted = true;
      for (const one of owed) {
        const row = rowFor(one.userId, one.displayName);
        row.games++;
        if (one.place === PLACES[0]) row.first++;
        if (one.place === 'Bét') row.last++;
      }
      saveScores();
    }

    game.paid = owed;
  }

  function settle(game) {
    if (game.kind === 'phom') return settlePhom(game);

    const owed = settlement(game.seats, game.finished, game.stake, {
      chops: game.chops,
      rot: game.rot,
      blanche: game.blanche,
      owes: game.owes,
    });

    for (const one of owed) {
      // What has already moved, and what still has to.
      //
      // Paid by difference rather than once, because a hand pays in instalments now: going out
      // first is paid the moment it happens, a chặt the moment it lands, and thối and đền only
      // once the last hand is down. Paying once meant the first instalment was the only one —
      // and it meant a row that started at nothing stayed at nothing for the rest of the hand.
      const already = game.paidTo.get(one.userId) ?? 0;
      let moving = one.change - already;
      if (!moving) { one.change = already; continue; }

      const row = rowFor(one.userId, one.displayName);
      // The backstop for the seam between taking the stake at the door and paying at the end:
      // somebody who sat down with enough and then lost it at another table.
      if (moving < 0) moving = -Math.min(-moving, row.gold);
      row.gold += moving;

      // Counted once a table, however many instalments it takes to pay it.
      game.paidTo.set(one.userId, already + moving);
      one.change = already + moving;
      saveScores();
    }

    // The record of who has played and won: written when the table is done, not on the way.
    if (game.state === 'over' && !game.counted) {
      game.counted = true;
      for (const one of owed) {
        if (!one.place) continue;
        const row = rowFor(one.userId, one.displayName);
        row.games++;
        if (one.place === PLACES[0]) row.first++;
        if (one.place === 'Bét') row.last++;
      }
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
      // A bowl is open for as long as it is running: there is no hand in progress to wait out,
      // only the next throw.
      || (isDice(game) && game.state !== 'over'))
      // Never the world bowls. Nobody opened them, there is nowhere to be invited from, and
      // they have a door of their own on the first screen — a line on the list saying "vào"
      // beside a table that is simply always there is a line that teaches the wrong thing
      // about it.
      && !game.world && !game.solo && game.seats.length < game.size)
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

    // A bowl takes anybody at any moment: there is no hand in progress to wait out, only the
    // next throw, and somebody who sits down mid-throw simply bets on the one after.
    const midRound = isDice(game) && game.state !== 'over';

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
    if (isDice(game)) {
      if (game.state === 'lobby') {
        openBets(game);
      } else if (game.state === 'betting' && !game.bettingEndsAt && game.seats.length > 1) {
        // A second person is somebody to wait for, so the clock starts. Only the clock: this
        // used to re-open the board, which swept every chip anybody had already put down —
        // arriving at a table and clearing it is not arriving at a table.
        game.bettingEndsAt = Date.now() + BOWLS[game.kind].betting;
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
        openBets(table);

        await pushTo(screen);
        await pushLobbies();
        return;
      }

      // Tài xỉu, and it is one answer rather than two: there is **one** table, it is the whole
      // world's, and nobody opens it. No private bowl and no machines — three dice under a bát
      // with nobody else at the table is a number appearing, and the half of this game that is
      // worth anything is the twenty other people staking on the same throw.
      if (action.taixiu) {
        if (goldOf(who.userId) < TX_CHIPS[0]) {
          return pushTo(screen, { says: SAY.tooPoor(TX_CHIPS[0]) });
        }

        const bowl = worldTaixiu();
        screen.gameId = bowl.id;
        seatWatchers(bowl);
        await pushGame(bowl);
        keepRolling(bowl).catch((problem) => console.error(String(problem)));
        return;
      }

      // A table for either card game. Which one it is rides on the action, and everything after
      // that — the seats, the stake, the room's one line, the world list — is the same for both.
      const cards = action.phom !== undefined || action.phomSolo !== undefined ? 'phom' : 'tienlen';
      const opened = cards === 'phom' ? action.phom : action.open;
      const alone = cards === 'phom' ? action.phomSolo : action.solo;

      if (opened === undefined && alone === undefined) return;

      const asked = Number(opened ?? alone);
      if (![2, 3, 4].includes(asked)) return;

      if (alone !== undefined) {
        if (goldOf(who.userId) < BOT_STAKE) return pushTo(screen, { says: SAY.tooPoor(BOT_STAKE) });

        const table = newGame(screen, asked, BOT_STAKE, cards);
        table.solo = true;
        screen.gameId = table.id;
        fillMachines(table);
        await startGame(table);
        await pushLobbies();
        return;
      }

      const stake = asStake(action.stake);
      if (goldOf(who.userId) < stake) return pushTo(screen, { says: SAY.tooPoor(stake) });

      const table = newGame(screen, asked, stake, cards);
      table.state = 'lobby';
      screen.gameId = table.id;

      // To the room it was opened from, and not to the person who opened it. They know they
      // asked — the table in front of them says so — and a button offering them the seat they
      // are already holding is a button that cannot do anything. Everybody else finds it in the
      // world list, whichever group they are in.
      const invitation = await send(
        table.conversationId, SAY.opened(who.displayName, asked, stake, cards), JOIN(table.id),
        null, [who.userId]);
      table.invitationId = invitation?.id ?? null;

      await pushTo(screen);
      await pushLobbies();
      return;
    }

    const host = game.host.userId === who.userId;

    if (isDice(game)) {
      // At a world bowl the chair is having it open, so somebody acting on it is somebody at
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
      // Only at a private table. A world bowl runs on its own clock and a button that hurried
      // it along would be one person deciding for everybody else at it.
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

    if (game.kind === 'phom') {
      if (game.state !== 'playing' || seat === null || game.turn !== seat) return;

      let moved = false;
      if (action.eat) moved = phomEat(game, seat);
      else if (action.draw) moved = phomDraw(game, seat);
      else if (Number.isInteger(action.throw)) moved = phomThrow(game, seat, action.throw);

      // Từ chối thì nói ra.
      //
      // Im lặng bỏ qua là cái bàn đứng im và không ai hiểu vì sao — trang đang mở có thể là bản
      // cũ, hoặc vừa lỡ nhịp, và lúc ấy thứ duy nhất người ta thấy là một nút bấm không ăn.
      // Lý do hay gặp nhất là đánh một lá đang nằm trong bộ đã ăn.
      if (!moved) {
        const stuck = Number.isInteger(action.throw)
          && (game.melded[seat] ?? []).some((meld) => meld.includes(action.throw));
        await pushTo(screen, {
          says: stuck ? SAY.pinned : SAY.notNow,
        });
        return;
      }

      if (game.state === 'over') settle(game);
      await pushGame(game);
      await maybeBotTurn(game);
      return;
    }

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
      // Bầu cua: what everybody has on the board this round, and what came up. The count starts
      // at one so that no two throws are ever named the same — see `worldBowl`.
      round: 1,
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

    if (game.kind === 'phom') {
      game.paidTo = new Map();
      game.paid = [];
      game.counted = false;
      game.finished = [];
      game.left = new Set();
      game.ready = new Set();
      // Người về nhất ván trước làm cái. Họ về nhà rồi thì lùi xuống người về nhì; không còn
      // ai thì mới quay lại ghế đầu bàn.
      const cai = (game.wonLast ?? [])
        .map((userId) => game.seats.findIndex((one) => one.userId === userId))
        .find((seat) => seat >= 0);
      dealPhom(game, cai ?? 0);
      if (game.invitationId) {
        await edit(game.invitationId,
          SAY.started(game.seats.map((one) => one.displayName), game.kind), WATCH(game.id), []);
      }
      await pushGame(game);
      await maybeBotTurn(game);
      return;
    }

    game.hands = deal(game.seats.length);

    game.pile = null;
    game.passed = new Set();
    game.finished = [];
    game.left = new Set();
    game.ready = new Set();
    game.paidTo = new Map();
    game.paid = [];
    game.counted = false;
    game.play = new Set();
    game.seen = [];
    game.chops = new Map();
    game.chopped = [];
    game.pot = 0;
    game.rot = null;
    game.owes = null;
    game.owesWhy = null;
    game.blanche = null;
    game.blancheWith = null;
    game.wonWith = null;
    game.state = 'playing';
    game.touched = Date.now();

    // Tới trắng: a hand that has won before anybody has played a card.
    //
    // Only at a table with two people in it. At a table of one the machines are furniture and
    // pay for nothing — and a hand that hands out three stakes a machine never had would be a
    // way of making gold by dealing again until the deal is good.
    const people = game.seats.filter((one) => !one.bot);
    if (people.length >= 2) {
      const white = game.hands
        .map((hand, seat) => ({ seat, what: instantWin(hand) }))
        .find(({ seat, what }) => what && !game.seats[seat].bot);
      if (white) {
        game.blanche = game.seats[white.seat].userId;
        game.blancheWith = white.what;
        game.finished = [white.seat];
        game.turn = null;
        game.first = false;
        game.opensWith = null;
        finish(game);
        settle(game);
        await pushGame(game);
        return;
      }
    }

    // Who leads.
    //
    // The three of spades opens the *first* hand of a table and nothing after it: from then on
    // it is whoever won the last one, which is the rule everybody plays and the one this bot
    // was quietly not playing. Kept as a user id rather than a seat, because a rematch drops
    // whoever went home and every seat below them shifts up by one.
    const won = (game.wonLast ?? [])
      .map((userId) => game.seats.findIndex((one) => one.userId === userId))
      .find((seat) => seat >= 0);
    if (won !== undefined) {
      game.turn = won;
      game.first = false;
      game.opensWith = null;
    } else {
      const opening = opensGame(game.hands);
      game.turn = opening.seat;
      game.opensWith = opening.card;
      game.first = true;
    }

    if (game.invitationId) {
      // Shown to everybody again, the host included. It was hidden from them while it was an
      // offer they could not take; now it is the room's note of a game they are playing in.
      await edit(game.invitationId,
        SAY.started(game.seats.map((one) => one.displayName), game.kind), WATCH(game.id), []);
    }

    await pushGame(game);
    await maybeBotTurn(game);
  }

  // ---- the two bowls ------------------------------------------------------------------------

  /**
   * A bowl the whole world is at, made the first time somebody walks in on it.
   *
   * Not a table anybody opens. It exists, it keeps throwing, and walking in is walking in on a
   * game already going — which is what a sòng is. A table somebody has to open first is a table
   * that is shut most of the time, and a world table that is shut most of the time is a room
   * with nobody in it.
   *
   * Made once and never swept. It has no room, no host and no invitation: there is nowhere to
   * post one, because it does not belong to a group.
   */
  function worldBowl(id, kind, host, stake, history) {
    let bowl = games.get(id);
    if (bowl) return bowl;

    bowl = {
      id,
      kind,
      world: true,
      conversationId: null,
      state: 'betting',
      host,
      size: 999,
      stake,
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
      // Which throw this is. Counted from **one and not from nothing**, and that is not a
      // cosmetic choice: a bowl made without it sent `round ?? 1` for its whole first window,
      // and then `openBets` counted `0 + 1` and sent 1 again for the second. Two throws running
      // carried the same name — so the page, which remembers "I have already lifted the lid on
      // round 1", did not put a lid on the second one at all. Nặn worked once and then stopped,
      // at both bowls, and nothing anywhere said why.
      round: 1,
      history,
      // A clock from the moment it exists, not from the moment the throwing loop gets round to
      // starting one. The first push otherwise carries a bowl with no clock on it, and whoever
      // walked in reads that as a table waiting for somebody — which is the one thing a world
      // bowl never is.
      bettingEndsAt: Date.now() + BOWLS[kind].betting,
      invitationId: null,
      touched: Date.now(),
    };
    games.set(id, bowl);
    return bowl;
  }

  /// The one bầu cua sòng everybody in the world is at.
  function worldSong() {
    return worldBowl(WORLD, 'baucua',
      { userId: null, displayName: 'Sòng thế giới' }, CHIPS[0], scores.cau ?? []);
  }

  /**
   * The one tài xỉu table everybody in the world is at, and the only one there is.
   *
   * Bầu cua has a private bowl beside its sòng; this has none, and that is a decision rather
   * than a thing not written yet. A private bầu cua bowl is still a game — six faces, three
   * dice, and a mat somebody is reading. Tài xỉu alone is one number appearing every half
   * minute: there is no mat to read and no run to watch, because the run of throws only means
   * anything against everybody else's money. The whole of it is the twenty people staking on
   * the same bát, so it is that or it is nothing.
   */
  function worldTaixiu() {
    return worldBowl(TX_WORLD, 'taixiu',
      { userId: null, displayName: 'Sòng tài xỉu' }, TX_CHIPS[0], scores.cauTx ?? []);
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
        const owed = Object.keys(game.bets).some((id) => onBoard(game, id) > 0);
        if (!watchersOf(game).length && !owed) {
          game.bettingEndsAt = null;
          return;
        }
        if (game.state !== 'betting') return;

        if (!game.bettingEndsAt) {
          game.bettingEndsAt = Date.now() + BOWLS[game.kind].betting;
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

  /// How much of it there is. Counted through the bowl's own doors, because a bầu cua board adds
  /// up six faces and a tài xỉu board adds up five doors, and counting one with the other's list
  /// quietly reads every stake as nothing.
  function onBoard(game, userId) {
    return BOWLS[game.kind].staked(betsOf(game, userId));
  }

  /// Opens the board. A table with more than one person at it takes bets on a clock, because
  /// somebody has to be waited for; alone, the throw happens when the one person says so.
  function openBets(game) {
    game.state = 'betting';
    // Counted up, and the whole reason it exists: the page keeps the result covered until
    // somebody lifts the plate, and it needs a name for the round it has already lifted.
    game.round = (game.round ?? 0) + 1;
    game.dice = null;
    game.paid = [];
    game.bets = {};
    game.betAt = {};
    game.touched = Date.now();
    // A world bowl always has a clock: it is a table that keeps throwing whether or not anybody
    // in particular is at it. A private one only needs a clock when there is somebody to be
    // waited for.
    game.bettingEndsAt = game.world || game.seats.length > 1
      ? Date.now() + BOWLS[game.kind].betting
      : null;
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

    // Everything here came from a page anybody can edit — the doors included. A tài xỉu board
    // arriving with `cua` on it is a page that is not the page this bot ships.
    const doors = BOWLS[game.kind].doors;
    const bets = {};
    let total = 0;
    for (const [face, amount] of Object.entries(asked ?? {})) {
      if (!doors.includes(face)) return;
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

    // A throw with nothing on the board is a throw nobody asked for — at a private table. A
    // world bowl throws anyway, because somebody walking in should find a game already running
    // rather than a bowl waiting for them to start it.
    const anything = Object.keys(game.bets).some((id) => onBoard(game, id) > 0);
    if (!anything && !game.world) return;

    const rules = BOWLS[game.kind];

    game.spinning = true;
    try {
      game.state = 'rolling';
      game.bettingEndsAt = null;
      game.touched = Date.now();
      await pushGame(game);

      await wait(rules.rolling);
      if (game.state !== 'rolling') return;

      game.dice = rules.roll();
      game.history = [game.dice, ...(game.history ?? [])].slice(0, rules.history);
      // Only a world bowl is kept, and each keeps its own run. A private bowl belongs to one
      // person for as long as they have it open, and its throws go when they close it, the same
      // as the bowl does.
      if (game.world) { scores[rules.cau] = game.history; saveScores(); }
      payBowl(game);
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

      await wait(rules.showing);
      if (game.state !== 'paid') return;

      openBets(game);
      await pushGame(game);
    } finally {
      game.spinning = false;
    }
  }

  /// Pays the board out, one person at a time.
  function payBowl(game) {
    game.paid = [];
    const rules = BOWLS[game.kind];

    // From what is on the board, not from who is sitting at it. Somebody who put money down and
    // then closed the widget still had money down, and the dice do not care who is watching.
    for (const userId of Object.keys(game.bets)) {
      const bets = betsOf(game, userId);
      const on = rules.staked(bets);
      if (!on) continue;

      const row = rowFor(userId);
      const who = { userId, displayName: row.name || 'Ai đó' };
      const worth = rules.worth(bets, game.dice);
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

        if (game.kind === 'phom') {
          await wait(PHOM_THINK_MS);
          if (game.state !== 'playing' || game.turn !== seat) return;

          if (game.step === 'take') {
            const late = game.took.every((many) => many >= PHOM_TURNS - 1);
            const taking = phomChoose(game.hands[seat], game.table,
              { late, locked: game.melded[seat] ?? [] });
            if (taking) phomEat(game, seat); else phomDraw(game, seat);

            // Shown before it throws. Taking and throwing in one tick is a hand that grows and
            // shrinks inside one frame — nobody sees what was taken, and the card that lands on
            // the bãi looks like it came from nowhere.
            if (game.state === 'playing') {
              await pushGame(game);
              await wait(PHOM_THINK_MS);
              if (game.state !== 'playing' || game.turn !== seat) return;
            }
          }
          // Eating can end the hand — ù stops it where it stands — so the throw is asked for
          // again rather than assumed.
          if (game.state === 'playing' && game.step === 'throw' && game.turn === seat) {
            const after = (seat + 1) % game.seats.length;
            phomThrow(game, seat, phomDiscard(game.hands[seat], {
              theirEaten: game.eaten[after] ?? [],
              theirDiscarded: game.discards.filter((one) => one.seat === after).map((one) => one.card),
              locked: game.melded[seat] ?? [],
            }));
          }
          if (game.state === 'over') settle(game);
          await pushGame(game);
          continue;
        }

        await wait(THINK_MS);
        // Something may have moved while it thought — a person left, the table ended, the sweep
        // took the turn. Whatever it worked out is about a table that is no longer this one.
        if (game.state !== 'playing' || game.turn !== seat) return;

        const cards = chooseMove(game.hands[seat], game.pile?.shape ?? null, {
          lowest: lowestElsewhere(game.hands, seat),
          mustInclude: game.first ? game.opensWith : null,
          seen: game.seen,
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

  /**
   * What somebody at the tài xỉu table is looking at. Their own board is added by `pushTo`.
   *
   * The throw is sent **worked out** — the total, whether it was bão, and which doors it paid —
   * rather than as three numbers the page adds up. Not to save the page the arithmetic: so that
   * the bot is the only thing in the world that decides what a throw was worth. A widget that
   * worked out its own totals is a widget that could be edited into working out better ones.
   *
   * All of it goes out the moment the dice land, before anybody has lifted the bát — exactly as
   * bầu cua sends the dice under the plate. What keeps it a secret is not the wire; it is that
   * the page holds the whole result back until the nặn is done, the purse included.
   */
  function taixiuState(game) {
    const outcome = game.dice ? txOutcome(game.dice) : null;

    return {
      phase: game.state,
      kind: 'taixiu',
      gameId: game.id,
      size: game.size,
      solo: false,
      world: true,
      host: game.host.userId,
      hostName: game.host.displayName,

      doors: TX_DOORS,
      doorNames: TX_DOOR_NAMES,
      // What each door pays on top of the stake, so the mat can say it rather than the page
      // knowing it. One place decides the odds and it is this one.
      pays: TX_PAYS,
      small: TX_SMALL,
      big: TX_BIG,
      chips: TX_CHIPS,

      dice: game.dice,
      total: outcome ? outcome.total : null,
      bao: outcome ? outcome.bao : false,
      // Every door this throw paid. On a bão that is bão alone — which is the rule that catches
      // everybody once, so the mat has to be able to show it rather than explain it.
      won: outcome ? outcome.won : [],
      round: game.round ?? 1,
      history: game.history ?? [],

      board: game.seats.reduce((total, one) => {
        const bets = betsOf(game, one.userId);
        for (const door of TX_DOORS) total[door] = (total[door] ?? 0) + (bets[door] ?? 0);
        return total;
      }, {}),

      seats: game.seats.map((one) => ({
        id: one.userId,
        name: one.displayName,
        staked: txStaked(betsOf(game, one.userId)),
        change: (game.paid.find((p) => p.userId === one.userId) ?? {}).change ?? null,
      })),

      bettingEndsAt: game.state === 'betting' ? game.bettingEndsAt : null,
      rollMs: TX_ROLL_MS,
      paid: game.paid,
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
      // Which throw this is, so a page can tell the plate it has lifted from the next one.
      round: game.round ?? 1,
      // What has come up lately, newest first.
      history: game.history ?? [],
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

  /**
   * A phỏm table as everybody at it sees it.
   *
   * Card counts, never cards — the same line the tiến lên table holds. What is different is
   * that phỏm has a card face up in the middle that everybody is allowed to want: the one just
   * thrown. That one is in here by name, because whether you can take it is the whole of the
   * decision in front of the person whose turn it is.
   */
  function phomState(game) {
    const paid = game.paid ?? [];
    const owed = new Map(paid.map((one) => [one.userId, one.change]));
    const scores = game.scores ?? [];
    // Everybody at it, machines included. This names the places on the *table*, which is a list
    // of every chair; what each person is paid for their place is named separately, out of the
    // number of people actually being paid. Counting humans here gave a table of one person and
    // three machines two seats called Bét.
    const people = game.seats.length;

    return {
      phase: game.state,
      kind: 'phom',
      gameId: game.id,
      size: game.size,
      stake: game.stake,
      solo: !!game.solo,
      host: game.host.userId,
      hostName: game.host.displayName,

      seats: game.seats.map((one, seat) => {
        const score = scores.find((row) => row.seat === seat);
        return {
          seat,
          id: one.userId,
          name: one.displayName,
          bot: !!one.bot,
          cards: game.hands ? game.hands[seat].length : null,
          // What they have taken off the table. Public, and half of reading the table: somebody
          // who ate a 7♥ is collecting round there.
          eaten: game.eaten ? [...game.eaten[seat]] : [],
          gone: game.left.has(seat),
          place: game.finished.indexOf(seat) === -1
            ? null
            : placeName(game.finished.indexOf(seat), people),
          won: owed.has(one.userId) ? owed.get(one.userId) : null,
          // Đã trình thì công khai — đó là cả ý nghĩa của việc trình. Chưa trình thì `null`,
          // và cho tới lúc ấy nó là bài của người ta.
          shown: game.shown ? game.shown[seat] : null,
          // Only once it is over. Before that these are somebody's cards.
          melds: score ? score.melds : null,
          junk: score ? score.junk : null,
          sent: score ? score.sent : null,
          points: score ? score.points : null,
          mom: score ? score.mom : false,
        };
      }),

      turn: game.turn,
      turnName: game.turn === null ? '' : game.seats[game.turn].displayName,
      // Which half of the turn it is. A screen that does not say cannot draw the right button.
      step: game.step ?? null,
      turnEndsAt: game.state === 'playing' ? game.touched + TURN_MS : null,
      turnMs: TURN_MS,

      // The card in the middle, and whose it was.
      table: game.table ?? null,
      tableFrom: game.tableFrom ?? null,
      tableName: game.tableFrom === null || game.tableFrom === undefined
        ? '' : game.seats[game.tableFrom].displayName,
      stock: game.stock ? game.stock.length : 0,
      discards: game.discards ?? [],

      round: game.took ? Math.min(...game.took) + 1 : 1,
      turns: PHOM_TURNS,
      took: game.took ?? [],

      u: game.u ?? null,
      owes: game.owes ?? null,
      owesWhy: game.owesWhy ?? null,

      ranking: game.finished.map((seat, place) => ({
        id: game.seats[seat].userId,
        name: game.seats[seat].displayName,
        place: placeName(place, people),
        points: (scores.find((row) => row.seat === seat) ?? {}).points ?? null,
      })),
      paid,
      rematchAsked: [...game.ready],
    };
  }

  /// What somebody at a table is looking at. Their own hand is added by `pushTo`.
  function tableState(game) {
    if (game.kind === 'taixiu') return taixiuState(game);
    if (game.kind === 'baucua') return baucuaState(game);
    if (game.kind === 'phom') return phomState(game);
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

      // Every chặt there was, and what it moved. Shown because money that arrives without a
      // reason is money people assume was taken from them.
      chopped: game.chopped ?? [],
      // A hand that won on the deal, and what it was.
      blanche: game.blanche ?? null,
      blancheWith: game.blancheWith ?? null,
      // Who is paying for the table, and which of the two reasons it is.
      owes: game.owes ?? null,
      owesWhy: game.owesWhy ?? null,

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
    // Phỏm: their hand, how it splits, and whether the card in the middle is theirs to take.
    // The split is worked out here rather than on the page for the same reason the deck is:
    // a widget that decided what counted as a phỏm could decide generously.
    const phom = game && game.kind === 'phom' && seat !== null && game.hands
      ? (() => {
        const hand = game.hands[seat];
        const locked = game.melded[seat] ?? [];
        const split = bestSplit(hand, locked);
        return {
          seat,
          hand,
          melds: split.melds,
          junk: split.junk,
          points: split.points,
          // Bộ đã ăn: không đánh đi được, và trang phải vẽ ra cho biết vì sao.
          locked,
          // Whether this card makes a phỏm on the spot, and out of what.
          canEat: game.step === 'take' && game.turn === seat && game.table !== null
            && canEat(hand, game.table, locked),
          options: game.step === 'take' && game.turn === seat && game.table !== null
            ? eatOptions(hand, game.table, locked) : [],
        };
      })()
      : null;

    const mine = game && isDice(game) && seat !== null
      ? {
        seat,
        bets: betsOf(game, screen.userId),
        staked: onBoard(game, screen.userId),
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
        me: phom ?? mine ?? (seat === null ? null : {
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

      if (isDice(game)) {
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
        if (idle > LOBBY_MS) await endGame(game, 'a bowl nobody was betting at');
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

        // Phỏm has no passing. A turn that runs out draws from the nọc and throws the card that
        // costs least, which is the smallest decision that keeps the table moving — nobody's
        // hand is played for them beyond the one move the rules insist on.
        if (game.kind === 'phom') {
          game.touched = Date.now();
          if (game.step === 'take') phomDraw(game, seat);
          if (game.state === 'playing' && game.step === 'throw' && game.turn === seat) {
            phomThrow(game, seat, phomDiscard(game.hands[seat],
              { locked: game.melded[seat] ?? [] }));
          }
          if (game.state === 'over') settle(game);
          await pushGame(game);
          await maybeBotTurn(game);
          continue;
        }

        // Passed rather than played well. Playing their hand for them would be deciding a game
        // they are not in — but somebody who is leading has to put something down, so the
        // cheapest thing goes.
        game.touched = Date.now();
        if (game.pile) {
          move(game, seat, null);
        } else {
          const cards = chooseMove(game.hands[seat], null, {
            mustInclude: game.first ? game.opensWith : null,
            seen: game.seen,
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
