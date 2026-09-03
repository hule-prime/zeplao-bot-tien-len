// Tiến lên miền nam, drawn in the chat.
//
// What this needs from the app is four things: who is looking, what the table is, a way to say
// what somebody tapped, and a way to say it is ready. Everything else — whose turn it is, what
// beats what, who won — belongs to the bot, because the bot is the only side of this a player
// cannot edit.
//
// The rules *are* written down here as well, and only for one reason: a button that is lit and
// then silently does nothing is worse than a button that says why it is dark. Nothing here
// decides anything. Every play is checked again by the bot, against the hand it dealt.

const z = window.Zeplao;
const $ = (id) => document.getElementById(id);

const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♠', '♣', '♦', '♥'];
const TWO = 12;
const rankOf = (card) => Math.floor(card / 4);
const suitOf = (card) => card % 4;

/// The last thing the bot sent, and the cards under this reader's thumb.
let state = null;
let picked = new Set();
let screen = 'play';
let ticking = null;

/// Whether somebody who has finished has asked to watch the rest of it.
///
/// Theirs and local: the table has no opinion about whether they are still looking, and two
/// people who finished need not both have pressed the same button.
let watchingRest = null;

/// Gold, written the way it is read here: 12.500.
function gold(amount) {
  const digits = String(Math.abs(Math.round(amount || 0)))
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (amount < 0 ? '-' : '') + digits;
}

/// Which gold has already been announced, so a redraw does not announce it again.
///
/// Keyed by table and seat, and emptied when the table is dealt again. `render` runs on every
/// push and on every tab, so without this a win would float up the screen once a second for as
/// long as anybody looked at it.
/// Ván nào đã chạy hiệu ứng chia bài rồi. `drawHand` dựng lại tay bài ở **mỗi** push, nên nếu
/// không nhớ thì mười ba lá bay vào lại từ đầu mỗi lần có ai đó đánh một lá.
let dealtFor = null;

/**
 * Lá cuối cùng bay xuống bãi, đống bài cuối cùng bay xuống chiếu, và **lúc nào**.
 *
 * Ghi cả thời điểm chứ không chỉ ghi "đã vẽ rồi", vì mỗi nước đi tới đây thành **hai** push —
 * một cái chung cho cả bàn, một cái riêng có bài của mình — nên `render` chạy hai lần cách nhau
 * vài mili giây. Bản đầu gắn hiệu ứng ở lần vẽ *đầu tiên* rồi thôi: lần vẽ thứ hai dựng lại lá,
 * không còn lớp ấy nữa, và hiệu ứng biến mất trước khi có ai kịp thấy. Gắn theo thời điểm thì cả
 * hai lần vẽ đều có, và animation chạy lại sau mười mili giây thì không ai phân biệt được.
 */
let landedTable = null;
let landedPile = null;
let landedWhen = 0;
let pileWhen = 0;

/// Hiệu ứng vừa rơi còn tính là vừa rơi trong bao lâu.
const LANDS_MS = 420;

/// Tay bài ở lần đẩy trước, và lá vừa về.
///
/// Bot không nói "bạn vừa bốc được con này" — nó chỉ đẩy cả tay bài mới. Lá vừa về là hiệu của
/// hai tay, và đó cũng là cách duy nhất biết được, vì bốc và ăn về phía trang này trông y hệt
/// nhau: tay dài thêm một lá.
let heldHand = null;
let heldMelds = null;
let heldPoints = null;
let peeked = null;

/// Tay bài như nó *trước khi* bốc, giữ lại suốt lúc còn nặn.
///
/// Nặn mà lá đã nằm sẵn trong tay thì không còn gì để nặn: nhìn xuống là thấy. Mà không chỉ mặt
/// lá — cái viền xanh của phỏm và con số điểm rác cũng nói ra hết, vì cả hai đều được tính lại
/// với lá mới. Nên trong lúc đĩa còn úp thì cả tay bài là tay cũ, cộng đúng một lá úp ở cuối.
let heldSplit = null;

/// Còn đang nặn hay không.
const peeking = () => !!peeked && !peeked.open;

/// Lá vừa về tay, còn được đánh dấu cho tới khi đánh xong lượt này.
///
/// Mười lá xếp lại theo phỏm sau mỗi lần lấy bài, nên lá mới không nằm ở cuối hàng và không có
/// gì phân biệt nó — bốc xong nhìn xuống là một tay bài đã xáo lại, không biết vừa được thêm
/// con gì. Cái vòng sáng này là câu trả lời, và nó cần cả khi tắt nặn: lúc ấy nó là dấu hiệu
/// **duy nhất**.
let justTook = null;

let floated = new Set();
let floatedFor = null;

/// Numbers that have already run themselves up, so a redraw shows the answer rather than
/// starting again from nought.
let counted = new Set();
let purseWas = null;

/**
 * The number lifting off whoever it belongs to.
 *
 * Put into `#app` rather than into the thing it is about, and measured into place. Every part of
 * this screen is rebuilt from scratch on every push — a seat, the purse, the whole row of them —
 * and a chip living inside one of those is a chip deleted a fifth of the way through its
 * animation by the next card anybody plays. `#app` is the one element that is never rebuilt.
 */
function floatGold(over, amount) {
  if (!over || !amount) return;

  const app = $('app');
  const box = over.getBoundingClientRect();
  const frame = app.getBoundingClientRect();
  if (!box.width && !box.height) return;   // not laid out yet, so there is nowhere to put it

  const chip = document.createElement('div');
  chip.className = 'float ' + (amount > 0 ? 'up' : 'down');
  chip.textContent = change(amount);
  chip.style.left = `${box.left - frame.left + box.width / 2}px`;
  chip.style.top = `${box.top - frame.top}px`;
  app.append(chip);

  // Taken out again rather than left in the tree. It is a thing that happened, not a thing the
  // screen is showing, and a hundred dead chips is a hundred elements to lay out on every move.
  setTimeout(() => chip.remove(), 1700);
}

/// Signed, for a number that is a change rather than a total.
const change = (amount) => (amount > 0 ? '+' : '') + gold(amount);

// ---- the rules, again, and only so a button can say why it is dark -------------------------

function shapeOf(cards) {
  if (!cards.length) return null;
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
  if (ranks.includes(TWO)) return null;

  if (ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)) {
    return { kind: 'straight', size: sorted.length, top };
  }
  if (sorted.length >= 6 && sorted.length % 2 === 0) {
    const pairs = [];
    for (let i = 0; i < sorted.length; i += 2) {
      if (ranks[i] !== ranks[i + 1]) return null;
      pairs.push(ranks[i]);
    }
    if (pairs.every((r, i) => i === 0 || r === pairs[i - 1] + 1)) {
      return { kind: 'pairs_run', size: sorted.length, top, pairs: pairs.length };
    }
  }
  return null;
}

// >>> luật chung với bot — có test đối chiếu từng cặp, đừng sửa một bên <<<
const isBomb = (shape) =>
  !!shape && (shape.kind === 'quad' || (shape.kind === 'pairs_run' && shape.pairs >= 3));

/**
 * The ladder of chặt, and it is the same seven rungs the bot plays to.
 *
 * Two copies of a rule is two rules, and this is the one place the widget is allowed a copy: it
 * is what decides whether a card lights up as playable, and asking the bot that would put a
 * round trip between a tap and a card lifting. **The bot decides; this only draws.** Anything
 * this gets wrong shows up as a card that will not light or one that lights and is refused —
 * which is exactly what happened when the bot's ladder grew to seven rungs and this one did not.
 */
function bombRank(shape) {
  if (!shape) return null;
  if (shape.kind === 'single' && rankOf(shape.top) === TWO) return 0;
  if (shape.kind === 'pair' && rankOf(shape.top) === TWO) return 1;
  if (shape.kind === 'quad') return 3;
  if (shape.kind === 'pairs_run' && shape.pairs >= 3) {
    return shape.pairs === 3 ? 2 : Math.min(shape.pairs, 6);
  }
  return null;
}

function beats(mine, theirs) {
  if (!mine) return false;
  if (!theirs) return true;
  if (mine.kind === theirs.kind && mine.size === theirs.size) return mine.top > theirs.top;

  if (!isBomb(mine)) return false;
  const rung = bombRank(mine);
  const under = bombRank(theirs);
  if (under === null) return false;
  if (rung === 2) return under === 0;        // ba đôi thông chỉ chặt heo lẻ
  return under < rung;
}
// >>> hết luật chung <<<



/// What is on the table, said the way somebody at a table says it.
///
/// The count is part of the name for the two shapes that have one — a sảnh 5 and a sảnh 7 are
/// answered by different hands, and "sảnh" alone leaves whoever is looking to count the cards.
/// The cards of each rank in a hand, low suit first.
function byRank(hand) {
  const groups = new Map();
  for (const card of [...hand].sort((a, b) => a - b)) {
    const rank = rankOf(card);
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank).push(card);
  }
  return groups;
}

/**
 * Every legal play in this hand that holds this card and answers what is on the table.
 *
 * The point of it: somebody answering a sảnh should tap one card and have the sảnh, not tap
 * three cards and count. The tapped card is *pinned* — every candidate is built around it —
 * which is what makes this different from listing the hand's plays and filtering. A hand
 * holding both black fives can only answer 3-4-5♦ with the red one, and a list built from the
 * lowest card at each rank does not contain it.
 *
 * Sorted cheapest first: fewest cards, then lowest top card. Answering a pair with a pair
 * rather than with a tứ quý, and with the smaller pair of the two.
 */
function playsWith(hand, card, pile) {
  const groups = byRank(hand);
  const rank = rankOf(card);
  const found = [];

  const add = (cards) => {
    const sorted = [...cards].sort((a, b) => a - b);
    const shape = shapeOf(sorted);
    if (shape && beats(shape, pile)) found.push(sorted);
  };

  // The card on its own, and every way of putting the rest of its rank with it.
  const rest = (groups.get(rank) || []).filter((one) => one !== card);
  const take = (many, from, chosen) => {
    if (chosen.length === many) { add([card, ...chosen]); return; }
    for (let i = from; i < rest.length; i++) take(many, i + 1, chosen.concat(rest[i]));
  };
  for (let many = 0; many <= rest.length; many++) take(many, 0, []);

  // Runs, and runs of pairs, through this card's rank. A 2 is in neither.
  if (rank !== TWO) {
    for (let length = 3; length <= TWO; length++) {
      for (let start = Math.max(0, rank - length + 1); start <= rank; start++) {
        if (start + length > TWO) break;

        const ranks = [];
        for (let i = 0; i < length; i++) ranks.push(start + i);
        if (!ranks.every((one) => (groups.get(one) || []).length >= 1)) continue;

        // Twice: once made of the lowest card at each rank, and once with the top rank's
        // highest — which is the difference between beating a run by a suit and passing.
        const highest = ranks[length - 1];
        for (const reach of [false, true]) {
          add(ranks.map((one) => {
            if (one === rank) return card;
            const cards = groups.get(one);
            return reach && one === highest ? cards[cards.length - 1] : cards[0];
          }));
        }

        if (ranks.every((one) => (groups.get(one) || []).length >= 2)) {
          add(ranks.flatMap((one) => {
            const cards = groups.get(one);
            if (one !== rank) return cards.slice(0, 2);
            return [card, cards.find((other) => other !== card)];
          }));
        }
      }
    }
  }

  return found.sort((a, b) => a.length - b.length || a[a.length - 1] - b[b.length - 1]);
}

const SHAPES = {
  single: () => 'một lá',
  pair: () => 'đôi',
  triple: () => 'sám cô',
  quad: () => 'tứ quý',
  straight: (many) => `sảnh ${many}`,
  pairs_run: (many) => `${many / 2} đôi thông`,
};

// ---- drawing a card -----------------------------------------------------------------------

/**
 * Phỏm reads the same number differently, and this is the only place that shows.
 *
 * Tiến lên puts 3 at the bottom and 2 at the top; phỏm puts A at the bottom and K at the top.
 * Same 0–51, same `hạng * 4 + chất` — a different alphabet over it. Everything that draws a
 * card asks here rather than indexing RANKS, so a phỏm hand never comes out reading like a
 * tiến lên one.
 */
const PHOM_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const phom = () => !!state && state.kind === 'phom';
const rankName = (card) => (phom() ? PHOM_RANKS : RANKS)[rankOf(card)];
const nameOfCard = (card) => rankName(card) + SUITS[suitOf(card)];

function cardOf(card, extra) {
  const el = document.createElement('div');
  el.className = 'card' + (suitOf(card) >= 2 ? ' red' : '') + (extra ? ' ' + extra : '');

  const pip = document.createElement('span');
  pip.className = 'pip';
  const rank = document.createElement('b');
  rank.textContent = rankName(card);
  const suit = document.createElement('i');
  suit.textContent = SUITS[suitOf(card)];
  pip.append(rank, suit);

  const big = document.createElement('span');
  big.className = 'big';
  big.textContent = SUITS[suitOf(card)];

  el.append(pip, big);
  return el;
}

/// A monogram for the circle where a face would be.
///
/// The first letter of each of the last two words — Út Mập is ÚM and Lan Anh is LA. Two letters
/// off the end of the last word gave MẬ, which is half a syllable and reads as a typing error.
function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const use = words.slice(-2);
  return (use.map((word) => word[0]).join('') || '?').toUpperCase();
}

// ---- who is round the table -----------------------------------------------------------------

/// Where everybody sits, from the reader's chair.
///
/// You are always at the bottom, so the seat opposite is always opposite and the person about
/// to play is always in the same place on everybody's screen. A spectator has no chair, so for
/// them the table is drawn as it is dealt.
const AROUND = { 1: ['top'], 2: ['right', 'left'], 3: ['right', 'top', 'left'] };
const WATCHED = { 2: ['top', 'bottom'], 3: ['top', 'right', 'left'], 4: ['top', 'right', 'bottom', 'left'] };

function drawSeats() {
  const box = $('seats');
  box.replaceChildren();
  if (!state || !state.seats) return;

  const all = state.seats;
  const mine = state.me ? state.me.seat : null;

  // Filled in as the chairs are made and spawned after they are on the screen: a chip is
  // measured into place, and an element that is not in the tree yet has no place.
  const announce = [];

  // Empty chairs, while the table is still filling. Drawn rather than left out: a table with
  // one person at it and nothing where the others go looks like a table for one.
  const waiting = state.phase === 'lobby'
    ? Math.max(0, (state.size || all.length) - all.length)
    : 0;

  if (mine === null) {
    // Nobody's chair is the reader's, so the table is drawn as it was dealt.
    const spots = WATCHED[all.length] || [];
    all.forEach((seat, i) => box.append(chairOf(seat, spots[i] || 'top', announce)));
    for (const [chair, amount] of announce) floatGold(chair, amount);
    return;
  }

  // In turn order from the reader's own chair, which is why the person about to play is in the
  // same place on everybody's screen.
  const others = all
    .map((seat, i) => ({ seat, turn: (i - mine + all.length) % all.length }))
    .filter((one) => one.turn !== 0)
    .sort((a, b) => a.turn - b.turn)
    .map((one) => one.seat);

  // Laid out from how many chairs there will be, not from how many are taken. Placing the
  // people first and the empty seats after put a seat still to be filled on top of somebody
  // already sitting in it.
  const spots = AROUND[Math.min(3, others.length + waiting)] || AROUND[3];

  others.forEach((seat, i) => box.append(chairOf(seat, spots[i] || 'top', announce)));
  for (let i = 0; i < waiting; i++) {
    const at = spots[others.length + i];
    if (at) box.append(chairOf(null, at));
  }

  // And the reader, in their own chair. Not left out because the hand below says whose it is:
  // without it there is nobody at the near side of the table, the clock has nowhere to wind
  // round on your own turn, and a table still filling up is three empty chairs and a gap.
  const self = chairOf(all[mine], 'bottom', announce);
  self.classList.add('self');
  box.append(self);

  for (const [chair, amount] of announce) floatGold(chair, amount);
}

function chairOf(seat, at, announce) {
  const chair = document.createElement('div');
  chair.className = 'seat';
  chair.dataset.at = at;

  const face = document.createElement('div');
  face.className = 'face';

  if (!seat) {
    chair.classList.add('empty');
    face.textContent = '+';
    const name = document.createElement('div');
    name.className = 'seat-name';
    name.textContent = 'Ghế trống';
    chair.append(face, name);
    return chair;
  }

  if (seat.bot) chair.classList.add('bot');
  if (seat.gone || seat.place) chair.classList.add('out');
  if (state.turn === seat.seat && state.phase === 'playing') chair.classList.add('turn');

  face.textContent = initials(seat.name);

  // Whose table it is, marked on the chair rather than said in a line somewhere else. It only
  // matters while there is a decision left to somebody, so it goes once the cards are dealt.
  if (state.phase === 'lobby' && seat.id === state.host) {
    const crown = document.createElement('span');
    crown.className = 'crown';
    crown.textContent = '♛';
    face.append(crown);
  }

  const backs = document.createElement('div');
  backs.className = 'backs';
  // Up to eight, because nine little rectangles and thirteen little rectangles look the same
  // and the number that matters is a small one.
  for (let i = 0; i < Math.min(8, seat.cards || 0); i++) backs.append(document.createElement('i'));

  const name = document.createElement('div');
  name.className = 'seat-name';
  name.textContent = seat.name;

  const note = document.createElement('div');
  note.className = 'seat-note';
  if (seat.place) { note.textContent = seat.place; note.classList.add('place'); }
  else if (seat.gone) { note.textContent = 'đã rời'; note.classList.add('pass'); }
  else if (seat.passed) { note.textContent = 'bỏ lượt'; note.classList.add('pass'); }
  else if (state.phase === 'playing') note.textContent = `${seat.cards} lá`;
  else if (state.phase === 'lobby') note.textContent = 'sẵn sàng';

  chair.append(face, backs, name, note);

  // What they have taken off the table. Half of reading a phỏm table is this: somebody who ate
  // a 7♥ is collecting round there, and the card you were about to throw might be theirs.
  if (phom() && (seat.eaten || []).length) {
    // Bài thật, không phải chữ, và ở lại tới hết ván.
    //
    // Lá người ta ăn là lá **của mình vừa nhả ra** — biết nó nằm ở đâu là biết nên tránh nhả
    // thêm con nào. Viết ra chữ thì phải đọc rồi dịch lại thành hình ảnh một lá bài; để nguyên
    // lá bài thì không phải làm gì cả. Và nó phải còn đó tới cuối ván, vì nó là thứ người ta
    // nhìn lại nhiều lần chứ không phải một thông báo thoáng qua.
    const ate = document.createElement('div');
    ate.className = 'ate';
    const tag = document.createElement('i');
    tag.textContent = 'ăn';
    ate.append(tag);
    for (const card of seat.eaten) ate.append(cardOf(card, 'mini took'));
    chair.append(ate);
  }

  // Trình: phỏm đã mở ra cho cả bàn, ở vòng bốn. Vẽ nhỏ ngay dưới ghế người ta, vì cái phải trả
  // lời là "gửi được lá rác của mình vào đâu" — mà muốn trả lời thì phải nhìn thấy chúng.
  if (phom() && (seat.shown || []).length) {
    const laid = document.createElement('div');
    laid.className = 'shown';
    for (const meld of seat.shown) {
      const one = document.createElement('span');
      one.className = 'meld';
      one.textContent = meld.map(nameOfCard).join(' ');
      laid.append(one);
    }
    chair.append(laid);
  } else if (phom() && seat.shown) {
    // Trình rồi mà không có phỏm nào: móm, và cả bàn thấy điều đó.
    const none = document.createElement('div');
    none.className = 'shown mom';
    none.textContent = 'móm';
    chair.append(none);
  }

  // What going out was worth. Shown the moment they went out rather than at the end, because
  // that is the moment it was won — waiting for the last two to finish makes the number a
  // summary of something that happened rather than the thing happening.
  if (typeof seat.won === 'number' && seat.won !== 0) {
    const money = document.createElement('div');
    money.className = 'seat-gold ' + (seat.won > 0 ? 'up' : 'down');
    money.textContent = change(seat.won);
    chair.append(money);

    // Not once the hand is over.
    //
    // A chip floating off a chair is for the moment somebody goes out while the rest play on —
    // that is when the money moves and nothing else on screen says so. When the hand has ended
    // the result panel is up saying the figure in words, and the chip rises straight through
    // it: at a phỏm table it landed exactly on "Bét · 82 điểm" and made it unreadable.
    const once = `${state.gameId}:${seat.seat}`;
    if (announce && state.phase !== 'over' && !floated.has(once)) {
      floated.add(once);
      announce.push([chair, seat.won]);
    }
  }

  return chair;
}

// ---- what is in the middle --------------------------------------------------------------------

/// What this table is, across the top of the felt: the stake, and how many are expected.
///
/// While it is filling, mostly. A waiting room that says nothing about the stake is a waiting
/// room somebody sits down at and then finds out what it costs.
function drawFeltTop() {
  const top = $('felt-top');
  top.replaceChildren();
  if (!state || state.phase === 'choosing') return;

  const say = (text, kind) => {
    const el = document.createElement('span');
    if (kind) el.className = kind;
    el.textContent = text;
    top.append(el);
  };

  if (state.phase === 'lobby') {
    say(`Bàn của ${state.hostName}`);
    say(`${gold(state.stake)} vàng`, 'bet');
    say(`${state.seats.length}/${state.size}`);
    return;
  }

  if (state.phase === 'playing') {
    say(state.solo ? 'Đấu với máy' : `${gold(state.stake)} vàng`, state.solo ? '' : 'bet');
  }
}

function drawPile() {
  const box = $('pile');
  const note = $('pile-note');
  box.replaceChildren();
  note.replaceChildren();

  if (!state) return;

  if (phom() && state.phase === 'playing') { drawPhomMiddle(box, note); return; }

  if (state.phase === 'lobby') {
    const host = state.host === z.viewer.id;
    const short = state.size - state.seats.length;
    note.textContent = short > 0
      ? (host
        ? `Còn ${short} ghế · bắt đầu được từ 2 người`
        : `Còn ${short} ghế · đợi ${state.hostName} bắt đầu`)
      : 'Đủ người — đang chia bài…';
    return;
  }

  if (state.phase !== 'playing') return;

  if (!state.pile) {
    note.textContent = state.turn === (state.me && state.me.seat)
      ? 'Bàn trống — bạn ra bài'
      : `${state.turnName} ra bài mới`;
    return;
  }

  const at = `${state.gameId}:${state.pile.seat}:${state.pile.cards.join(',')}`;
  if (landedPile !== at) { landedPile = at; pileWhen = Date.now(); }
  const fresh = Date.now() - pileWhen < LANDS_MS;

  state.pile.cards.forEach((card, index) => {
    const el = cardOf(card);
    if (fresh) { el.classList.add('landing'); el.style.setProperty('--i', String(index)); }
    box.append(el);
  });

  const who = document.createElement('b');
  who.textContent = state.pile.byName;
  const say = SHAPES[state.pile.kind];
  note.append(who, document.createTextNode(say ? ` · ${say(state.pile.cards.length)}` : ''));
}

// ---- your own hand -------------------------------------------------------------------------

function drawHand() {
  const box = $('hand');
  box.replaceChildren();

  // Còn nặn thì tay bài là tay **trước khi bốc**, cộng đúng một lá úp ở cuối.
  //
  // Nặn mà lá đã nằm sẵn trong tay thì không còn gì để nặn. Và không chỉ mặt lá: viền xanh của
  // phỏm với con số điểm rác cũng nói ra hết, vì cả hai đều được tính lại với lá mới — nhìn thấy
  // "rác 35" tụt xuống "rác 22" là biết vừa bốc được gì mà chẳng cần lật.
  const hiding = peeking() && heldSplit ? peeked.card : null;
  const cards = hiding ? heldSplit.hand : ((state && state.me && state.me.hand) || []);
  if (!cards.length && !hiding) return;

  // One row, always. Thirteen cards in two rows is two rows of a hand nobody holds that way,
  // and it costs the table sixty pixels of felt it has better uses for.
  const fan = document.createElement('div');
  fan.className = 'fan';

  // How much of each card shows past the one before it.
  //
  // A fan, at any size of hand. Thirty of forty-four leaves the corner — the rank and the suit,
  // which is all of a card anybody reads once there is another on top of it — and the cards
  // still look held rather than laid out in a row. Spreading them to fill the frame made four
  // cards sit apart like a museum case and thirteen huddle; a fixed overlap looks the same all
  // the way down.
  //
  // Tighter only when thirty will not fit, which at thirteen cards it does not.
  const room = ($('app').clientWidth || 360) - 18;
  const width = 44;
  const spread = 30;
  const step = cards.length > 1
    ? Math.min(spread, Math.floor((room - width) / (cards.length - 1)))
    : width;
  fan.style.setProperty('--step', `${step - width}px`);

  // Phỏm sorts itself into what it is worth, not into what order it was dealt.
  //
  // The whole of the game is "how many points am I still holding", and a hand fanned by rank
  // makes somebody work that out by eye, every turn, from cards that are half behind each
  // other. So the phỏm are drawn first and lit, the junk after and dimmed, and the answer is
  // the row itself.
  const melds = hiding ? heldSplit.melds : (phom() && state.me ? state.me.melds : null);
  const locked = new Set(phom() && state.me ? (state.me.locked || []).flat() : []);
  const inMeld = new Set();
  if (phom() && melds) {
    for (const meld of melds) for (const card of meld) inMeld.add(card);
  }
  const order = phom() && melds
    ? [...melds.flat(), ...cards.filter((card) => !inMeld.has(card))]
    : cards;

  // Chia bài: mười ba lá bay vào, lá này sau lá kia.
  //
  // Chỉ một lần cho mỗi ván. `drawHand` dựng lại cả tay ở mỗi push — mà một bàn bốn người thì có
  // hàng chục push một ván — nên không nhớ thì bài bay vào lại từ đầu mỗi khi ai đó đánh một lá,
  // và cái đang đọc dở nhảy khỏi tay người ta.
  const dealing = state.phase === 'playing' && state.gameId !== dealtFor;
  if (dealing) dealtFor = state.gameId;

  order.forEach((card, index) => {
    const el = cardOf(card, picked.has(card) ? 'up' : '');
    if (state.opensWith === card) el.classList.add('opens');
    if (phom()) el.classList.add(inMeld.has(card) ? 'melded' : 'junk');
    // Bộ đã ăn thì đứng yên: những lá ấy không đánh đi được. Vẽ khác đi, vì một lá bấm vào mà
    // không nhúc nhích và không nói gì là một lá trông như hỏng.
    if (phom() && !hiding && locked.has(card)) el.classList.add('pinned');
    if (phom() && card === justTook) el.classList.add('fresh');
    if (dealing) {
      el.classList.add('dealing');
      el.style.setProperty('--i', String(index));
    }
    el.onclick = () => tap(card);
    fan.append(el);
  });

  // Và lá úp ở cuối. Có mặt, đếm được, nhưng chưa đọc được — đúng như một lá vừa rút ra khỏi nọc
  // và còn nằm sấp trong tay.
  if (hiding !== null) {
    const back = document.createElement('div');
    back.className = 'card facedown';
    if (dealing) back.style.setProperty('--i', String(order.length));
    fan.append(back);
  }

  box.append(fan);
}

/**
 * The middle of a phỏm table: the nọc, and the card somebody has just thrown away.
 *
 * That second card is the whole of the decision in front of whoever is next, so it is the
 * biggest thing on the felt and it says whether it can be taken. Everything else — how many
 * turns are left, how deep the nọc is — is a line under it.
 */
function drawPhomMiddle(box, note) {
  const mine = state.me && state.turn === state.me.seat;
  const taking = mine && state.step === 'take';

  const stock = document.createElement('div');
  stock.className = 'stock' + (taking && !state.me.canEat ? ' live' : '');
  stock.textContent = state.stock;
  box.append(stock);

  if (state.table !== null && state.table !== undefined) {
    const thrown = cardOf(state.table, 'thrown' + (taking && state.me.canEat ? ' takeable' : ''));
    // Bay xuống, một lần, đúng lúc nó vừa được đánh ra.
    //
    // Không có hiệu ứng thì lá trên bãi cứ đứng đó và đổi mặt — nhìn ra là cái bàn tự sửa mình,
    // không phải ai đó vừa đánh một lá. Mà biết ai vừa đánh gì là gần như toàn bộ việc phải làm
    // ở trò này.
    const at = `${state.gameId}:${state.discards.length}:${state.table}`;
    if (landedTable !== at) { landedTable = at; landedWhen = Date.now(); }
    if (Date.now() - landedWhen < LANDS_MS) thrown.classList.add('landing');
    box.append(thrown);
  }

  const line = document.createElement('b');
  if (!mine) line.textContent = `Lượt ${state.turnName}`;
  else if (state.step === 'take') {
    line.textContent = state.me.canEat ? 'Ăn được lá này, hoặc bốc' : 'Bốc một lá';
  } else line.textContent = 'Chọn một lá để đánh';

  const round = document.createElement('span');
  round.className = 'phom-round';
  round.textContent = ` · vòng ${Math.min(state.round, state.turns)}/${state.turns}`
    + ` · nọc ${state.stock}`;

  note.append(line, round);
}

/**
 * Picking cards up.
 *
 * The first card off an empty hand takes the whole play it belongs to — tap one card of a sảnh
 * and the sảnh comes up, tap one of a pair and the pair does. Tapping three cards to answer
 * three cards is counting somebody else's play back at them, which is work the screen can do.
 *
 * After that every tap is one card, added or dropped, so a hand that can answer two ways is
 * still steerable by hand: drop the card the guess got wrong and tap the one you meant.
 *
 * Leading is the one case that stays a single. There is nothing on the table to say what shape
 * you are reaching for, and a tap that swept up four of a kind because you meant to throw one
 * away is a much worse mistake than an extra tap.
 */
function tap(card) {
  if (!state || state.phase !== 'playing') return;
  if (!state.me) { say('Bạn đang xem bàn này'); return; }
  if (state.turn !== state.me.seat) { say(`Đang tới lượt ${state.turnName}`); return; }

  // Phỏm throws one card and only one, so a tap is a choice rather than the start of building
  // a play. Tapping a second card moves the choice instead of adding to it.
  if (phom()) {
    if (state.step !== 'throw') { say('Lấy một lá trước đã'); return; }
    // Nói ra lý do. Ăn được lá nào là vì nó vào phỏm, nên phỏm ấy phải đứng — và một lá bấm vào
    // mà im lặng thì người ta bấm lại lần nữa rồi nghĩ là màn hình treo.
    if ((state.me.locked || []).some((meld) => meld.includes(card))) {
      say('Lá này nằm trong phỏm đã ăn — không đánh đi được');
      return;
    }
    picked = picked.has(card) ? new Set() : new Set([card]);
    say('');
    drawHand();
    drawButtons();
    drawBar();
    return;
  }

  if (picked.has(card)) {
    picked.delete(card);
  } else if (picked.size) {
    picked.add(card);
  } else {
    // Nothing legal built on this card still picks the card up. The button says why it will
    // not go, and a tap that does nothing at all reads as a card that did not hear you.
    const whole = playsWith(state.me.hand, card, pileShape())[0];
    picked = new Set(whole || [card]);
  }

  say('');
  drawHand();
  drawButtons();
  drawBar();
}

// ---- what to do next --------------------------------------------------------------------------

function button(text, kind, onclick) {
  const el = document.createElement('button');
  el.textContent = text;
  if (kind) el.className = kind;
  el.onclick = () => onclick(el);
  $('buttons').append(el);
  return el;
}

function drawButtons() {
  const box = $('buttons');
  box.replaceChildren();
  if (!state) return;

  if (state.phase === 'choosing') return;

  if (diceGame(state)) {
    button(state.world ? 'Thoát' : 'Rời sòng', 'quiet',
      (el) => { el.disabled = true; z.send({ leave: true }); });
    if (!state.me) return;

    const undo = button('Hoàn tác', state.world ? 'primary' : '', () => {
      // Purely a thing about this page. The bot is told totals, so taking a chip back is one
      // fewer chip in the next thing it is told.
      stack.pop();
      say('');
      if (state.kind === 'taixiu') drawTaixiu(); else drawBaucua();
      drawButtons();
      sendBets();
    });
    undo.disabled = state.phase !== 'betting' || !stack.length;

    // No throw button at the world sòng. It runs on its own clock, and a button that hurried it
    // along would be one person at it deciding for everybody else.
    if (state.world) return;

    const throwIt = button(
      state.phase === 'rolling' ? 'Đang xóc…' : state.phase === 'paid' ? 'Ván sau…' : 'Xóc',
      'primary', (el) => { el.disabled = true; z.send({ roll: true }); });
    throwIt.disabled = state.phase !== 'betting' || !myStaked();
    return;
  }

  // Một bàn cờ đang chạy. Một nút, và nó nói đúng cái nó làm: rời một bàn cờ giữa ván **là xin
  // thua**, nên gọi nó là "thoát" rồi lặng lẽ trừ tiền là nói dối ngay trên mặt nút.
  if (isBoardGame(state) && state.phase === 'playing') {
    button('Xin thua', 'quiet', (el) => { el.disabled = true; z.send({ leave: true }); });
    if (!state.me) return;
    const note = document.createElement('div');
    note.className = 'waiting-note';
    note.textContent = state.turn === state.me.seat
      ? 'Chạm quân rồi chạm ô' : `Đang đợi ${state.turnName}`;
    $('buttons').append(note);
    return;
  }

  if (state.phase === 'lobby') {
    const host = state.host === z.viewer.id;
    const seated = state.seats.length;

    button('Rời bàn', 'quiet', () => z.send({ leave: true }));

    if (!host) {
      // Nothing for them to press, so nothing that looks like a button. A dark button saying
      // "waiting" is a thing people tap at, and it will never do anything.
      const waiting = document.createElement('div');
      waiting.className = 'waiting-note';
      waiting.textContent = `${seated}/${state.size} người · ${state.hostName} sẽ bắt đầu`;
      $('buttons').append(waiting);
      return;
    }

    // Filling the rest with machines only makes sense while there is a rest to fill.
    const fill = button('Thêm máy', '', (el) => { el.disabled = true; z.send({ fill: true }); });
    fill.disabled = seated >= state.size;

    // The count on the button, because "start" and "start with two of the four you asked for"
    // are different decisions and only one of them is what the button looks like.
    const start = button(`Bắt đầu · ${seated}/${state.size}`, 'primary',
      (el) => { el.disabled = true; z.send({ start: true }); });
    start.disabled = seated < 2;
    return;
  }

  if (state.phase === 'over') {
    // Back to the lobby, not shut. Closing the frame is the app's own button at the top of it,
    // and a game that closes itself is a game somebody has to go and reopen to play another.
    button('Về sảnh', 'quiet', (el) => { el.disabled = true; z.send({ leave: true }); });

    if (!state.me) return;
    const asked = (state.rematchAsked || []).includes(z.viewer.id);
    const others = (state.rematchAsked || []).length - (asked ? 1 : 0);
    const again = button(
      asked ? 'Đang chờ người khác…' : others ? `Ván nữa (${others} người sẵn sàng)` : 'Ván nữa',
      'primary',
      () => z.send({ rematch: true }));
    again.disabled = asked;
    return;
  }

  // A game under way. A spectator gets the one thing a spectator can do.
  if (!state.me) {
    button('Thôi xem', 'quiet', (el) => { el.disabled = true; z.send({ leave: true }); });
    return;
  }

  if (finishedHere()) {
    // While their own result is up it carries the two ways out, so a row underneath saying the
    // same thing again is one button drawn twice.
    if (watchingRest !== state.gameId) return;

    // Watching the rest by choice. One way out and nothing that pretends to be a move — there
    // are no cards left to play.
    button('Về sảnh', 'primary', (el) => { el.disabled = true; z.send({ leave: true }); });
    return;
  }

  // Leaving with cards still in hand is forfeiting, and the button says so rather than saying
  // "thoát" and quietly costing somebody a stake.
  button('Bỏ ván', 'quiet', (el) => { el.disabled = true; z.send({ leave: true }); });

  if (phom()) { drawPhomButtons(); return; }

  const mine = state.turn === state.me.seat;
  const pass = button('Bỏ lượt', '', (el) => {
    el.disabled = true;
    picked.clear();
    z.send({ pass: true });
  });
  // Leading is the one turn nobody may sit out. Said on the button rather than refused after
  // the press: a table with nothing on it has to be answered by somebody.
  pass.disabled = !mine || !state.pile;

  const cards = [...picked];
  const shape = shapeOf(cards);
  const legal = cards.length > 0 && !!shape && beats(shape, pileShape())
    && (!mustOpenWith() || cards.includes(state.opensWith));

  // Named `go` and not `play`. A `const play` here shadows the function of that name for the
  // whole of this scope, so the button's handler reached for the button rather than the move.
  const go = button(labelFor(cards, shape, legal), 'primary', () => play());
  go.disabled = !mine || !legal;
}

/**
 * A phỏm turn is two halves, and the buttons are the halves.
 *
 * Take, then throw. Never both at once: a row that offered "ăn", "bốc" and "đánh" together
 * would be offering two of them at a moment when they cannot be done, and a button that is
 * there and refuses is worse than a button that is not there.
 */
function drawPhomButtons() {
  const mine = state.turn === state.me.seat;

  if (state.step === 'take') {
    const eat = button('Ăn', 'primary', (el) => { el.disabled = true; z.send({ eat: true }); });
    eat.disabled = !mine || !state.me.canEat;
    const draw = button(state.stock ? `Bốc · ${state.stock}` : 'Hết nọc', '',
      (el) => { el.disabled = true; z.send({ draw: true }); });
    draw.disabled = !mine;
    return;
  }

  const one = [...picked][0];
  const out = button(
    one === undefined ? 'Chọn lá để đánh' : `Đánh ${nameOfCard(one)}`,
    'primary',
    (el) => {
      el.disabled = true;
      const card = [...picked][0];
      picked = new Set();
      z.send({ throw: card });
    });
  out.disabled = !mine || one === undefined;
}

/// Out of cards, with the table still going. Their place is taken and their gold is paid — what
/// is left is somebody else's game.
function finishedHere() {
  // `me.hand` chỉ có ở hai trò bài. Một bàn cờ cũng có `me`, mà trong đó là danh sách nước đi —
  // đọc `.hand.length` ở đấy là ném ngay, và một cú ném trong `render` là **cả trang đứng lại**.
  return !!state && state.phase === 'playing' && !!state.me
    && Array.isArray(state.me.hand) && state.me.hand.length === 0;
}

function pileShape() {
  return state.pile ? shapeOf(state.pile.cards) : null;
}

/// Whether the reader is the one who has to open with the lowest card in play.
///
/// The card is in the table everybody is sent, because everybody's screen rings it. The rule
/// is only about whoever was dealt it — without this, the three people who were not spent the
/// first turn looking at a button telling them to play a card they do not have.
function mustOpenWith() {
  return state.opensWith !== null && state.opensWith !== undefined
    && !!state.me && state.me.hand.indexOf(state.opensWith) !== -1;
}

/// What the button says, which is also the only place a refusal can be explained.
function labelFor(cards, shape, legal) {
  if (!cards.length) return 'Chọn bài';
  if (!shape) return 'Không thành bộ';
  if (mustOpenWith() && !cards.includes(state.opensWith)) {
    return `Phải có ${RANKS[rankOf(state.opensWith)]}${SUITS[suitOf(state.opensWith)]}`;
  }
  if (!legal) return state.pile ? 'Không chặt được' : 'Không hợp lệ';
  return `Đánh ${cards.length} lá`;
}

function play() {
  const cards = [...picked];
  if (!cards.length) return;

  // Taken out of the hand here rather than waited for. The round trip is a hundred
  // milliseconds at best, and cards that sit still after being played read as a table that did
  // not hear you. If the bot refuses them they are in the next push it sends, and they come
  // back.
  state.me.hand = state.me.hand.filter((card) => !picked.has(card));
  picked = new Set();

  z.send({ play: cards });
  render();
}

// ---- how it ended -------------------------------------------------------------------------------

/**
 * Cả tay bài của một người, ngửa ra, sau khi ván đã xong.
 *
 * **Bài thật, không phải tên bài viết ra chữ.** Bản đầu tôi in "8♣ 8♦ 8♥ · A♠ 3♠" thành một dòng
 * chữ — đọc được, nhưng đọc là việc phải làm, còn nhìn thì không. Cuối ván phỏm là lúc người ta
 * muốn *nhìn*: ai gom được bộ nào, ai ôm những con gì. Một hàng chữ không trả lời câu đó nhanh
 * bằng một hàng bài.
 *
 * Ghế thì không nhét được — chúng rộng bảy mươi tám pixel và một tay phỏm có mười lá. Nên chỗ mở
 * bài là **cả mặt bàn**: hết ván thì mặt bàn thôi là bàn và trở thành chiếu ngửa.
 *
 * Phỏm gom thành cụm, viền xanh. Rác rời ra, xám. Lá gửi được thì mờ hẳn và có mũi tên — gửi rồi
 * thì nó không tính điểm nữa, mà "không tính điểm" phải nhìn thấy chứ không phải tự suy.
 */
function handOf(seat) {
  const row = document.createElement('div');
  row.className = 'laid';

  for (const meld of seat.melds || []) {
    const group = document.createElement('span');
    group.className = 'laid-meld';
    for (const card of meld) group.append(cardOf(card, 'mini'));
    row.append(group);
  }

  // Lá gửi đứng riêng, có nhãn.
  //
  // Bản đầu chúng nằm lẫn với rác và chỉ mờ đi — mà "mờ đi" không nói được điều cần nói. Gửi rồi
  // là **hết tính điểm**, đó là một chuyện khác hẳn với "còn trên tay và nhỏ", và một người nhìn
  // vào không có cách nào đoán ra ý ấy từ độ mờ.
  const sent = [...(seat.sent || [])].sort((a, b) => a - b);
  if (sent.length) {
    const group = document.createElement('span');
    group.className = 'laid-sent';
    const tag = document.createElement('i');
    tag.textContent = 'gửi';
    group.append(tag);
    for (const card of sent) group.append(cardOf(card, 'mini gone'));
    row.append(group);
  }

  const junk = [...(seat.junk || [])].sort((a, b) => a - b);
  if (junk.length) {
    const group = document.createElement('span');
    group.className = 'laid-loose';
    for (const card of junk) group.append(cardOf(card, 'mini junk'));
    row.append(group);
  }

  if (!(seat.melds || []).length) {
    const mom = document.createElement('span');
    mom.className = 'laid-mom';
    mom.textContent = 'móm';
    row.append(mom);
  }

  return row;
}

function drawResult() {
  const box = $('result');

  // Their own result, as soon as they have one — not when the last two have finished arguing
  // over a pair of threes. Coming first and then being made to sit and watch is the game
  // holding on to somebody it has finished with.
  const early = finishedHere() && watchingRest !== state.gameId;
  box.hidden = !state || (state.phase !== 'over' && !early);
  if (box.hidden) { box.dataset.done = ''; box.replaceChildren(); return; }

  if (early) {
    // Built once a hand, and then left alone.
    //
    // The rest of the table plays on for a minute after somebody goes out, and every move of it
    // arrives as a push. Rebuilding this screen on each one restarted the heading, the count-up
    // and the whole announcement — a dozen times at a table of four, and never at a table of
    // two, which is why it only ever showed up with more than two people in it. It read as the
    // game telling somebody they had won, over and over.
    const once = `done:${state.gameId}`;
    if (box.dataset.done === once) return;
    box.replaceChildren();
    // Only once there is a place to announce. The push that empties a hand can arrive a beat
    // before the one that says where it came, and "Bạn về " with nothing after it is not a
    // sentence.
    if (drawFinished(box)) box.dataset.done = once;
    return;
  }

  box.dataset.done = '';
  box.replaceChildren();

  const ranking = state.ranking || [];
  const paid = state.paid || [];
  const owed = (id) => paid.find((one) => one.userId === id);

  const title = document.createElement('h2');
  const mine = paid.find((one) => one.userId === z.viewer.id)
    ?? ranking.find((one) => one.id === z.viewer.id);
  const won = owed(z.viewer.id);
  title.textContent = mine
    ? `Bạn về ${mine.place.toLowerCase()}` + (won && won.change ? ` · ${change(won.change)}` : '')
    : 'Ván đã xong';
  // Red for last, and last is decided by what was lost rather than by where the row sits: at a
  // table with machines in it the bottom row of the list is not the bottom of the table.
  if (won ? won.change < 0 : mine && mine === ranking[ranking.length - 1]) {
    title.className = 'last';
  }
  box.append(title);

  // Whose table this was. With two or more people at it the machines are furniture — they were
  // not playing for anything and are not in the order that decided the money — so listing them
  // put two rows saying "Nhất" one above the other, which reads as a fault rather than as a
  // rule. With one person at it there is no other order to show, so the table's own is it.
  const listed = paid.length >= 2
    ? paid.map((one) => ({ id: one.userId, name: one.displayName, place: one.place }))
    : ranking;

  listed.forEach((one, index) => {
    const row = document.createElement('div');
    row.className = 'placed'
      + (one.id === z.viewer.id ? ' me' : '')
      + (index === listed.length - 1 ? ' last' : '');

    const name = document.createElement('span');
    name.className = 'where-name';
    name.textContent = one.name;

    const place = document.createElement('span');
    place.className = 'where-place';
    // Phỏm được xếp hạng bằng điểm rác, nên hạng mà không có điểm là hạng không giải thích được
    // gì. Móm nói thẳng ra chữ móm — nó là một cách thua riêng, không phải điểm cao.
    const score = phom()
      ? (paid.find((row) => row.userId === one.id) ?? {})
      : null;
    place.textContent = score && score.mom
      ? `${one.place} · móm`
      : score && typeof score.points === 'number'
        ? `${one.place} · ${score.points} điểm`
        : one.place;

    // What it was worth. A machine has nothing in this column at all.
    const took = owed(one.id);
    const money = document.createElement('span');
    money.className = 'where-gold' + (took && took.change > 0 ? ' up' : took && took.change < 0 ? ' down' : '');
    money.textContent = took ? change(took.change) : '';

    // One row after another rather than all at once. A result that appears whole is a screen
    // changing; one that lands a row at a time is the table being read out. Only on the way in:
    // a redraw that replayed the arrival would deal the same result again every second.
    if (!counted.has(`over:${state.gameId}:${one.id}`)) {
      row.style.animationDelay = `${0.16 + index * 0.11}s`;
    } else {
      row.style.animation = 'none';
    }
    if (took && took.change) {
      countUp(money, took.change, 0.16 + index * 0.11, '', `over:${state.gameId}:${one.id}`);
    }

    row.append(name, place, money);
    box.append(row);

    // Hết ván phỏm là mở hết bài ra.
    //
    // Trước đây ván xong là nhảy thẳng sang bảng tiền, không ai kịp nhìn người khác có phỏm gì
    // và dư con gì — mà đó chính là lúc người ta muốn nhìn nhất, vì nó trả lời câu "mình thua ở
    // đâu". Bảng điểm không thay được chỗ ấy: một con số nói mình thua bao nhiêu, không nói vì
    // sao.
    if (phom()) {
      const seat = (state.seats || []).find((who) => who.id === one.id);
      if (seat && (seat.melds || seat.junk)) box.append(handOf(seat));
    }

    // What the number is made of, under the row it belongs to.
    //
    // A hand now pays four different ways — where you came, what you cut, what you were still
    // holding, and whether you are paying for the table — and a single figure that is the sum
    // of four things nobody was told about is a figure people assume was taken from them. Only
    // shown when there is something to say: an ordinary hand still reads as one number.
    if (took) {
      const parts = [];
      if (took.chop) parts.push([took.chop, took.chop > 0 ? 'chặt' : 'bị chặt']);
      if (took.rot) parts.push([took.rot, took.rot > 0 ? 'người ta thối' : 'thối bài']);
      if (took.blanche) parts.push([took.blanche, 'tới trắng']);
      if (took.owes) parts.push([took.owes, state.owesWhy === 'ôm hàng' ? 'ôm hàng' : 'cóng']);
      if (parts.length) {
        const why = document.createElement('div');
        why.className = 'where-why';
        for (const [amount, label] of parts) {
          const bit = document.createElement('span');
          bit.className = amount > 0 ? 'up' : 'down';
          bit.textContent = `${label} ${change(amount)}`;
          why.append(bit);
        }
        box.append(why);
      }
    }
  });

  // The hand that never had to be played.
  if (state.blancheWith) {
    const white = document.createElement('div');
    white.className = 'blanche';
    const who = (state.seats.find((one) => one.id === state.blanche) || {}).name || 'Ai đó';
    white.textContent = `${who} tới trắng · ${state.blancheWith}`;
    box.append(white);
  }

  // And every chặt of it, in the order they landed. The one part of a hand people argue about
  // afterwards, so it is written down rather than remembered.
  for (const cut of state.chopped || []) {
    const line = document.createElement('div');
    line.className = 'chopline';
    line.textContent = `${cut.byName} chặt ${cut.fromName} · ${cut.cards.map(nameOfCard).join(' ')}`;
    box.append(line);
  }
}

// ---- choosing what to play ------------------------------------------------------------------------

/// What is in the purse, and what this table costs. Always the same place, because it is the
/// number every other number on the screen is about.
/**
 * Who is looking and what they have, on every screen and from the first frame.
 *
 * Written into elements that are already there rather than replaced. Two reasons: the bar must
 * not appear a beat after everything else, jogging the whole page down as it arrives; and the
 * chip that floats off the number is measured against that number, which has to have been on
 * the screen long enough to have a position.
 */
function drawPurse() {
  $('me-face').textContent = initials(z.viewer.displayName);
  $('me-name').textContent = z.viewer.displayName || 'Bạn';

  const amount = $('purse-amount');
  // The number this round paid is under the plate with everything else.
  const showing = covered() && heldGold !== null ? heldGold : (state ? state.gold : null);
  amount.textContent = showing === null ? '…' : gold(showing);

  // The way to more gold, beside the gold, on every screen and at every balance. A `+` that
  // came and went depending on how much somebody had is a `+` nobody learns is there — and the
  // moment they want it is not always the moment they have run out.
  //
  // It goes only when there is nothing behind it: no advertisements left today.
  const add = $('purse-add');
  add.hidden = !state || (state.adsLeft ?? 0) <= 0;
  add.onclick = () => { screen = 'play'; step = 'gold'; render(); };

  // What this table costs, beside what is in the purse, so the two are read together.
  const had = $('purse').querySelector('.stake');
  if (had) had.remove();
  if (state && state.stake) {
    const cost = document.createElement('span');
    cost.className = 'stake';
    cost.textContent = state.solo ? `máy · ${gold(state.stake)}` : `cược ${gold(state.stake)}`;
    $('purse').insertBefore(cost, $('purse-gold'));
  }

  if (!state) return;

  // What just moved. Not on the first push — arriving and being told you have gained ten
  // thousand are different things, and only one of them happened.
  const moved = purseWas === null || showing === null ? 0 : showing - purseWas;
  purseWas = showing;

  // Not twice for the same money. The seat it was won at floats its own chip, and two of the
  // same number rising off the same screen at the same instant reads as a fault rather than as
  // emphasis — it was the ghế that meant something, so the ghế keeps it.
  const alsoOnTable = !!state && !diceGame(state) && !!state.me
    && (state.seats[state.me.seat] || {}).won === moved;

  if (moved) {
    amount.classList.remove('moved');
    void amount.offsetWidth;          // so the same class re-animates rather than sitting still
    amount.classList.add('moved');
    // Over the number rather than over the row it is in, so it reads as that number changing.
    if (!alsoOnTable) floatGold(amount, moved);
  }
}

/// What one person sees the moment they go out, while the rest play on.
function drawFinished(box) {
  const seat = state.seats[state.me.seat];
  const mine = (state.paid || []).find((one) => one.userId === z.viewer.id);
  const place = (mine && mine.place) || (seat && seat.place) || '';
  if (!place) return false;

  const title = document.createElement('h2');
  title.textContent = `Bạn về ${place.toLowerCase()}`;
  if (mine && mine.change < 0) title.className = 'last';
  box.append(title);

  if (mine && mine.change) {
    const money = document.createElement('div');
    money.className = 'finished-gold ' + (mine.change > 0 ? 'up' : 'down');
    money.textContent = `${change(mine.change)} vàng`;
    box.append(money);
    countUp(money, mine.change, 0.2, ' vàng', `done:${state.gameId}:${z.viewer.id}`);
  }

  const note = document.createElement('div');
  note.className = 'ads-note';
  note.textContent = 'Đã cộng vào ví. Ván vẫn đang chạy cho những người còn lại.';
  box.append(note);

  const row = document.createElement('div');
  row.className = 'finished-buttons';

  const leave = document.createElement('button');
  leave.className = 'go primary';
  leave.textContent = 'Về sảnh';
  leave.onclick = () => { leave.disabled = true; z.send({ leave: true }); };

  const stay = document.createElement('button');
  stay.className = 'go';
  stay.textContent = 'Xem tiếp';
  stay.onclick = () => { watchingRest = state.gameId; render(); };

  row.append(leave, stay);
  box.append(row);

  return true;
}

/// Which question is being asked. Nothing at all on the first screen, which is two ways in.
let step = null;

/// What tomorrow is worth, for the one line that mentions it before the state has said so.
const DAILY = 10000;

/// The answer to the one question that is asked before another one is. Everything else is a tap
/// that does the thing, so nothing else has to be remembered between screens.
/**
 * Có nặn hay không, nhớ trên máy người dùng.
 *
 * Nặn là cái thú, nhưng đó là cái thú của ván đầu tiên và của người đang rảnh. Ai chơi nhanh thì
 * mỗi lượt thêm một thao tác là một thao tác thừa — nên tắt được, và tắt rồi thì tắt cả cái đĩa
 * bầu cua luôn, vì hai chỗ ấy là cùng một động tác.
 *
 * `localStorage` bọc trong try/catch: có trình duyệt chặn hẳn, và một cái bàn không mở được vì
 * không đọc nổi một tuỳ chọn là một cái bàn hỏng vì một thứ không quan trọng.
 */
const SQUEEZE = 'tienlen:nan';
let squeezing = true;
try {
  squeezing = localStorage.getItem(SQUEEZE) !== '0';
} catch (no) { /* không đọc được thì cứ để mặc định */ }

function setSqueezing(on) {
  squeezing = !!on;
  try { localStorage.setItem(SQUEEZE, on ? '1' : '0'); } catch (no) { /* không lưu được cũng chạy */ }
}

let seatsWanted = 4;

/// Which card game the seat count and the stake are being chosen for. Two games share those two
/// questions exactly, so they share the two screens that ask them.
let gameWanted = 'tienlen';

/// A row that is a whole answer: tapping it does the thing rather than selecting a value that
/// then has to be confirmed somewhere else.
function pick(label, hint, enabled, onclick) {
  const el = document.createElement('button');
  el.className = 'pick';

  const name = document.createElement('b');
  name.textContent = label;
  const note = document.createElement('em');
  note.textContent = hint || '';
  const arrow = document.createElement('u');
  arrow.textContent = '›';

  el.append(name, note, arrow);
  el.disabled = !enabled;
  if (enabled) el.onclick = () => { el.disabled = true; onclick(); };
  return el;
}

/// One way in, big enough to be the only thing anybody has to decide about.
function bigCard(mark, title, note, kind, enabled, onclick) {
  const el = document.createElement('button');
  el.className = 'big' + (kind ? ' ' + kind : '');

  const icon = document.createElement('i');
  icon.textContent = mark;
  const words = document.createElement('span');
  const name = document.createElement('b');
  name.textContent = title;
  const hint = document.createElement('em');
  hint.textContent = note;
  words.append(name, hint);
  const arrow = document.createElement('u');
  arrow.textContent = '›';

  el.append(icon, words, arrow);
  el.disabled = !enabled;
  if (enabled) el.onclick = () => onclick(el);
  return el;
}

function stepHead(title, note, back) {
  const head = document.createElement('div');
  head.className = 'step-head';

  const arrow = document.createElement('button');
  arrow.className = 'back';
  arrow.textContent = '‹';
  arrow.onclick = () => { step = back; render(); };

  const words = document.createElement('div');
  const name = document.createElement('b');
  name.textContent = title;
  const hint = document.createElement('em');
  hint.textContent = note;
  words.append(name, hint);

  head.append(arrow, words);
  return head;
}

function stepNote(text) {
  const el = document.createElement('div');
  el.className = 'step-note';
  el.textContent = text;
  return el;
}

/**
 * The menu, asked one question at a time.
 *
 * Everything used to be on one screen: two cards, two rows of seat counts, a row of stakes and
 * two buttons to set them going — eleven things to read before anybody had played a hand. Now
 * the first screen is two ways in, and each one asks what it needs when it needs it.
 */
function drawMenu() {
  const body = $('menu-body');
  body.replaceChildren();

  const purse = state.gold;
  const bets = state.stakes || [1000];
  const cheapest = Math.min(...bets);

  if (step === null) {
    const brand = document.createElement('div');
    brand.className = 'brand';
    brand.textContent = 'Tiến lên miền nam';
    body.append(brand);

    // The day's gold, first and lit, and taken by pressing for it. Gold that arrives by itself
    // is gold nobody remembers arriving — pressing for it is what makes it yours.
    const waiting = state.daily > 0;
    if (waiting) {
      body.append(bigCard('★', 'Quà mỗi ngày', `Nhận ${gold(state.daily)} vàng`,
        'gold', true, (el) => { el.disabled = true; z.send({ daily: true }); }));
    }

    // Nothing here about running out. The `+` beside the purse is where more gold comes from,
    // and it is on every screen — putting a card about it on this one as well is how the first
    // thing anybody sees grows a fourth thing to read.
    body.append(bigCard('♠', 'Tiến lên miền nam',
      purse < cheapest ? `Cần ${gold(cheapest)} vàng` : 'Đánh bài, 2 đến 4 người',
      waiting ? '' : 'gold', purse >= cheapest,
      () => { gameWanted = 'tienlen'; step = 'tienlen'; render(); }));

    body.append(bigCard('🀄', 'Đánh phỏm',
      purse < cheapest ? `Cần ${gold(cheapest)} vàng` : 'Ăn, gửi, hạ phỏm · ít điểm nhất thắng',
      '', purse >= cheapest,
      () => { step = 'phom'; render(); }));

    body.append(bigCard('⚄', 'Bầu cua tôm cá',
      purse < cheapest ? `Cần ${gold(cheapest)} vàng` : 'Đặt cửa, ba con xúc xắc',
      '', purse >= cheapest,
      () => { step = 'baucua'; render(); }));

    // Straight in, with no screen in between. Bầu cua asks one question first because it has two
    // answers — the sòng everybody is at, or a bowl of your own. Tài xỉu has **one table**, so
    // there is nothing to ask, and a screen with a single button on it is a screen.
    //
    // The rules go where the money goes instead: every door on the mat says its range and what
    // it pays, and there is a Luật tab beside the cầu. A rules screen you tap past on the way in
    // is a rules screen nobody has read by the time it matters.
    body.append(bigCard('⚅', 'Tài xỉu',
      purse < cheapest ? `Cần ${gold(cheapest)} vàng` : 'Tài, xỉu, chẵn, lẻ, bão · một sòng',
      '', purse >= cheapest,
      (el) => { el.disabled = true; z.send({ taixiu: true }); }));

    body.append(bigCard('♞', 'Cờ vua',
      purse < cheapest ? `Cần ${gold(cheapest)} vàng` : 'Hai người · đấu máy hoặc mời',
      '', purse >= cheapest,
      () => { step = 'chess'; render(); }));

    body.append(bigCard('車', 'Cờ tướng',
      purse < cheapest ? `Cần ${gold(cheapest)} vàng` : 'Hai người · đấu máy hoặc mời',
      '', purse >= cheapest,
      () => { step = 'xiangqi'; render(); }));

    // Said here, on the screen somebody is actually looking at.
    //
    // Both ways in are dark when there is nothing to play with, and a dark card with no line
    // under it is a screen that has refused somebody without telling them what to do about it.
    // The explanation used to live one screen further in — behind the cards they cannot press.
    if (purse < cheapest) {
      body.append(stepNote(state.daily > 0
        ? `Bạn có ${gold(purse)} vàng, chưa đủ vào bàn nào — nhận quà mỗi ngày ở trên đã.`
        : `Bạn có ${gold(purse)} vàng, chưa đủ vào bàn nào. Bấm dấu + cạnh số vàng ở trên `
          + `để xem quảng cáo nhận ${gold(state.adsGold)} vàng.`));
    }

    return;
  }

  if (step === 'tienlen') {
    const noBot = purse < state.botStake;
    const noTable = purse < cheapest;

    body.append(stepHead('Tiến lên miền nam', 'Chơi kiểu nào?', null));
    body.append(pick('Đấu với máy',
      noBot ? `cần ${gold(state.botStake)} vàng` : `cược ${gold(state.botStake)}`,
      !noBot, () => { step = 'solo'; render(); }));
    body.append(pick('Tạo bàn',
      noTable ? `cần ${gold(cheapest)} vàng` : 'mời cả thế giới',
      !noTable, () => { gameWanted = 'tienlen'; step = 'open'; render(); }));

    body.append(stepNote(noBot
      ? `Bạn có ${gold(purse)} vàng. Bấm dấu + cạnh số vàng ở trên để xem quảng cáo nhận `
        + `${gold(state.adsGold)} vàng.`
      : 'Bàn tự mở ra cho mọi nhóm — ai cũng tìm thấy và vào được.'));
    return;
  }

  if (step === 'phom') {
    const noBot = purse < state.botStake;
    const noTable = purse < cheapest;

    body.append(stepHead('Đánh phỏm', 'Chơi kiểu nào?', null));
    body.append(pick('Đấu với máy',
      noBot ? `cần ${gold(state.botStake)} vàng` : `cược ${gold(state.botStake)}`,
      !noBot, () => { step = 'phomSolo'; render(); }));
    body.append(pick('Tạo bàn',
      noTable ? `cần ${gold(cheapest)} vàng` : 'mời cả thế giới',
      !noTable, () => { gameWanted = 'phom'; step = 'open'; render(); }));

    body.append(stepNote(noBot
      ? `Bạn có ${gold(purse)} vàng. Bấm dấu + cạnh số vàng ở trên để xem quảng cáo nhận `
        + `${gold(state.adsGold)} vàng.`
      : 'Mỗi người chín lá, cái mười. Bốn vòng, mỗi vòng ăn một lá hoặc bốc một lá rồi đánh đi '
        + 'một lá. Hết ván ai còn ít điểm rác nhất thì thắng.'));
    return;
  }

  if (step === 'phomSolo') {
    body.append(stepHead('Đấu với máy', 'Ghế trống là máy ngồi', 'phom'));
    for (const many of [2, 3, 4]) {
      body.append(pick(`${many} người`, many === 4 ? 'đủ bàn' : many === 2 ? 'nhanh nhất' : '',
        true, () => z.send({ phomSolo: many })));
    }
    body.append(stepNote('Ù ăn gấp đôi của từng người. Móm — hết ván không có phỏm nào — '
      + 'thua gấp đôi.'));
    return;
  }

  // Hai bàn cờ hỏi cùng một câu, nên chúng dùng chung một màn. Luôn hai người, nên câu "bàn mấy
  // người" không tồn tại — cả luồng chọn còn đúng hai bước.
  if (step === 'chess' || step === 'xiangqi') {
    const cờ = step === 'chess' ? 'Cờ vua' : 'Cờ tướng';
    const noBot = purse < state.botStake;
    const noTable = purse < cheapest;

    body.append(stepHead(cờ, 'Chơi kiểu nào?', null));
    body.append(pick('Đấu với máy',
      noBot ? `cần ${gold(state.botStake)} vàng` : `cược ${gold(state.botStake)}`,
      !noBot, () => z.send({ [step]: 'solo' })));
    body.append(pick('Mời người chơi',
      noTable ? `cần ${gold(cheapest)} vàng` : 'mời cả thế giới',
      !noTable, () => { gameWanted = step; step = 'boardStake'; render(); }));

    body.append(stepNote(noBot
      ? `Bạn có ${gold(purse)} vàng. Bấm dấu + cạnh số vàng ở trên để xem quảng cáo nhận `
        + `${gold(state.adsGold)} vàng.`
      : step === 'chess'
        ? 'Đủ luật: nhập thành, bắt tốt qua đường, phong quân. Thắng ăn trọn phần cược, hoà thì '
          + 'không ai mất gì. Bên nào cầm quân trắng là rút thăm.'
        : 'Đủ luật: cản chân mã, mắt tượng, pháo phải có ngòi, tướng không đối mặt. Hết nước đi '
          + 'là thua. Thắng ăn trọn phần cược, hoà thì không ai mất gì.'));
    return;
  }

  if (step === 'boardStake') {
    const floor = state.minStake || 1000;
    const roof = state.maxStake || purse;
    const cờ = gameWanted === 'chess' ? 'Cờ vua' : 'Cờ tướng';

    body.append(stepHead('Cược bao nhiêu?', `${cờ} · hai người`, gameWanted));
    for (const one of bets) {
      body.append(pick(`${gold(one)} vàng`,
        purse < one ? 'thiếu vàng' : `thắng ăn ${gold(one)}`,
        purse >= one, () => z.send({ [gameWanted]: 'open', stake: one })));
    }
    body.append(customStake(floor, roof));
    body.append(stepNote(roof < floor
      ? `Cần ít nhất ${gold(floor)} vàng mới mở được bàn.`
      : `Tự nhập từ ${gold(floor)} đến ${gold(roof)} vàng. Bạn có ${gold(purse)}.`));
    return;
  }

  if (step === 'baucua') {
    body.append(stepHead('Bầu cua tôm cá', 'Chơi kiểu nào?', null));
    const poor = purse < cheapest;
    body.append(pick('Sòng thế giới', poor ? `cần ${gold(cheapest)} vàng` : 'lúc nào cũng đang xóc',
      !poor, () => z.send({ baucua: 'world' })));
    body.append(pick('Chơi một mình', poor ? `cần ${gold(cheapest)} vàng` : 'xóc lúc nào tuỳ bạn',
      !poor, () => z.send({ baucua: 'solo' })));

    // Said, not merely shown. A dark row and nothing else is a screen that has refused somebody
    // without telling them what to do about it.
    body.append(stepNote(poor
      ? `Bạn có ${gold(purse)} vàng, chưa đủ đặt một cửa. Bấm dấu + cạnh số vàng ở trên để `
        + `xem quảng cáo nhận ${gold(state.adsGold)} vàng.`
      : 'Đặt vào cửa nào, cửa đó ra mấy con thì ăn bấy nhiêu lần. Không ra thì mất phần đặt. '
        + 'Sòng thế giới là một sòng duy nhất, ai cũng vào được, xóc liên tục theo đồng hồ.'));
    return;
  }

  if (step === 'solo') {
    body.append(stepHead('Đấu với máy', 'Ghế trống là máy ngồi', 'tienlen'));
    for (const many of [2, 3, 4]) {
      body.append(pick(`${many} người`, many === 4 ? 'đủ bàn' : many === 2 ? 'nhanh nhất' : '',
        true, () => z.send({ solo: many })));
    }
    body.append(stepNote(`Cược ${gold(state.botStake)} — nhất +${gold(state.botStake)}, `
      + `nhì +${gold(state.botStake / 2)}, ba −${gold(state.botStake / 2)}, `
      + `bét −${gold(state.botStake)}`));
    return;
  }

  if (step === 'open') {
    body.append(stepHead('Tạo bàn', 'Bàn mấy người?', gameWanted));
    for (const many of [2, 3, 4]) {
      body.append(pick(`${many} người`, many === 4 ? 'đủ bàn' : many === 2 ? 'nhanh nhất' : '',
        true, () => { seatsWanted = many; step = 'stake'; render(); }));
    }
    body.append(stepNote('Chưa đủ người vẫn bắt đầu được, hoặc thêm máy vào ghế trống.'));
    return;
  }

  if (step === 'gold') {
    body.append(stepHead('Kiếm thêm vàng', `Bạn có ${gold(purse)} vàng`, null));
    body.append(pick('Xem quảng cáo', `10 giây · +${gold(state.adsGold)} vàng`,
      (state.adsLeft ?? 0) > 0, () => z.send({ ads: 'start' })));
    body.append(stepNote((state.adsLeft ?? 0) > 0
      ? `Còn ${state.adsLeft} lượt hôm nay. Mai đăng nhập nhận ${gold(DAILY)} vàng nữa.`
      : `Hết lượt hôm nay. Mai đăng nhập nhận ${gold(DAILY)} vàng.`));
    return;
  }

  if (step === 'stake') {
    const floor = state.minStake || 1000;
    const roof = state.maxStake || purse;

    body.append(stepHead('Cược bao nhiêu?',
      `${gameWanted === 'phom' ? 'Phỏm' : 'Tiến lên'} · bàn ${seatsWanted} người`, 'open'));
    for (const one of bets) {
      body.append(pick(`${gold(one)} vàng`,
        purse < one ? 'thiếu vàng' : `nhất ăn ${gold(one)}`,
        purse >= one,
        () => z.send(openTable(one))));
    }

    // Anything else. The three above are the common answers, not the only ones — and a game
    // where the stake is one of three numbers somebody else chose is a game two friends cannot
    // play for what they actually want to play for.
    body.append(customStake(floor, roof));
    body.append(stepNote(roof < floor
      ? `Cần ít nhất ${gold(floor)} vàng mới mở được bàn.`
      : `Tự nhập từ ${gold(floor)} đến ${gold(roof)} vàng. Bạn có ${gold(purse)}.`));
  }
}

/**
 * Bật tắt nặn, ngay trên bàn.
 *
 * Ở trong ván chứ không phải ở màn đầu, vì đây là thứ người ta muốn đổi **đúng lúc đang chơi** —
 * nặn vài ván rồi thấy chậm, hoặc tắt rồi lại thấy nhớ. Bắt thoát ra sảnh để đổi một cái công
 * tắc là bắt bỏ dở một ván.
 *
 * Chỉ hiện ở hai trò có gì để nặn: phỏm có lá bốc, bầu cua có cái đĩa. Tiến lên không có, và một
 * cái công tắc không làm gì thì đứng đó chỉ để gây phân vân.
 *
 * Mặc định là **có nặn**. Chỉ khi tự tay tắt mới tắt, và tắt rồi thì nhớ trên máy người ta.
 */
function squeezeChip() {
  const chip = document.createElement('label');
  chip.className = 'squeeze' + (squeezing ? ' on' : '');
  chip.title = squeezing
    ? 'Đang nặn: kết quả úp lại, tự tay mở — bấm để tắt'
    : 'Không nặn: mở kết quả luôn — bấm để bật';

  const tick = document.createElement('input');
  tick.type = 'checkbox';
  tick.checked = squeezing;
  tick.onchange = () => { setSqueezing(tick.checked); render(); };

  const what = document.createElement('span');
  what.textContent = 'Nặn';

  chip.append(tick, what);
  return chip;
}

/**
 * Công tắc tiếng xúc xắc, ngay cạnh công tắc nặn.
 *
 * Ở trong bát, vì đây là thứ người ta muốn tắt **đúng lúc nó vừa kêu** — chứ không phải lúc đang
 * chọn trò. Mặc định là có tiếng; ai tắt thì nhớ trên máy người ta, như công tắc nặn.
 *
 * Chữ là **"Tiếng"**, không phải "Âm". Bản đầu ghi "Âm", và ở một cái sòng có tiền được mất thì
 * một ô tick cạnh chữ ấy đọc ra là *số âm* trước khi đọc ra là *âm thanh* — người thử nó hỏi
 * ngay "cái ô âm là cái gì". Tiếng Việt gọi cái công tắc này là bật tiếng và tắt tiếng, nên nó
 * là "Tiếng".
 */
function soundChip() {
  const chip = document.createElement('label');
  chip.className = 'squeeze' + (sounding ? ' on' : '');
  chip.title = sounding
    ? 'Đang có tiếng xúc xắc — bấm để tắt'
    : 'Đang tắt tiếng xúc xắc — bấm để bật';

  const tick = document.createElement('input');
  tick.type = 'checkbox';
  tick.checked = sounding;
  tick.onchange = () => { setSounding(tick.checked); render(); };

  const what = document.createElement('span');
  what.textContent = 'Tiếng';

  chip.append(tick, what);
  return chip;
}

/// Cả hai công tắc, trong một góc bát. Một hàng chứ không phải hai cái cùng dán vào góc trên bên
/// phải — hai cái tuyệt đối cùng toạ độ thì cái sau nằm đè lên cái trước.
function cornerChips() {
  const corner = document.createElement('div');
  corner.className = 'corner';
  corner.append(squeezeChip(), soundChip());
  return corner;
}

/// Opening a table, for whichever of the two games the menu walked in from.
const openTable = (stake) => (gameWanted === 'chess' || gameWanted === 'xiangqi'
  ? { [gameWanted]: 'open', stake }
  : gameWanted === 'phom'
    ? { phom: seatsWanted, stake }
    : { open: seatsWanted, stake });

/// A stake somebody types, with the one button that opens it.
///
/// A field and a button rather than a slider: the numbers here span three orders of magnitude
/// and a slider over that is a slider nobody can land on a round number with.
function customStake(floor, roof) {
  const row = document.createElement('div');
  row.className = 'custom';

  const box = document.createElement('input');
  box.className = 'amount-in';
  box.type = 'number';
  box.inputMode = 'numeric';
  box.min = String(floor);
  box.max = String(roof);
  box.step = '1000';
  box.placeholder = 'Tự nhập';

  const go = document.createElement('button');
  go.className = 'go-custom';
  go.textContent = 'Mở bàn';
  go.disabled = true;

  const asked = () => Math.round(Number(box.value));
  const ok = () => Number.isFinite(asked()) && box.value !== ''
    && asked() >= floor && asked() <= roof;

  // Checked as it is typed, so the button is dark until the number is one the bot will take.
  // The bot brings anything else back inside the range anyway — this is so nobody has to find
  // that out by opening a table for a number they did not mean.
  box.oninput = () => { go.disabled = !ok(); };
  box.onkeydown = (event) => { if (event.key === 'Enter' && ok()) go.onclick(); };
  go.onclick = () => {
    if (!ok()) return;
    go.disabled = true;
    z.send(openTable(asked()));
  };

  row.append(box, go);
  return row;
}

/**
 * The advertisement.
 *
 * Deliberately plain: the word, a clock, and a way out. It is a demonstration of the mechanism
 * rather than a pretence at an advertisement, and dressing it up would only make it harder to
 * tell which part is the mechanism.
 *
 * The clock here is drawing, not deciding. The bot wrote down when this started and will refuse
 * a claim that arrives early — which it has to, because this file is one anybody can edit.
 */
function drawAds() {
  const box = $('ads');
  box.hidden = !(state && state.adsEndsAt);
  if (box.hidden) return;

  box.replaceChildren();

  const mark = document.createElement('div');
  mark.className = 'ads-mark';
  mark.textContent = 'ADS';

  const note = document.createElement('div');
  note.className = 'ads-note';
  note.textContent = 'Quảng cáo mẫu — chưa có nội dung thật';

  const clock = document.createElement('div');
  clock.className = 'ads-clock';

  const take = document.createElement('button');
  take.className = 'go primary';
  take.id = 'ads-take';
  take.textContent = `Nhận ${gold(state.adsGold)} vàng`;
  take.onclick = () => { take.disabled = true; z.send({ ads: 'claim' }); };

  const skip = document.createElement('button');
  skip.className = 'go';
  skip.textContent = 'Bỏ qua';
  skip.onclick = () => z.send({ ads: 'stop' });

  box.append(mark, note, clock, take, skip);
  adsTick();
}

function adsTick() {
  if (!state || !state.adsEndsAt) return;
  const left = Math.max(0, (state.adsEndsAt - Date.now()) / 1000);
  const clock = document.querySelector('.ads-clock');
  const take = $('ads-take');
  if (clock) clock.textContent = left > 0 ? `${Math.ceil(left)}s` : 'Xong';
  if (take) take.disabled = left > 0;
}

/// The tables everybody else has open, and the table of who has won what.
function drawBrowse() {
  const box = $('browse');
  box.replaceChildren();
  if (!state) return;

  if (screen === 'rank') {
    // One board, and it is everybody's. A group's own stopped meaning anything the moment a
    // table stopped belonging to a group — two people at the same table can be in two rooms,
    // so a per-room table would count the same hand for one of them and not the other.
    const rows = state.table || [];
    box.append(heading(rows.length ? 'Nhiều vàng nhất · thế giới' : 'Chưa ai chơi ván nào'));

    rows.forEach((person, place) => {
      const row = document.createElement('div');
      row.className = 'row' + (person.id === z.viewer.id ? ' me' : '');
      row.style.cursor = 'default';

      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = `${place + 1}`;
      const name = document.createElement('span');
      name.className = 'row-names';
      name.textContent = person.name || 'Ai đó';
      // Gold and nothing else. How many hands it took is a different question, and a column
      // nobody is ranked by is a column that only makes the one they are ranked by harder to
      // read down the page.
      const score = document.createElement('span');
      score.className = 'row-seats';
      score.textContent = gold(person.gold);

      row.append(rank, name, score);
      box.append(row);
    });
    return;
  }

  const open = state.rooms || [];
  box.append(heading(open.length
    ? 'Bàn đang mở · khắp thế giới'
    : 'Chưa có bàn nào đang mở — mở một bàn đi'));

  for (const room of open) {
    const row = document.createElement('div');
    row.className = 'row';

    const names = document.createElement('span');
    names.className = 'row-names';
    // Which game, before the names. Two kinds of table on one list and no way to tell them
    // apart is somebody sitting down to the wrong one.
    // Ba trò, ba dấu. Ngồi vào một bàn tiến lên trong khi định chơi phỏm là chuyện xảy ra
    // đúng một lần rồi người ta thôi bấm vào danh sách này.
    const mark = { baucua: '⚄ ', taixiu: '⚅ ', phom: '🀄 ', chess: '♞ ', xiangqi: '車 ' }[room.kind] ?? '♠ ';
    names.textContent = mark + room.names.join(', ');
    // The stake before the seats. It is the first thing worth knowing about a table and the
    // only one that can refuse you.
    const bet = document.createElement('span');
    bet.className = 'row-seats';
    const said = { phom: 'phỏm', chess: 'cờ vua', xiangqi: 'cờ tướng' }[room.kind];
    bet.textContent = room.kind === 'baucua' ? 'bầu cua'
      : said ? `${said} · ${gold(room.stake)}` : gold(room.stake);
    const many = document.createElement('span');
    many.className = 'score';
    many.textContent = `${room.names.length}/${room.size}`;
    const go = document.createElement('span');
    go.className = 'row-go';
    go.textContent = state.gold < room.stake ? 'Thiếu' : 'Vào';

    row.append(names, bet, many, go);
    row.onclick = () => z.send({ join: room.id });
    box.append(row);
  }

  const running = state.playing || [];
  if (running.length) {
    box.append(heading('Đang chơi'));
    for (const game of running) {
      const row = document.createElement('div');
      row.className = 'row';

      const names = document.createElement('span');
      names.className = 'row-names';
      names.textContent = game.names.join(', ');
      const go = document.createElement('span');
      go.className = 'row-go';
      go.textContent = 'Xem';

      row.append(names, go);
      row.onclick = () => z.send({ watch: game.id });
      box.append(row);
    }
  }
}

/// Runs a number up to what it ended on, after the row it is in has arrived.
///
/// Six hundred milliseconds and eased, because a number that ticks at a constant rate reads as
/// a loading bar and one that lands instantly is not read at all.
/**
 * Runs a number up to what it ended on, once.
 *
 * The `once` key is the whole of why this is not four lines. Every push redraws the result, and
 * a table somebody has finished with goes on pushing for as long as the other three play — so a
 * count-up restarted on each redraw is a number that resets to nought every second and never
 * arrives. It has to animate the first time and print the answer every time after.
 */
function countUp(el, to, after, tail = '', once = null) {
  if (once) {
    if (counted.has(once)) { el.textContent = change(to) + tail; return; }
    counted.add(once);
  }

  el.textContent = change(0) + tail;
  const started = Date.now() + after * 1000;

  // The number lands whatever happens to the frames. `requestAnimationFrame` does not run in a
  // tab nobody is looking at, and this is exactly the moment somebody looks away — so without
  // this the result they come back to says everybody won nothing.
  setTimeout(() => { el.textContent = change(to) + tail; }, after * 1000 + 640);

  const step = () => {
    const gone = (Date.now() - started) / 600;
    if (gone < 0) { requestAnimationFrame(step); return; }
    if (gone >= 1) { el.textContent = change(to) + tail; return; }
    const eased = 1 - (1 - gone) * (1 - gone) * (1 - gone);
    el.textContent = change(Math.round(to * eased / 100) * 100) + tail;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function heading(text) {
  const el = document.createElement('div');
  el.className = 'heading';
  el.textContent = text;
  return el;
}

// ---- the clock ---------------------------------------------------------------------------------

/// Redrawn on its own beat, and from a deadline rather than a count — so a phone that has been
/// asleep comes back to the right number rather than one half a minute behind.
function tick() {
  adsTick();
  if (!state || state.phase !== 'playing' || !state.turnEndsAt) return;

  const whole = (state.turnMs || 30000) / 1000;
  const left = Math.max(0, (state.turnEndsAt - Date.now()) / 1000);
  const ring = document.querySelector('.seat.turn .face');
  if (ring) ring.parentElement.style.setProperty('--left', String(Math.min(1, left / whole)));

  const clock = document.querySelector('#mine-bar .clock');
  if (clock) {
    clock.textContent = `${Math.round(left)}s`;
    clock.classList.toggle('low', left <= 8);
  }
}

function drawBar() {
  const bar = $('mine-bar');
  bar.replaceChildren();
  // Only while somebody is on the move. A finished table showed "Lượt · 0 lá" under the
  // result, which is a clock for a game that has stopped.
  bar.hidden = !state || state.phase !== 'playing';
  if (bar.hidden) return;

  const who = document.createElement('span');
  who.className = 'who';

  if (!state.me) {
    who.textContent = 'Bạn đang xem';
    bar.append(who);
    return;
  }

  who.textContent = state.turn === state.me.seat ? 'Tới lượt bạn' : `Lượt ${state.turnName}`;
  bar.append(who);

  // What this hand is worth right now. The whole of phỏm is that number, and working it out by
  // eye from cards half behind each other every turn is work the screen can do once.
  if (phom()) {
    const score = document.createElement('span');
    score.className = 'phom-score';
    // Điểm của tay **trước khi bốc** trong lúc còn nặn: con số này một mình nó đủ để nói lá vừa
    // bốc là con gì.
    const points = peeking() && heldSplit && heldSplit.points !== null
      ? heldSplit.points : state.me.points;
    score.textContent = points === 0 ? '· không còn rác' : `· rác ${points} điểm`;
    bar.append(score, squeezeChip());
    return;
  }

  if (picked.size) {
    const chosen = document.createElement('span');
    chosen.textContent = `· ${picked.size} lá`;
    const clear = document.createElement('button');
    clear.className = 'clear';
    clear.textContent = 'bỏ chọn';
    // One tap back to an empty hand. Dropping an auto-picked sảnh a card at a time is five
    // taps to undo one.
    clear.onclick = () => {
      picked = new Set();
      say('');
      drawHand();
      drawButtons();
      drawBar();
    };
    bar.append(chosen, clear);
  }

  // Said out loud, because "you have nothing that beats this" and "you have something and
  // cannot find it" are the same screen otherwise, and only one of them is true.
  if (state.me.stuck) {
    const stuck = document.createElement('span');
    stuck.textContent = '· không chặt được, bỏ lượt thôi';
    stuck.style.color = 'var(--danger)';
    bar.append(stuck);
  }

  const clock = document.createElement('span');
  clock.className = 'clock';
  bar.append(clock);
}

/**
 * Cái duy nhất trang này nói ra thành lời — và nó **nổi lên rồi tự đi**, không chiếm chỗ.
 *
 * Nó từng là một hàng thật trong cột: `min-height: 0` lúc rỗng, 26px lúc có chữ. Nghe thì gọn.
 * Nhưng cột của một trò xúc xắc chỉ có đúng một hàng co được, nên hai mươi sáu pixel ấy đẩy cả
 * cột qua ngưỡng và hàng chip tiền rơi đè lên nút ở đáy trang. Tệ hơn cả việc vỡ: nó **tự lành**
 * — lời nhắn hết hạn, hàng xẹp lại, bàn về như cũ — nên nó là một cái lỗi lúc bị lúc không, và
 * lúc không thì không ai đi tìm.
 *
 * Luật rút ra, và nó không riêng gì chỗ này: **một thứ chỉ hiện đôi lúc thì không được nằm
 * trong dòng chảy.** Xô cả trang đi vài chục pixel để nói một câu rồi kéo về là làm hai lần
 * chuyển động ở đúng lúc người ta đang nhắm vào một cái nút. Nên nó nổi lên trên, ngay trên hàng
 * nút, không nhận ngón tay, và tự đi sau vài giây.
 */
const SAYS_MS = 3_600;
let saying = null;

function say(text) {
  const box = $('says');
  clearTimeout(saying);
  saying = null;

  box.textContent = text || '';
  box.classList.toggle('up', !!text);
  if (!text) return;

  // Tự đi. Một lời từ chối còn nằm đó sau khi người ta đã sửa xong là một lời nói về một chuyện
  // không còn nữa.
  saying = setTimeout(() => {
    saying = null;
    box.textContent = '';
    box.classList.remove('up');
  }, SAYS_MS);
}

// ---- putting it all on the screen ------------------------------------------------------------------

function drawTabs() {
  const tabs = $('tabs');
  tabs.replaceChildren();

  const deciding = state && state.phase === 'choosing';
  tabs.hidden = !deciding;
  if (!deciding) return;

  const open = (state.rooms || []).length;
  for (const [key, mark, label, count] of [
    // A dot rather than a number: there is one daily reward, and saying "1" invites the
    // question of what else there might be.
    ['play', '♠', 'Chơi', state.daily > 0 ? '•' : 0],
    ['browse', '⌸', 'Bàn', open],
    ['rank', '★', 'Xếp hạng', 0],
  ]) {
    const tab = document.createElement('button');
    tab.className = screen === key ? 'on' : '';

    const icon = document.createElement('i');
    icon.textContent = mark;
    const name = document.createElement('span');
    name.textContent = label;
    tab.append(icon, name);

    // How many tables are open, on the tab that leads to them. A list nobody looks at is a list
    // that may as well not be built.
    if (count) {
      const many = document.createElement('u');
      many.textContent = String(count);
      if (count === '•') many.className = 'dot';
      tab.append(many);
    }

    tab.onclick = () => { screen = key; render(); };
    tabs.append(tab);
  }
}

// ---- bầu cua tôm cá -----------------------------------------------------------------------

/**
 * Whether the plate is still over this round's result.
 *
 * Holds the round number already lifted, so a new throw covers itself again without anybody
 * having to remember to put the plate back.
 *
 * What is under it is not only the dice. The gold has already moved and the mat already knows
 * which faces came up — so while this is covered the purse shows the number it showed before,
 * the mat lights nothing, and the line under the bowl says nothing about what was won. A plate
 * that hid the dice while the number above it had already changed would be a plate hiding
 * nothing at all.
 */
// How long a plate sits there before it lifts itself. Long enough to be worth dragging, short
// enough that a bowl the whole world is watching never waits on one person's thumb.
const NAN_MS = 3400;

/// Lá bốc lên tự lật sau bằng ấy, nếu không ai nặn. Ngắn hơn cái đĩa bầu cua: đây là lá của
/// riêng mình và không ai đợi nó, nhưng đợi lâu quá thì chính mình bị chặn.
const PEEK_MS = 3000;

let lifted = 0;

/// The purse as it was before this round paid out, so the number can wait for the plate.
let heldGold = null;

// Tắt nặn thì không có đĩa nào cả — chứ không phải úp xuống rồi mở ngay. Úp một phần mười giây
// rồi bật lên là một cái nháy, và một cái nháy thì khó chịu hơn hẳn không có gì.
//
// Hai cái bát, hai kiểu úp. Bầu cua có một cái đĩa: kéo ra là xong. Tài xỉu có cái nắp **rồi
// tới ba con** — nặn xong là lật đủ ba, vì trò này là cái tổng, mà hai con đã ngửa thì vẫn chưa
// có tổng nào cả. Chừng nào chưa lật đủ thì cả kết quả còn đậy: cái ví, cửa thắng, dòng được
// mất, tất cả.
const covered = () => squeezing && !!state && state.phase === 'paid'
  && (state.kind === 'baucua' ? lifted !== state.round
    : state.kind === 'taixiu' ? !txAllUp()
      : false);

/// Trò xúc xắc, cả hai. Đặt cùng lúc lên cùng ba con, không có lượt, và cùng một đường chip.
const diceGame = (what) => !!what && (what.kind === 'baucua' || what.kind === 'taixiu');

/// Which half of the sòng is showing: the mat, or the run of past throws.
let songTab = 'board';

/// Which chip is being put down. Theirs and local — the table has no opinion about it.
let chip = null;

/**
 * My board, while a betting window is open.
 *
 * The page owns it and the bot is told the **totals** — not "add a chip", not "take one off".
 * Four taps and an undo were five separate POSTs, and five separate POSTs arrive in whatever
 * order the network feels like: "take the last chip off" then means different things at the two
 * ends, and a board that agreed when it was drawn settles differently when it is thrown. It was
 * not theoretical; it turned up the first time bets and undos were interleaved fast.
 *
 * A total has no order to get wrong. `clock` counts up so a send overtaken by a later one is
 * ignored rather than undoing it.
 *
 * `stack` is the order the chips went down in, kept here because undo is a thing about this
 * page and not about the table. And drawing before sending is what makes a tap feel like a tap:
 * the round trip is a tenth of a second at best, and a board that waits for it is a board that
 * did not hear you.
 */
let stack = [];
let clock = 0;
let sending = null;

function forgetPending() {
  clearTimeout(sending);
  sending = null;
  stack = [];
}

function myBets() {
  const bets = {};
  for (const one of stack) bets[one.face] = (bets[one.face] ?? 0) + one.amount;
  return bets;
}

const myStaked = () => stack.reduce((sum, one) => sum + one.amount, 0);

/**
 * Tells the bot what is on the board, once, after the tapping stops.
 *
 * A fifth of a second: under what anybody notices, over what a burst of taps takes — so six
 * taps are one request rather than six. Sent at once instead when the clock is nearly out,
 * because a throw that lands while a send is still waiting is a board that was never placed.
 */
function sendBets() {
  clearTimeout(sending);
  const soon = state.bettingEndsAt && state.bettingEndsAt - Date.now() < 3000;
  const post = () => { sending = null; z.send({ bets: myBets(), at: ++clock }); };
  if (soon) post();
  else sending = setTimeout(post, 200);
}

/// Ván nào đã nghe thấy tiếng xúc xắc rơi. Xem `drawBaucua`.
let heardFor = '';

/// The dice, while they are still in the air.
///
/// Cycled here rather than pushed: the bot has not decided what they are yet, and cannot, or
/// somebody reading the socket would know before the bowl stopped.
let tumbling = null;

function stopTumbling() {
  clearInterval(tumbling);
  tumbling = null;
}

function drawBaucua() {
  const bowl = $('bowl');
  const dice = $('dice');
  const note = $('bowl-note');
  const hidden = covered();

  // Cắt ba con theo chiều cao cái bát thật được chia, trước khi vẽ. Cái bát này cũng co được như
  // cái bát tài xỉu, và vì lý do y hệt.
  const room = bowl.getBoundingClientRect().height;
  if (room) dice.style.setProperty('--die', `${dieFor(room, 9, 46, 50)}px`);

  drawPlate(hidden);

  bowl.classList.toggle('shaking', state.phase === 'rolling');
  dice.replaceChildren();
  note.replaceChildren();
  for (const gone of bowl.querySelectorAll('.punters')) gone.remove();
  for (const gone of bowl.querySelectorAll('.corner')) gone.remove();
  bowl.append(cornerChips());

  // Three dice, always — an empty bowl before the first throw reads as something not loaded.
  const shown = state.dice || [state.faces[0], state.faces[1], state.faces[2]];
  const landed = !!state.dice && !hidden;
  const hits = landed ? shown.reduce((n, f) => ((n[f] = (n[f] ?? 0) + 1), n), {}) : {};

  shown.forEach((face, i) => {
    // Ringed when it is a face this person had money on. Ringing every die that matches its
    // own face rings all three, every time, which says nothing at all.
    const mine = (state.me && state.me.bets) || {};

    const die = document.createElement('div');
    die.className = 'die'
      + (state.phase === 'rolling' ? ' tumbling' : '')
      + (landed && mine[face] ? ' hit' : '');
    die.dataset.face = face;
    die.append(faceArt(face));
    dice.append(die);

    // One after another — three dice landing together is one event, landing in order is three.
    // Timed here rather than with `animation-delay`, because a delayed animation holds its
    // first frame and a die whose first frame is small is a die nobody can read until its turn.
    if (landed) setTimeout(() => die.classList.add('landing'), i * 120);
  });

  // And heard, once a round. `drawBaucua` runs on every push — a bowl the whole world is at
  // pushes several times a second — so a knock fired from here without a key on it is three dice
  // landing over and over for as long as the result is up.
  if (landed && heardFor !== `${state.gameId}:${state.round}`) {
    heardFor = `${state.gameId}:${state.round}`;
    for (let i = 0; i < shown.length; i++) landedSound(i * 0.12);
  }

  if (state.phase === 'rolling') {
    // Faces flicking past while the bowl shakes. Whatever is showing has nothing to do with
    // what comes up — the bot works that out when the shaking stops.
    stopTumbling();
    tumbling = setInterval(() => {
      for (const die of dice.children) {
        const face = state.faces[Math.floor(Math.random() * state.faces.length)];
        die.dataset.face = face;
        die.replaceChildren(faceArt(face));
      }
    }, 90);
  } else {
    stopTumbling();
  }

  if (hidden) {
    note.textContent = 'Xóc xong rồi — kéo đĩa ra xem';
  } else if (state.phase === 'paid') {
    const mine = (state.paid || []).find((one) => one.userId === z.viewer.id);
    if (mine && mine.change) {
      const said = document.createElement('b');
      said.textContent = `${change(mine.change)} vàng`;
      note.append(said);
    } else {
      note.textContent = mine ? 'Hoà' : 'Ván này bạn không đặt';
    }
  } else if (state.phase === 'rolling') {
    note.textContent = 'Đang xóc…';
  } else if (state.bettingEndsAt) {
    const clock = document.createElement('span');
    clock.className = 'clock';
    const many = (state.seats || []).length;
    note.append(
      document.createTextNode(state.world ? `Sòng thế giới · ${many} người · ` : 'Đặt cửa · '),
      clock);
  } else {
    note.textContent = state.me && myStaked()
      ? 'Xong thì bấm Xóc'
      : 'Chọn phần cược rồi chạm vào cửa';
  }

  $('bowl').append(punterRow(hidden));

  drawSongTabs();
  if (songTab === 'cau') drawHistory();
  else { drawBoard(); drawChips($('chips')); }
}

/**
 * Who else is at it, and what they have on.
 *
 * At a pavement table half the game is watching where everybody put their money — and on a phone
 * this is also what fills the space under the bowl that a table of one has no use for.
 *
 * While the result is still covered this shows **stakes and not winnings**, at both bowls. A row
 * of green and red under a lid that has not been lifted is the lid hiding nothing.
 */
function punterRow(hidden) {
  const row = document.createElement('div');
  row.className = 'punters';

  const seats = state.seats || [];
  if (seats.length < 2) return row;

  for (const one of seats) {
    const chip = document.createElement('span');
    chip.className = 'punter'
      + (one.id === z.viewer.id ? ' me' : '')
      + (!hidden && state.phase === 'paid' && one.change > 0 ? ' up' : '')
      + (!hidden && state.phase === 'paid' && one.change < 0 ? ' down' : '');
    chip.textContent = state.phase === 'paid' && one.change !== null && !hidden
      ? `${one.name} ${change(one.change)}`
      : `${one.name} ${one.staked ? gold(one.staked) : '·'}`;
    row.append(chip);
  }
  return row;
}

/**
 * Nặn: kéo một cái nắp ra khỏi cái nó đang che.
 *
 * Một chỗ, ba cái nắp. Cái đĩa bầu cua, cái nắp bát tài xỉu, và cái nắp trên từng con xúc xắc —
 * ba thứ trông khác nhau, cùng một động tác, và động tác ấy là thứ người ta tới đây để làm. Viết
 * ba lần là ba lần nó lệch đi một chút, mà lệch ở đây thì không ai báo lỗi: người ta chỉ thấy
 * "cái này nặn không đã bằng cái kia".
 *
 * Luật của nó nằm ở `clear()`: nắp chỉ đi khi hình chữ nhật của nó **không còn giao** với hình
 * chữ nhật của thứ nó che — đo bằng `getBoundingClientRect`, không phải bằng một con số ngưỡng
 * đoán mò. Bản đầu của cái đĩa bay mất sau 34px, tức là cắt cụt đúng cái động tác mà cả tính
 * năng này sinh ra để có.
 *
 * Ba lối ra, và cả ba đều phải có: kéo hở hết thì bay theo đà tay; chạm mà không kéo thì mở —
 * đó là một động tác trọn vẹn chứ không phải nửa cái; thả tay giữa chừng thì trượt về úp lại,
 * chưa lộ gì. Và nó tự mở sau `delay`, nhưng **không bao giờ trong lúc có ngón tay đang giữ**:
 * giật cái nắp khỏi bàn tay đang kéo nó thì còn tệ hơn là không cho kéo.
 *
 * `moving` được gọi mỗi lần ngón tay nhích, cho cái nắp nào **để lộ dần** cái nó che thay vì để
 * lộ một lúc: cái bát tài xỉu trượt tới đâu thì con xúc xắc ló ra tới đó, và cái tổng lớn dần
 * theo. Đó là chỗ duy nhất nặn thật sự có nghĩa — kéo chậm là được nặn, kéo nhanh là xong ngay,
 * và không ai bị bắt đợi.
 */
function dragOff(lid, under, opened, delay, moving) {
  let timer = 0;
  const later = () => { if (delay !== null) timer = setTimeout(open, delay); };
  let from = null;
  let moved = 0;
  let gone = false;

  // `fling` carries the drag on in the direction it was going. Without it the lid would run the
  // canned lift, which starts by sliding back the way it came — across what it just uncovered.
  const open = (fling) => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    lid.classList.remove('held');
    if (fling) { lid.style.transform = fling; lid.classList.add('gone'); }
    else { lid.classList.add('off'); }
    opened();
  };

  const clear = () => {
    const cap = lid.getBoundingClientRect();
    const box = under.getBoundingClientRect();
    if (!box.width) return true;
    return cap.right <= box.left || cap.left >= box.right
      || cap.bottom <= box.top || cap.top >= box.bottom;
  };

  lid.onpointerdown = (event) => {
    if (gone) return;
    from = { x: event.clientX, y: event.clientY };
    moved = 0;
    clearTimeout(timer);
    lid.classList.add('held');
    lid.setPointerCapture(event.pointerId);
  };

  lid.onpointermove = (event) => {
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    moved = Math.max(moved, Math.hypot(dx, dy));
    lid.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.025}deg)`;
    if (moving) moving();
    if (clear()) {
      from = null;
      open(`translate(${dx * 1.8}px, ${dy * 1.8}px) rotate(${dx * 0.05}deg)`);
    }
  };

  lid.onpointerup = () => {
    if (!from) return;
    from = null;
    lid.classList.remove('held');
    if (moved < 9) { open(); return; }
    lid.style.transform = '';
    later();
  };
  lid.onpointercancel = lid.onpointerup;

  later();
}

/**
 * Con xúc xắc to bằng bao nhiêu, ở cái bát cao chừng này.
 *
 * Cái bát là thứ **co được** trong cột: mọi hàng khác — dải tab, chiếu, hàng chip — đều cứng, nên
 * chỗ thiếu bao nhiêu là cái bát chịu bấy nhiêu. Nếu cỡ con xúc xắc là một con số trong stylesheet
 * thì cái bát không co được thật: nó bị kẹp ở `min-height`, và cả cột **tràn xuống đè lên hàng nút
 * ở đáy trang**. Đúng một dòng `#says` hiện lên là đủ để đẩy nó qua ngưỡng, nên nó lúc bị lúc
 * không — mà lúc không thì không ai đi tìm.
 *
 * Nên cỡ ấy là một hệ quả, và có hai điều kiện, lấy cái chặt hơn:
 *
 *   - cái đĩa phủ được ba con phải lọt trong bát: `√2·(2d + g) + đệm ≤ bát − 8`
 *   - khối ba con cộng chỗ chừa cho hàng chữ cũng phải lọt: `(2d + g) + chừa ≤ bát`
 */
function dieFor(bowlHeight, gap, biggest, below) {
  const room = bowlHeight - 20;
  if (!(room > 0)) return 20;
  const byDish = (room / Math.SQRT2 - gap) / 2;
  const byBowl = (bowlHeight - below - gap) / 2;
  // Sàn để rất thấp, và cố ý. Một cái sàn cao hơn chỗ cái bát thật có là một cái sàn đẩy ba con
  // tràn ra ngoài — tức là đúng cái nó sinh ra để tránh. Ở khung nhỏ tới mức ấy thì con xúc xắc
  // bé, nhưng bé còn đọc được, còn tràn thì vỡ.
  return Math.max(20, Math.min(biggest, Math.floor(Math.min(byDish, byBowl))));
}

/**
 * Cắt cái nắp cho vừa đúng cái nó che.
 *
 * Một hình tròn phủ kín được một hàng ngang rộng `w` cao `h` thì đường kính tối thiểu là
 * `√(w² + h²)`. Nên nó được **đo**, không phải gõ vào: gõ vào thì mỗi lần con xúc xắc to lên vài
 * pixel là một lần cái đĩa hở ra bốn góc — mà hở một góc thôi là cả cái nặn mất nghĩa, và không
 * ai báo lỗi chuyện đó, người ta chỉ biết kết quả trước khi kéo.
 *
 * Và không bao giờ cao hơn cái bát. Một cái đĩa tràn khỏi bát thì đè lên dải tab ngay bên dưới,
 * mà cái nó đè lên là cái người ta bấm để đi xem cầu.
 */
function fitLid(lid, under, bowl) {
  const room = bowl.getBoundingClientRect();
  let box = under.getBoundingClientRect();
  if (!box.width || !room.height) return;

  /**
   * Cái đĩa lớn nhất mà cái bát này chứa nổi. Lớn hơn thế thì nó tràn ra ngoài và đè lên dải tab
   * ngay dưới — mà cái nó đè lên là cái người ta bấm để đi xem cầu.
   */
  const most = Math.max(60, room.height - 8);

  /**
   * Và nếu cái lớn nhất ấy **vẫn không phủ hết ba con** thì ba con phải nhỏ lại.
   *
   * Đây là chỗ hai phép tính từng cãi nhau: `txDieSize` cắt con xúc xắc theo chiều cao cái bát,
   * `fitLid` cắt cái đĩa theo ba con, và hai bên chỉ cần lệch nhau vài pixel là cái đĩa hụt —
   * hụt thì hở góc, mà hở góc thì kết quả ló ra trước khi có ai kéo, và không ai báo lỗi chuyện
   * đó. Nên chỗ này không tin phép tính kia nữa: nó **đo**, và nếu không đủ thì tự thu ba con
   * lại rồi đo lại. Một vòng là đủ, vì thu theo đúng tỷ lệ còn thiếu.
   */
  const need = () => Math.hypot(box.width, box.height) + 12;
  if (need() > most) {
    const die = parseFloat(under.style.getPropertyValue('--die')) || box.width / 2;
    const want = Math.floor(die * (most - 12) / Math.hypot(box.width, box.height));
    under.style.setProperty('--die', `${Math.max(20, want)}px`);
    box = under.getBoundingClientRect();
  }

  const size = Math.min(Math.ceil(need()), most);
  lid.style.width = `${size}px`;
  lid.style.height = `${size}px`;

  // Và đặt lên **ba con**, không phải lên cái bát.
  //
  // Chỗ này từng căn giữa bằng `inset: 0; margin: auto`, tức là căn vào giữa cái bát. Nhưng ba
  // con không nằm giữa bát — dưới chúng còn cái tổng và dòng chữ, nên cả khối bị đẩy lên trên
  // chừng ba chục pixel. Cái đĩa vừa đúng cỡ để phủ ba con, nhưng nằm lệch xuống ba chục pixel,
  // thì **hở nguyên mép trên**: kết quả ló ra trước khi có ai kéo.
  //
  // `transform` để nguyên cho cú kéo — `dragOff` ghi thẳng vào đó — nên chỗ đứng phải nói bằng
  // `left`/`top`.
  lid.style.margin = '0';
  lid.style.right = 'auto';
  lid.style.bottom = 'auto';
  lid.style.left = `${(box.left + box.right) / 2 - room.left - size / 2}px`;
  lid.style.top = `${(box.top + box.bottom) / 2 - room.top - size / 2}px`;
}

/**
 * The plate, and lifting it.
 *
 * Dragged off, or tapped — both, because a drag on a frame this size is fiddly and a plate that
 * only answers to one of the two is a plate somebody prods at. It lifts itself after a moment
 * for whoever is not looking, so the next round is never waiting on one person's thumb.
 */
function drawPlate(hidden) {
  const plate = $('plate');
  plate.hidden = !hidden;
  if (!hidden) { plate.className = ''; plate.style.transform = ''; return; }

  // Đo lại mỗi lần vẽ, không chỉ lần dựng cái đĩa: khung đổi kích thước, hay ba con vừa bị cắt
  // nhỏ lại, mà cái đĩa giữ nguyên cỡ cũ thì nó hụt — và hụt là hở góc.
  fitLid(plate, $('dice'), $('bowl'));
  if (plate.dataset.round === String(state.round)) return;

  plate.dataset.round = String(state.round);
  plate.className = '';
  plate.style.transform = '';

  const round = state.round;

  // Off the dice, not off a few pixels: the plate goes when all three are showing and not
  // before. Redrawn when it is out of the way rather than under it, so the dice land into an
  // empty bowl and the gold moves onto a screen somebody is looking at.
  dragOff(plate, $('dice'), () => {
    if (lifted === round) return;
    lifted = round;
    setTimeout(() => { heldGold = null; render(); }, 380);
  }, squeezing ? NAN_MS : 0);
}

/**
 * Nặn lá vừa bốc.
 *
 * Cùng động tác với cái đĩa bầu cua và cùng một luật: kéo tới lúc **hở hết** thì lá mới lật, thả
 * tay giữa chừng thì lớp úp trượt về che lại. Khác một chỗ — ở đây chỉ có một lá và nó nhỏ, nên
 * lá được phóng to hẳn lên giữa bàn chứ không nặn ngay trong tay: nặn một hình chữ nhật rộng bốn
 * mươi tư pixel thì không ai nặn được gì.
 *
 * Nó **không chặn bàn**: người ta vẫn bấm được nút bên dưới, và sau ba giây nó tự mở rồi tự đi.
 * Một cái thú mà bắt cả bàn đợi thì không còn là cái thú.
 */
function drawPeek() {
  const box = $('peek');
  if (!peeked || !phom()) { box.hidden = true; box.replaceChildren(); return; }

  const once = `peek:${state.gameId}:${peeked.card}`;
  if (box.dataset.at === once) return;
  box.dataset.at = once;
  box.hidden = false;
  box.replaceChildren();

  const stage = document.createElement('div');
  stage.className = 'peek-card';

  const face = cardOf(peeked.card, 'big-card');
  const cover = document.createElement('div');
  cover.className = 'peek-cover';
  stage.append(face, cover);

  const note = document.createElement('div');
  note.className = 'peek-note';
  note.textContent = 'Kéo ra xem';

  const off = document.createElement('label');
  off.className = 'peek-off';
  const tick = document.createElement('input');
  tick.type = 'checkbox';
  tick.onchange = () => {
    setSqueezing(!tick.checked);
    if (tick.checked) { peeked = null; heldSplit = null; render(); }
  };
  off.append(tick, document.createTextNode('Không cần nặn nữa'));

  box.append(stage, note, off);

  let timer = 0;
  const open = () => {
    if (peeked && peeked.open) return;
    if (peeked) peeked.open = true;
    clearTimeout(timer);
    cover.classList.add('gone');
    note.textContent = nameOfCard(peeked ? peeked.card : 0);
    // Lá thật vào tay ngay khi đã lật — cái phải giấu là *trước khi* lật, không phải sau. Tấm
    // phóng to ở lại thêm một nhịp cho người ta nhìn rồi mới đi.
    heldSplit = null;
    render();
    setTimeout(() => { peeked = null; render(); }, 900);
  };

  // Kéo tới lúc mép lớp úp qua khỏi lá bài thì mới lật, y như cái đĩa.
  let from = null;
  let moved = 0;
  cover.onpointerdown = (event) => {
    from = { x: event.clientX, y: event.clientY };
    moved = 0;
    clearTimeout(timer);
    cover.classList.add('held');
    cover.setPointerCapture(event.pointerId);
  };
  cover.onpointermove = (event) => {
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    moved = Math.max(moved, Math.hypot(dx, dy));
    cover.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;

    const lid = cover.getBoundingClientRect();
    const card = face.getBoundingClientRect();
    const clear = lid.right <= card.left || lid.left >= card.right
      || lid.bottom <= card.top || lid.top >= card.bottom;
    if (clear) { from = null; open(); }
  };
  cover.onpointerup = () => {
    if (!from) return;
    from = null;
    cover.classList.remove('held');
    if (moved < 9) { open(); return; }
    cover.style.transform = '';
    timer = setTimeout(open, PEEK_MS);
  };
  cover.onpointercancel = cover.onpointerup;

  timer = setTimeout(open, PEEK_MS);
}

/// Which half of the sòng is showing.
function drawSongTabs() {
  const tabs = $('bc-tabs');
  tabs.replaceChildren();

  const many = (state.history || []).length;
  for (const [key, label] of [['board', 'Bàn cược'], ['cau', many ? `Soi cầu · ${many}` : 'Soi cầu']]) {
    const tab = document.createElement('button');
    tab.className = songTab === key ? 'on' : '';
    tab.textContent = label;
    tab.onclick = () => { songTab = key; render(); };
    tabs.append(tab);
  }

  $('board').hidden = songTab !== 'board';
  $('history').hidden = songTab !== 'cau';
  $('chips').hidden = songTab !== 'board';
}

/**
 * The run of past throws: six rows, one a face, newest on the left.
 *
 * The shape a real soi cầu board has, and it is the right one — a column is a throw and a row
 * is a face, so "cua has come up four times running" and "this throw was three of a kind" are
 * both things you see rather than count.
 *
 * The dice have no memory and nothing here predicts anything. Reading it is most of what people
 * do while they wait, and a game that hides it is a game pretending its players are somebody
 * else.
 */
function drawHistory() {
  const box = $('history');
  box.replaceChildren();

  const past = state.history || [];
  if (!past.length) {
    const none = document.createElement('div');
    none.className = 'cau-none';
    none.textContent = 'Chưa có ván nào. Xóc vài ván là có cầu để soi.';
    box.append(none);
    return;
  }

  // Which end is which, said once at the top, because a board of marks with no direction on it
  // is a board everybody reads backwards half the time.
  const head = document.createElement('div');
  head.className = 'cau-head';
  const newest = document.createElement('span');
  newest.className = 'cau-newest';
  newest.textContent = '\u2190 ván mới nhất';
  const many = document.createElement('span');
  many.className = 'cau-span';
  many.textContent = past.length + ' ván gần đây';
  head.append(newest, many);
  box.append(head);

  const grid = document.createElement('div');
  grid.className = 'cau-grid';

  for (const face of state.faces) {
    const row = document.createElement('div');
    row.className = 'cau-row';

    // The face and how often it has come up travel together and stay on screen while the rest
    // slides, so scrolling back through the run never loses which row is which.
    const tag = document.createElement('span');
    tag.className = 'cau-tag';
    tag.dataset.face = face;
    const icon = document.createElement('span');
    icon.className = 'cau-face';
    icon.append(faceArt(face));
    const count = document.createElement('span');
    count.className = 'cau-count';
    tag.append(icon, count);
    row.append(tag);

    let total = 0;
    past.forEach((dice, index) => {
      const hits = dice.filter((one) => one === face).length;
      total += hits;

      const cell = document.createElement('span');
      cell.className = 'cau-cell'
        + (hits ? ' hit' : '')
        + (hits === 2 ? ' two' : '')
        + (hits === 3 ? ' three' : '')
        + (index === 0 ? ' now' : '');
      if (hits > 1) cell.textContent = String(hits);
      row.append(cell);
    });

    count.textContent = String(total);
    grid.append(row);
  }

  box.append(grid);

  // What the two darker colours mean. Three marks of the same face is the moment of the game,
  // and a board that does not say so is a board somebody has to work out.
  const key = document.createElement('div');
  key.className = 'cau-key';
  for (const [cls, text] of [['', 'ra 1'], ['two', 'ra 2'], ['three', 'ra 3']]) {
    const one = document.createElement('span');
    one.className = 'cau-key-one';
    const dot = document.createElement('i');
    dot.className = 'cau-cell hit ' + cls;
    one.append(dot, document.createTextNode(text));
    key.append(one);
  }
  box.append(key);
}

function drawBoard() {
  const board = $('board');
  board.replaceChildren();

  const mine = state.me ? myBets() : {};
  // Nothing lights up while the plate is on. The mat knowing the answer before the bowl does is
  // the same spoiler by another route.
  const hits = state.dice && !covered()
    ? state.dice.reduce((n, f) => ((n[f] = (n[f] ?? 0) + 1), n), {})
    : {};

  for (const face of state.faces) {
    const tile = document.createElement('button');
    tile.className = 'tile'
      + (mine[face] ? ' has' : '')
      + (hits[face] ? ' won' : '');
    tile.dataset.face = face;

    tile.append(faceArt(face));

    const name = document.createElement('div');
    name.className = 'tile-name';
    name.textContent = FACE_LABEL[face] || face;

    // What is on this face. Everybody's total, and yours picked out of it — half the game is
    // watching where the rest of the table put their money.
    const on = document.createElement('div');
    on.className = 'tile-on';
    // Everybody's, adjusted by whatever this page has done since the bot last spoke.
    const theirs = (state.me && state.me.theirs) || {};
    const ahead = (mine[face] || 0) - (theirs[face] || 0);
    const all = ((state.board || {})[face] || 0) + ahead;
    if (mine[face]) {
      const ours = document.createElement('span');
      ours.className = 'tile-mine';
      ours.textContent = gold(mine[face]);
      on.append(ours);
      if (all > mine[face]) on.append(document.createTextNode(` / ${gold(all)}`));
    } else if (all) {
      on.textContent = gold(all);
    }

    tile.append(name, on);

    if (hits[face]) {
      const many = document.createElement('span');
      many.className = 'tile-hits';
      many.textContent = `×${hits[face]}`;
      tile.append(many);
    }

    const canBet = state.phase === 'betting' && !!state.me;
    tile.disabled = !canBet;
    if (canBet) {
      tile.onclick = () => {
        const left = state.gold - myStaked();
        if (chip > left) {
          say(left > 0 ? `Chỉ còn ${gold(left)} vàng để đặt` : 'Hết vàng để đặt rồi');
          return;
        }
        // Drawn before it is sent. The round trip is a tenth of a second at best and a tap that
        // waits for it feels like a board that did not hear you.
        stack.push({ face, amount: chip });
        say('');
        drawBaucua();
        drawButtons();
        sendBets();
      };
    }

    board.append(tile);
  }
}

/// The chips, under whichever mat asked for them. The ladder is the same at both bowls on
/// purpose: they sit side by side on one menu and share one purse, and two ladders would be two
/// things to learn about one pile of gold.
function drawChips(row) {
  row.replaceChildren();

  const chips = state.chips || [1000];
  const left = state.gold - myStaked();
  if (!chips.includes(chip)) chip = chips[0];

  // The largest one they can still afford, chosen for them when the one they had picked has
  // gone out of reach — a selected chip that cannot be put down is a board that ignores taps.
  if (chip > left) chip = [...chips].reverse().find((one) => one <= left) ?? chips[0];

  for (const one of chips) {
    const el = document.createElement('button');
    el.className = 'chip-pick' + (chip === one ? ' on' : '');
    el.textContent = gold(one);
    el.disabled = state.phase !== 'betting' || one > left;
    el.onclick = () => { chip = one; say(''); drawChips(row); };
    row.append(el);
  }
}

/// The clock on the bowl, and the one on the felt. Both are drawn from a moment rather than
/// counted down, so a phone that was asleep comes back to the right number.
function betTick() {
  if (!state || !state.bettingEndsAt) return;
  // Either bowl. One clock, two mats — and a selector naming only one of them is a tài xỉu
  // window that counts down by staying still.
  const clock = document.querySelector('#bowl-note .clock, #tx-note .clock');
  if (!clock) return;

  const left = Math.max(0, Math.round((state.bettingEndsAt - Date.now()) / 1000));
  clock.textContent = `${left}s`;
  clock.classList.toggle('low', left <= 5);
}

const FACE_LABEL = {
  bau: 'Bầu', cua: 'Cua', tom: 'Tôm', ca: 'Cá', ga: 'Gà', nai: 'Nai',
};

/// Draws everything from whatever `state` currently holds.
///
/// A function of its own rather than the body of the state callback, because pressing a tab
/// redraws the same state a different way — and a screen that can only be redrawn when the
/// server says something is a screen whose tabs do nothing until somebody else plays a card.
function render() {
  clearInterval(ticking);
  // Drawn first and drawn always. What is in the purse does not depend on which screen is up,
  // and the bar arriving a beat after everything else would push the whole page down.
  drawPurse();

  // An advertisement is the thing you are looking at instead of the thing you wanted, so it
  // takes the whole frame and nothing else is drawn behind it.
  const watching = !!(state && state.adsEndsAt);
  const deciding = !!(state && state.phase === 'choosing');

  // Three boards, and none of them is a mood of another. A card table seen from your chair, a
  // mat seen from above, and a bát with one number under it have nothing in common but the frame
  // round them — bầu cua stakes on a *face* and tài xỉu on the *total*, so even the two dice
  // games do not lay out alike.
  const dice = !!(state && state.kind === 'baucua');
  const sicbo = !!(state && state.kind === 'taixiu');
  const chessy = isBoardGame(state);

  $('ads').hidden = !watching;
  $('menu').hidden = watching || !deciding || screen !== 'play';
  $('browse').hidden = watching || !deciding || screen === 'play';
  $('baucua').hidden = watching || deciding || !dice;
  $('taixiu').hidden = watching || deciding || !sicbo;
  $('boardgame').hidden = watching || deciding || !chessy;
  $('table').hidden = watching || deciding || dice || sicbo || chessy;
  $('buttons').hidden = watching;

  if (watching) {
    drawAds();
    $('tabs').hidden = true;
    // A quarter of a second rather than a whole one: a ten second clock that steps in seconds
    // spends a tenth of its life showing the wrong number.
    ticking = setInterval(tick, 250);
    return;
  }

  drawTabs();

  if (deciding) {
    stopTumbling();
    txIdle();
    if (screen === 'play') drawMenu(); else drawBrowse();
    drawButtons();
    return;
  }

  if (chessy) {
    txIdle();
    drawBoardGame();
    drawButtons();
    if (state.phase === 'playing') { boardTick(); ticking = setInterval(boardTick, 250); }
    return;
  }

  if (sicbo) {
    drawTaixiu();
    drawButtons();
    if (state.bettingEndsAt) { betTick(); ticking = setInterval(betTick, 250); }
    return;
  }

  if (dice) {
    txIdle();
    drawBaucua();
    drawButtons();
    if (state.bettingEndsAt) { betTick(); ticking = setInterval(betTick, 250); }
    return;
  }

  txIdle();
  drawFeltTop();
  drawSeats();
  drawPile();
  drawHand();
  drawBar();
  drawButtons();
  drawResult();
  drawPeek();

  if (state.phase === 'playing') {
    tick();
    ticking = setInterval(tick, 250);
  }
}

z.onState((next) => {
  // The hand carried forward, and this is the one thing about this widget worth reading twice.
  //
  // The bot sends the table to everybody and then each hand to its owner — two pushes, in that
  // order, and both land here. The first has no `me` in it, so taking each push as it comes
  // would empty a player's hand for the tenth of a second between them, on every card anybody
  // at the table played.
  //
  // So a push with no hand in it does not mean there is no hand. It means this one was for
  // everybody.
  if (!next.me && state && state.me && state.gameId === next.gameId) {
    // Ở hai cái bát thì mang sang **cái ghế**, không mang sang **bàn cược**. Ván mới là bàn cược
    // mới; bê nguyên cái cũ sang thì mặt chiếu hiện tiền của ván trước như thể nó đang nằm đó.
    next.me = diceGame(next) && state.round !== next.round
      ? { ...state.me, bets: {}, staked: 0, theirs: {} }
      : state.me;
  }

  // Cards picked up out of a hand that has since been dealt again are not cards.
  const held = new Set((next.me && next.me.hand) || []);
  picked = new Set([...picked].filter((card) => held.has(card)));

  // Lá vừa bốc lên, hoặc vừa ăn được.
  //
  // Nhận ra bằng cách so tay bài với lần đẩy trước — bot không gửi riêng "lá này vừa về", và
  // đúng ra là không cần: tay dài thêm đúng một lá thì lá thừa ra chính là nó. Chỉ nặn lá của
  // *mình*, chỉ ở phỏm, và chỉ khi vừa xong nửa lấy bài của lượt mình.
  const seated = next.kind === 'phom' && next.me && Array.isArray(next.me.hand) ? next.me : null;
  if (seated) {
    const before = next.gameId === (state && state.gameId) ? heldHand : null;
    if (before && next.step === 'throw' && next.turn === seated.seat
      && seated.hand.length === before.length + 1) {
      const fresh = seated.hand.filter((card) => !before.includes(card));
      if (fresh.length === 1) {
        justTook = fresh[0];
        // Chỉ nặn lá **bốc từ nọc**.
        //
        // Ăn thì lá ấy vừa nằm ngửa giữa bàn, cả bàn đã nhìn thấy nó, và chính mình vừa bấm nút
        // để lấy đúng nó. Bắt nặn một lá mình đã biết là bắt làm một thao tác thừa đúng vào lúc
        // đang vội.
        // `me` không mang theo danh sách đã ăn — cái ấy ở trên ghế, vì nó công khai.
        const ate = ((next.seats[seated.seat] || {}).eaten || []).includes(fresh[0]);
        if (squeezing && !ate) {
          peeked = { card: fresh[0], open: false };
          // Chốt lại tay bài như nó vừa lúc trước — `heldHand` ở đây vẫn là tay cũ, vì nó chỉ
          // được ghi đè ở dưới.
          heldSplit = { hand: [...before], melds: heldMelds || [], points: heldPoints ?? null };
        }
      }
    }
    heldHand = [...seated.hand];
    heldMelds = (seated.melds || []).map((meld) => [...meld]);
    heldPoints = seated.points ?? null;

    // Nặn xong lượt nào là chuyện của lượt ấy. Bàn nhích sang người khác mà cái lá phóng to vẫn
    // treo giữa màn hình thì nó không còn là "lá bạn vừa bốc" nữa — nó là một tấm bìa che mất
    // cái bàn đang chạy.
    if (next.step !== 'throw' || next.turn !== seated.seat) {
      peeked = null;
      justTook = null;
      heldSplit = null;
    }
  } else {
    heldHand = null;
    peeked = null;
  }

  // What the purse said before this throw settled it.
  //
  // Kept from the push *before* the payout, because the plate has to keep showing it: the gold
  // moves when the dice land and the dice are under a plate. A number that had already changed
  // above a plate hiding the dice would be a plate hiding nothing.
  if (diceGame(next)) {
    if (next.phase === 'rolling' && state) heldGold = state.gold;
    if (next.phase === 'betting') heldGold = null;

    // Tiếng xóc, bắt từ **lúc trạng thái đổi** chứ không phải từ trong một hàm vẽ. Hàm vẽ chạy
    // lại mỗi lần đẩy, mà một ván xóc có mấy lần đẩy — nên tiếng phát ra ở đó là tiếng xóc chồng
    // lên tiếng xóc. Cái bát chỉ bắt đầu lắc đúng một lần, nên tiếng cũng chỉ nổ đúng một lần.
    if (next.phase === 'rolling' && (!state || state.phase !== 'rolling'
      || state.gameId !== next.gameId)) {
      rattle(next.rollMs || 1700);
    }
  } else {
    heldGold = null;
  }

  // Whose board is whose.
  //
  // While a betting window is open this page owns its own chips — it drew them, and taking them
  // back from the bot in the middle of somebody tapping would make chips flicker. It hands the
  // board over when the round turns, and when the bot refuses one: at that point what is drawn
  // is a lie, and the truth is whatever the bot says it is holding.
  if (diceGame(next)) {
    const mine = next.me;
    // Cùng cái bàn ấy, **và cùng cái ván ấy**.
    //
    // Hai lỗi đã nằm ở đúng dòng này. Nó từng viết `state.kind === 'baucua'`, và ở bàn tài xỉu
    // thì câu ấy luôn sai — nên mọi push trong lúc đang đặt đều xoá sạch chip trên trang, mà bot
    // thì vẫn giữ đủ: "bấm đặt cái là mất, mà backend vẫn ghi nhận".
    //
    // Rồi nó thiếu số ván. Cửa đặt ván sau mở ra cũng là `phase === 'betting'` ở cùng một bàn,
    // nên `turned` sai và trang **giữ nguyên chip của ván trước**. Không chỉ vẽ sai: `myBets()`
    // đọc từ chính cái chồng chip ấy, nên chạm thêm một cái là gửi đi nguyên bàn cược cũ và đặt
    // lại nó bằng tiền thật. Ván là ván nào phải nằm trong câu hỏi.
    const turned = next.phase !== 'betting'
      || !(state && diceGame(state) && state.gameId === next.gameId
        && state.round === next.round);
    if (turned) {
      forgetPending();
      // Bàn cược của bot là bàn thật, nên lúc vừa tới — ván mới, bàn mới, hay quay lại giữa
      // chừng — trang lấy nguyên nó làm chỗ bắt đầu. Ván mới thì nó rỗng; quay lại giữa cửa đặt
      // thì nó là mấy đồng mình đã bỏ xuống, và không thấy chúng là tưởng mất.
      stack = Object.entries((mine && mine.theirs) || {}).map(([face, amount]) => ({ face, amount }));
    } else if (next.says) {
      // Refused. What is drawn is now a lie, so the bot's board is taken as it stands — one
      // entry a face, which makes undo coarse for a moment and truthful immediately.
      forgetPending();
      stack = Object.entries((mine && mine.theirs) || {}).map(([face, amount]) => ({ face, amount }));
    }
  } else if (stack.length || sending) {
    forgetPending();
  }

  // A different table, or the same one dealt again. Either way whatever was announced belonged
  // to the hand before it, and announcing it a second time is telling somebody they won twice.
  const dealtAgain = state && state.phase === 'over' && next.phase === 'playing';
  if (dealtAgain || next.gameId !== floatedFor) {
    floated = new Set();
    counted = new Set();
    floatedFor = next.gameId;
    // A new hand is a new result, so somebody who had waved the last one away is shown this one.
    watchingRest = null;
  }

  // Back at the lobby is back at the top of it. Landing on "cược bao nhiêu?" after a table has
  // just ended is being asked a question about something that is no longer happening.
  if (next.phase !== 'choosing') step = null;

  // The errand is over the moment the gold lands, so it does not leave somebody looking at the
  // way to get gold they have just got.
  if (step === 'gold' && state && next.gold > state.gold) step = null;

  state = next;
  // Whatever the bot has to say about what was just asked of it — a stake somebody has not got,
  // a table that filled up while they were reading it. There is nowhere else it could go: a
  // widget cannot open a dialog, and a refusal that appears nowhere is a button that broke.
  say(next.says || '');
  render();
});

// Something on the screen before the first push arrives.
//
// A frame that opens empty and fills in a moment later reads as a frame that failed to open —
// and on a phone waking up a socket, that moment is long enough to notice.
say('Đang mở bàn…');

// The size this wants. The frame clamps it to something that always leaves its own title bar
// showing — which is what stops a widget covering the app with something that looks like the
// app — so this is a request rather than a size.
//
// Taller than it was, by thirty. Cái bát mọc lên: cái đĩa nặn giờ là một cái đĩa **tròn** phải
// phủ kín ba con xúc xắc, mà một hình tròn phủ được một hàng ngang thì cao đúng bằng chiều rộng
// của hàng ấy. Ba mươi pixel là chỗ cho việc đó và không hơn — cái khung này nổi lên trên một
// cuộc trò chuyện, và mỗi pixel nó lấy là một pixel của cuộc trò chuyện ấy.
z.setSize(390, 570);
z.ready();
