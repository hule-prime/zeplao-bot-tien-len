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

function beats(mine, theirs) {
  if (!mine) return false;
  if (!theirs) return true;
  if (mine.kind === theirs.kind && mine.size === theirs.size) return mine.top > theirs.top;

  const lone2 = theirs.kind === 'single' && rankOf(theirs.top) === TWO;
  const pair2 = theirs.kind === 'pair' && rankOf(theirs.top) === TWO;
  const three = (s) => s.kind === 'pairs_run' && s.pairs === 3;
  const four = (s) => s.kind === 'pairs_run' && s.pairs === 4;

  if (three(mine)) return lone2;
  if (mine.kind === 'quad') return lone2 || pair2 || three(theirs);
  if (four(mine)) return lone2 || pair2 || three(theirs) || theirs.kind === 'quad';
  return false;
}

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

function cardOf(card, extra) {
  const el = document.createElement('div');
  el.className = 'card' + (suitOf(card) >= 2 ? ' red' : '') + (extra ? ' ' + extra : '');

  const pip = document.createElement('span');
  pip.className = 'pip';
  const rank = document.createElement('b');
  rank.textContent = RANKS[rankOf(card)];
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

  // What going out was worth. Shown the moment they went out rather than at the end, because
  // that is the moment it was won — waiting for the last two to finish makes the number a
  // summary of something that happened rather than the thing happening.
  if (typeof seat.won === 'number' && seat.won !== 0) {
    const money = document.createElement('div');
    money.className = 'seat-gold ' + (seat.won > 0 ? 'up' : 'down');
    money.textContent = change(seat.won);
    chair.append(money);

    const once = `${state.gameId}:${seat.seat}`;
    if (announce && !floated.has(once)) {
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

  for (const card of state.pile.cards) box.append(cardOf(card));

  const who = document.createElement('b');
  who.textContent = state.pile.byName;
  const say = SHAPES[state.pile.kind];
  note.append(who, document.createTextNode(say ? ` · ${say(state.pile.cards.length)}` : ''));
}

// ---- your own hand -------------------------------------------------------------------------

function drawHand() {
  const box = $('hand');
  box.replaceChildren();

  const cards = (state && state.me && state.me.hand) || [];
  if (!cards.length) return;

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

  for (const card of cards) {
    const el = cardOf(card, picked.has(card) ? 'up' : '');
    if (state.opensWith === card) el.classList.add('opens');
    el.onclick = () => tap(card);
    fan.append(el);
  }
  box.append(fan);
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

  if (state.kind === 'baucua') {
    button(state.world ? 'Thoát' : 'Rời sòng', 'quiet',
      (el) => { el.disabled = true; z.send({ leave: true }); });
    if (!state.me) return;

    const undo = button('Hoàn tác', state.world ? 'primary' : '', () => z.send({ undo: true }));
    undo.disabled = state.phase !== 'betting' || !state.me.canUndo;

    // No throw button at the world sòng. It runs on its own clock, and a button that hurried it
    // along would be one person at it deciding for everybody else.
    if (state.world) return;

    const throwIt = button(
      state.phase === 'rolling' ? 'Đang xóc…' : state.phase === 'paid' ? 'Ván sau…' : 'Xóc',
      'primary', (el) => { el.disabled = true; z.send({ roll: true }); });
    throwIt.disabled = state.phase !== 'betting' || !state.me.staked;
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

/// Out of cards, with the table still going. Their place is taken and their gold is paid — what
/// is left is somebody else's game.
function finishedHere() {
  return !!state && state.phase === 'playing' && !!state.me && state.me.hand.length === 0;
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

function drawResult() {
  const box = $('result');
  box.replaceChildren();

  // Their own result, as soon as they have one — not when the last two have finished arguing
  // over a pair of threes. Coming first and then being made to sit and watch is the game
  // holding on to somebody it has finished with.
  const early = finishedHere() && watchingRest !== state.gameId;
  box.hidden = !state || (state.phase !== 'over' && !early);
  if (box.hidden) return;

  if (early) { drawFinished(box); return; }

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
    place.textContent = one.place;

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
  });
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
  amount.textContent = state ? gold(state.gold) : '…';

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
  const moved = purseWas === null ? 0 : state.gold - purseWas;
  purseWas = state.gold;
  if (moved) {
    amount.classList.remove('moved');
    void amount.offsetWidth;          // so the same class re-animates rather than sitting still
    amount.classList.add('moved');
    // Over the number rather than over the row it is in, so it reads as that number changing.
    floatGold(amount, moved);
  }
}

/// What one person sees the moment they go out, while the rest play on.
function drawFinished(box) {
  const seat = state.seats[state.me.seat];
  const mine = (state.paid || []).find((one) => one.userId === z.viewer.id);
  const place = (mine && mine.place) || (seat && seat.place) || '';

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
}

/// Which question is being asked. Nothing at all on the first screen, which is two ways in.
let step = null;

/// What tomorrow is worth, for the one line that mentions it before the state has said so.
const DAILY = 10000;

/// The answer to the one question that is asked before another one is. Everything else is a tap
/// that does the thing, so nothing else has to be remembered between screens.
let seatsWanted = 4;

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
      () => { step = 'tienlen'; render(); }));

    body.append(bigCard('⚄', 'Bầu cua tôm cá',
      purse < cheapest ? `Cần ${gold(cheapest)} vàng` : 'Đặt cửa, ba con xúc xắc',
      '', purse >= cheapest,
      () => { step = 'baucua'; render(); }));

    return;
  }

  if (step === 'tienlen') {
    body.append(stepHead('Tiến lên miền nam', 'Chơi kiểu nào?', null));
    body.append(pick('Đấu với máy', `cược ${gold(state.botStake)}`,
      purse >= state.botStake, () => { step = 'solo'; render(); }));
    body.append(pick('Tạo bàn', 'mời cả thế giới',
      purse >= cheapest, () => { step = 'open'; render(); }));
    body.append(stepNote(purse < state.botStake
      ? `Đấu với máy cần ${gold(state.botStake)} vàng.`
      : 'Bàn tự mở ra cho mọi nhóm — ai cũng tìm thấy và vào được.'));
    return;
  }

  if (step === 'baucua') {
    body.append(stepHead('Bầu cua tôm cá', 'Chơi kiểu nào?', null));
    body.append(pick('Sòng thế giới', 'lúc nào cũng đang xóc',
      purse >= cheapest, () => z.send({ baucua: 'world' })));
    body.append(pick('Chơi một mình', 'xóc lúc nào tuỳ bạn',
      purse >= cheapest, () => z.send({ baucua: 'solo' })));
    body.append(stepNote('Đặt vào cửa nào, cửa đó ra mấy con thì ăn bấy nhiêu lần. '
      + 'Không ra thì mất phần đặt. Sòng thế giới là một sòng duy nhất, ai cũng vào được, '
      + 'xóc liên tục theo đồng hồ.'));
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
    body.append(stepHead('Tạo bàn', 'Bàn mấy người?', 'tienlen'));
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

    body.append(stepHead('Cược bao nhiêu?', `Bàn ${seatsWanted} người`, 'open'));
    for (const one of bets) {
      body.append(pick(`${gold(one)} vàng`,
        purse < one ? 'thiếu vàng' : `nhất ăn ${gold(one)}`,
        purse >= one,
        () => z.send({ open: seatsWanted, stake: one })));
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
    z.send({ open: seatsWanted, stake: asked() });
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
    names.textContent = (room.kind === 'baucua' ? '⚄ ' : '♠ ') + room.names.join(', ');
    // The stake before the seats. It is the first thing worth knowing about a table and the
    // only one that can refuse you.
    const bet = document.createElement('span');
    bet.className = 'row-seats';
    bet.textContent = room.kind === 'baucua' ? 'bầu cua' : gold(room.stake);
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

function say(text) { $('says').textContent = text || ''; }

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

/// Which chip is being put down. Theirs and local — the table has no opinion about it.
let chip = null;

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

  bowl.classList.toggle('shaking', state.phase === 'rolling');
  dice.replaceChildren();
  note.replaceChildren();
  for (const gone of bowl.querySelectorAll('.punters')) gone.remove();

  // Three dice, always — an empty bowl before the first throw reads as something not loaded.
  const shown = state.dice || [state.faces[0], state.faces[1], state.faces[2]];
  const landed = !!state.dice;
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

  if (state.phase === 'paid') {
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
    note.textContent = state.me && state.me.staked
      ? 'Xong thì bấm Xóc'
      : 'Chọn phần cược rồi chạm vào cửa';
  }

  // Who else is at it, and what they have on. At a pavement table half the game is watching
  // where everybody put their money — and on a phone this is also what fills the space under
  // the bowl that a solo table has no use for.
  const others = (state.seats || []).filter((one) => one.id !== z.viewer.id);
  if (others.length) {
    const row = document.createElement('div');
    row.className = 'punters';
    for (const one of (state.seats || [])) {
      const chip = document.createElement('span');
      chip.className = 'punter'
        + (one.id === z.viewer.id ? ' me' : '')
        + (state.phase === 'paid' && one.change > 0 ? ' up' : '')
        + (state.phase === 'paid' && one.change < 0 ? ' down' : '');
      chip.textContent = state.phase === 'paid' && one.change !== null
        ? `${one.name} ${change(one.change)}`
        : `${one.name} ${one.staked ? gold(one.staked) : '·'}`;
      row.append(chip);
    }
    $('bowl').append(row);
  }

  drawBoard();
  drawChips();
}

function drawBoard() {
  const board = $('board');
  board.replaceChildren();

  const mine = (state.me && state.me.bets) || {};
  const hits = state.dice
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
    const all = (state.board || {})[face] || 0;
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
    if (canBet) tile.onclick = () => z.send({ bet: { face, amount: chip } });

    board.append(tile);
  }
}

function drawChips() {
  const row = $('chips');
  row.replaceChildren();

  const chips = state.chips || [1000];
  const left = state.gold - ((state.me && state.me.staked) || 0);
  if (!chips.includes(chip)) chip = chips[0];

  // The largest one they can still afford, chosen for them when the one they had picked has
  // gone out of reach — a selected chip that cannot be put down is a board that ignores taps.
  if (chip > left) chip = [...chips].reverse().find((one) => one <= left) ?? chips[0];

  for (const one of chips) {
    const el = document.createElement('button');
    el.className = 'chip-pick' + (chip === one ? ' on' : '');
    el.textContent = gold(one);
    el.disabled = state.phase !== 'betting' || one > left;
    el.onclick = () => { chip = one; render(); };
    row.append(el);
  }
}

/// The clock on the bowl, and the one on the felt. Both are drawn from a moment rather than
/// counted down, so a phone that was asleep comes back to the right number.
function betTick() {
  if (!state || !state.bettingEndsAt) return;
  const clock = document.querySelector('#bowl-note .clock');
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

  // Two games, two boards. A card table seen from your chair and a mat seen from above have
  // nothing in common but the frame round them, so they are two sections rather than one in two
  // moods.
  const dice = !!(state && state.kind === 'baucua');

  $('ads').hidden = !watching;
  $('menu').hidden = watching || !deciding || screen !== 'play';
  $('browse').hidden = watching || !deciding || screen === 'play';
  $('baucua').hidden = watching || deciding || !dice;
  $('table').hidden = watching || deciding || dice;
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
    if (screen === 'play') drawMenu(); else drawBrowse();
    drawButtons();
    return;
  }

  if (dice) {
    drawBaucua();
    drawButtons();
    if (state.bettingEndsAt) { betTick(); ticking = setInterval(betTick, 250); }
    return;
  }

  drawFeltTop();
  drawSeats();
  drawPile();
  drawHand();
  drawBar();
  drawButtons();
  drawResult();

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
  if (!next.me && state && state.me && state.gameId === next.gameId) next.me = state.me;

  // Cards picked up out of a hand that has since been dealt again are not cards.
  const held = new Set((next.me && next.me.hand) || []);
  picked = new Set([...picked].filter((card) => held.has(card)));

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
// Shorter than it was. The hand used to take two rows, and the felt above it was given the
// height for that whether the row was there or not; one row of thirteen gave sixty pixels back
// and a shorter frame covers less of the conversation it is floating over.
z.setSize(390, 540);
z.ready();
