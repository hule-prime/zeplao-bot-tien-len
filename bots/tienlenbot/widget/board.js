// Cờ vua và cờ tướng: một màn cho cả hai.
//
// Đây là chỗ **ngược** với hai cái bát. Bầu cua và tài xỉu tách ra làm hai màn vì chúng đặt cược
// vào hai thứ khác nhau — một cái vào con vật, một cái vào con số — nên không có gì để chung.
// Hai bàn cờ thì ngược hẳn: khác nhau ở mọi quân và mọi luật, mà **giống nhau ở toàn bộ cách
// ngồi**. Hai người, đi luân phiên, một lưới ô, chạm quân rồi chạm ô. Cái khác nhau nằm gọn
// trong ba con số và một hàm vẽ quân, nên nó là một màn với ba con số.
//
// Nạp trước `tienlen.js`, cùng lý do với `taixiu.js`: `render()` bên kia gọi tới mấy hàm ở đây,
// mà mọi thứ file này đọc của bên kia đều chỉ đọc trong lòng hàm.

/// Hai bàn cờ, khác nhau đúng ở đây.
const BOARD_KIND = {
  chess: { files: 8, ranks: 10 - 2, ratio: '1', dark: 8 },
  xiangqi: { files: 9, ranks: 10, ratio: '9 / 10', dark: 8 },
};

const isBoardGame = (what) => !!what && !!BOARD_KIND[what.kind];

/// Chữ tắt của loại quân, cùng thứ tự với bit trong con số bot gửi sang. Một bảng, không hai —
/// bot tách bit thế nào thì trang tách y thế.
const CHESS_LETTER = ' PNBRQK';

/// Mặt quân cờ tướng. Hai bên viết khác chữ cho cùng một quân, và đó là bàn cờ tướng thật: người
/// chơi nhận ra quân bằng đúng những chữ này, không phải bằng hình.
const XIANGQI_FACE = [
  null,
  ['帥', '將'], ['仕', '士'], ['相', '象'],
  ['傌', '馬'], ['俥', '車'], ['炮', '砲'], ['兵', '卒'],
];

/// Tên quân bằng tiếng Việt, cho dòng chữ dưới bàn. Chữ Hán đọc được thì đọc; không thì vẫn phải
/// có một chỗ nói ra quân vừa ăn được là quân gì.
const XIANGQI_NAME = [null, 'Tướng', 'Sĩ', 'Tượng', 'Mã', 'Xe', 'Pháo', 'Tốt'];
const CHESS_NAME = [null, 'Tốt', 'Mã', 'Tượng', 'Xe', 'Hậu', 'Vua'];

/// Ô đang chọn, và ván nào của bàn nào. Khoá theo ván vì một nước vừa đi xong là mọi lựa chọn cũ
/// hết nghĩa — quân ấy có khi không còn ở đó nữa.
let chosen = null;
let pickedAt = '';

/// Nước đang chờ chọn quân phong. Chỉ cờ vua có.
let promoting = null;

const boardKey = () => (state ? `${state.gameId}:${(state.last || {}).to ?? 'x'}:${state.turn}` : '');

/// Loại và màu, tách ra từ đúng con số bot gửi.
const kindOfPiece = (piece) => piece & 7;
const sideOfPiece = (piece) => piece & 8;

/// Bên mình cầm. Người xem thì lấy bên đi trước, để bàn cờ có một chiều nhất định.
function mySide() {
  if (state && state.me && state.me.side !== undefined && state.me.side !== null) return state.me.side;
  return 0;
}

/**
 * Bàn cờ có bị lật không.
 *
 * Ai cũng ngồi ở phía mình. Đó không phải chiều chuộng: ở cờ, "quân của tôi tiến lên trên" là
 * cách cả bàn cờ được đọc — hướng tốt đi, hướng đường chéo mở ra, phía nào là hậu phương. Bắt
 * người cầm quân đen đọc ngược là bắt họ dịch từng nước trong đầu.
 */
const flipped = () => mySide() === BOARD_KIND[state.kind].dark;

/// Ô số mấy, sau khi lật. Trang chỉ vẽ; ô gửi đi vẫn là ô thật.
function shownAt(index) {
  const { files, ranks } = BOARD_KIND[state.kind];
  return flipped() ? files * ranks - 1 - index : index;
}

/// Nước đi hợp lệ **từ ô này**, theo đúng danh sách bot gửi. Trang không tự nghĩ ra nước nào.
function movesFrom(at) {
  return ((state.me && state.me.moves) || []).filter((one) => one.from === at);
}

function drawBoardGame() {
  // Ván mới, hay vừa có ai đi: bỏ ô đang chọn. Quân ấy có khi không còn ở đó.
  if (pickedAt !== boardKey()) { pickedAt = boardKey(); chosen = null; promoting = null; }

  drawBoardSeat($('board-them'), them());
  drawGrid();
  drawBoardSeat($('board-me'), state.seats[state.me ? state.me.seat : 0]);
  drawBoardBar();
  drawPromo();
  drawBoardOver();
}

/// Người ngồi đối diện. Ở bàn hai người thì đó là "người không phải mình" — và với người đang
/// xem thì là ghế đầu tiên.
function them() {
  const mine = state.me ? state.me.seat : -1;
  return state.seats.find((one) => one.seat !== mine) || state.seats[0];
}

/**
 * Một người ngồi ở bàn: tên, bên nào, và những quân họ đã ăn được.
 *
 * Hàng quân ăn được thay cho một bảng điểm mà cái khung này không có chỗ để đặt — và nó tốt hơn
 * một bảng điểm, vì ở cờ thì "ai đang hơn" đọc bằng mắt từ đúng hàng ấy chứ không phải từ một
 * con số.
 */
function drawBoardSeat(box, seat) {
  box.replaceChildren();
  if (!seat) return;

  const dot = document.createElement('i');
  dot.className = 'side-dot' + (seat.side === BOARD_KIND[state.kind].dark ? ' dark' : '');

  const name = document.createElement('b');
  name.className = 'board-name';
  name.textContent = seat.name + (seat.bot ? '' : '');

  box.append(dot, name);

  if (state.phase === 'playing' && state.turn === seat.seat) {
    const now = document.createElement('span');
    now.className = 'board-turn';
    now.textContent = 'đang đi';
    box.append(now);
  }

  const taken = seat.taken || [];
  if (taken.length) {
    const row = document.createElement('span');
    row.className = 'taken';
    // Quân to xếp trước, để hàng ấy đọc được từ trái sang: mất xe là chuyện khác hẳn mất tốt.
    for (const piece of [...taken].sort((a, b) => kindOfPiece(b) - kindOfPiece(a))) {
      row.append(miniPiece(piece));
    }
    box.append(row);
  }

  if (seat.won !== null && seat.won !== undefined && seat.won !== 0) {
    const money = document.createElement('span');
    money.className = 'board-gold ' + (seat.won > 0 ? 'up' : 'down');
    money.textContent = change(seat.won);
    box.append(money);
  }
}

/// Một quân nhỏ, cho hàng quân đã ăn.
function miniPiece(piece) {
  const el = document.createElement('span');
  const dark = sideOfPiece(piece) === BOARD_KIND[state.kind].dark;
  el.className = 'mini-piece' + (dark ? ' dark' : '');
  if (state.kind === 'chess') el.append(pieceArt(CHESS_LETTER[kindOfPiece(piece)]));
  else el.textContent = XIANGQI_FACE[kindOfPiece(piece)][dark ? 1 : 0];
  return el;
}

/**
 * Bàn cờ to bằng bao nhiêu.
 *
 * Đo, không phải để CSS tự lo — và đây là chỗ tôi đã tự lo bằng CSS rồi hỏng.
 *
 * `aspect-ratio` cộng `max-width: 100%` cộng `max-height: 100%` **nghe** như là "vừa khung mà
 * giữ đúng tỉ lệ". Nó không phải. Không có chiều nào được đặt thì cái hộp lấy cỡ **nội dung**,
 * mà nội dung ở đây là mấy ô rỗng — nên cả bàn cờ co lại còn bằng một con tem. Đặt một chiều
 * bằng `100%` thì chiều ấy cứng, `max-*` bóp chiều kia, và tỉ lệ vỡ. Không có cách viết nào của
 * ba thuộc tính ấy ra được cái mình muốn.
 *
 * Cái mình muốn là: **ô vuông lớn nhất mà cả bàn còn lọt khung**. Một phép chia, hai chiều, lấy
 * cái nhỏ hơn. Và làm tròn xuống số nguyên — ô lẻ phần mười pixel thì đường kẻ bàn cờ tướng chạy
 * qua giữa ô sẽ răng cưa, và trên bàn cờ vua thì hai ô cạnh nhau hở một sợi tóc.
 */
function sizeGrid(grid, files, ranks) {
  const room = $('board-wrap').getBoundingClientRect();
  if (!room.width || !room.height) return;

  const cell = Math.max(12, Math.floor(Math.min(room.width / files, room.height / ranks)));
  grid.style.setProperty('--cell', `${cell}px`);
  grid.style.setProperty('--files', String(files));
  grid.style.setProperty('--ranks', String(ranks));
  grid.style.width = `${cell * files}px`;
  grid.style.height = `${cell * ranks}px`;
}

/**
 * Cả bàn cờ.
 *
 * Một lưới, và **chỉ một lưới** cho cả hai trò: cờ vua tám nhân tám ô đen trắng, cờ tướng chín
 * nhân mười giao điểm với sông và cung. Khác nhau ở nền, không ở cách bày — nên nền là CSS còn
 * đây chỉ đếm ô.
 */
function drawGrid() {
  const grid = $('grid');
  const { files, ranks } = BOARD_KIND[state.kind];
  grid.className = 'grid ' + state.kind;
  grid.replaceChildren();
  sizeGrid(grid, files, ranks);

  const board = state.board || [];
  const legal = chosen === null ? [] : movesFrom(chosen);
  const targets = new Set(legal.map((one) => one.to));
  const last = state.last || {};
  const mine = mySide();
  const canMove = state.phase === 'playing' && !!state.me && state.turn === state.me.seat;

  for (let cell = 0; cell < files * ranks; cell++) {
    const at = shownAt(cell);
    const piece = board[at] || 0;

    const square = document.createElement('button');
    square.className = 'sq'
      + ((((at / files) | 0) + (at % files)) % 2 ? ' odd' : '')
      + (at === chosen ? ' picked' : '')
      + (at === last.from || at === last.to ? ' last' : '')
      + (at === state.check ? ' check' : '');
    square.dataset.at = String(at);

    if (piece) {
      const dark = sideOfPiece(piece) === BOARD_KIND[state.kind].dark;
      const man = document.createElement('span');
      man.className = 'man' + (dark ? ' dark' : '');
      if (state.kind === 'chess') man.append(pieceArt(CHESS_LETTER[kindOfPiece(piece)]));
      else man.textContent = XIANGQI_FACE[kindOfPiece(piece)][dark ? 1 : 0];
      square.append(man);
    }

    // Chấm ở ô đi được, vòng ở ô ăn được. Hai dấu khác nhau vì đó là hai nước khác nhau, và ở cờ
    // thì "ô này có quân địch" là nửa quyết định.
    if (targets.has(at)) {
      const dot = document.createElement('i');
      dot.className = piece ? 'take' : 'dot';
      square.append(dot);
    }

    const ownPiece = piece && sideOfPiece(piece) === mine;
    square.disabled = !canMove || (!ownPiece && !targets.has(at));
    if (!square.disabled) square.onclick = () => tapSquare(at, targets.has(at));

    grid.append(square);
  }
}

/**
 * Chạm một ô.
 *
 * Chạm quân mình thì chọn nó; chạm ô đang sáng thì đi. Không kéo thả: trên một khung rộng ba
 * trăm chín mươi pixel thì kéo một quân bằng ngón tay là ngón tay che mất chỗ định thả.
 */
function tapSquare(at, isTarget) {
  if (isTarget && chosen !== null) {
    const ways = movesFrom(chosen).filter((one) => one.to === at);
    // Nhiều nước cùng đi từ đây tới đó thì đó là phong quân — và phải hỏi, chứ không chọn hộ.
    if (ways.length > 1) { promoting = { from: chosen, to: at, ways }; render(); return; }
    chosen = null;
    z.send({ move: { from: ways[0].from, to: ways[0].to, promo: ways[0].promo || 0 } });
    drawBoardGame();
    return;
  }

  chosen = chosen === at ? null : at;
  say('');
  drawBoardGame();
}

/**
 * Tốt tới hàng cuối: chọn quân phong.
 *
 * Hỏi chứ không tự phong hậu. Phong xe hay phong mã là nước cứu ván trong đúng những thế mà
 * phong hậu thành hoà hoặc thành thua — hiếm, nhưng đó là cả cái thú của nó, và một trang tự
 * quyết hộ là một trang lấy mất nước đi ấy.
 */
function drawPromo() {
  const box = $('promo');
  box.hidden = !promoting;
  if (!promoting) return;
  box.replaceChildren();

  const title = document.createElement('div');
  title.className = 'promo-title';
  title.textContent = 'Phong quân gì?';
  box.append(title);

  const row = document.createElement('div');
  row.className = 'promo-row';
  // Hậu trước, vì đó là câu trả lời trong chín mươi chín ván trên trăm.
  for (const one of [...promoting.ways].sort((a, b) => (b.promo || 0) - (a.promo || 0))) {
    const pick = document.createElement('button');
    pick.className = 'promo-one';
    const man = document.createElement('span');
    man.className = 'man' + (mySide() === BOARD_KIND[state.kind].dark ? ' dark' : '');
    man.append(pieceArt(CHESS_LETTER[one.promo]));
    const name = document.createElement('em');
    name.textContent = CHESS_NAME[one.promo];
    pick.append(man, name);
    pick.onclick = () => {
      promoting = null;
      chosen = null;
      z.send({ move: { from: one.from, to: one.to, promo: one.promo } });
      render();
    };
    row.append(pick);
  }
  box.append(row);
}

/// Dòng dưới bàn: tới lượt ai, còn bao lâu, và ván này đang là gì.
function drawBoardBar() {
  const bar = $('board-bar');
  bar.replaceChildren();
  bar.hidden = state.phase !== 'playing';
  if (bar.hidden) return;

  const who = document.createElement('span');
  who.className = 'who';
  const mine = state.me && state.turn === state.me.seat;
  who.textContent = mine ? 'Tới lượt bạn' : `Lượt ${state.turnName}`;
  bar.append(who);

  if (state.check !== null && state.check !== undefined) {
    const check = document.createElement('span');
    check.className = 'in-check';
    // Nói ra, và nói cho **ai** đang bị chiếu. "Chiếu!" một mình nó thì ở một bàn hai người là
    // một câu mơ hồ đúng nửa số ván.
    check.textContent = mine ? '· bị chiếu' : '· đang chiếu';
    bar.append(check);
  }

  const clock = document.createElement('span');
  clock.className = 'clock';
  bar.append(clock);
}

/// Ván xong: nói ra bằng một câu, và nói cả vì sao.
const OVER_WORDS = {
  mate: 'Chiếu bí', stalemate: 'Hết nước đi', resign: 'Xin thua',
  fifty: 'Hoà · năm mươi nước không ăn quân', repeat: 'Hoà · lặp thế ba lần',
  material: 'Hoà · không bên nào chiếu bí được',
};

function drawBoardOver() {
  const box = $('board-over');
  box.hidden = state.phase !== 'over' || !state.over;
  if (box.hidden) return;
  box.replaceChildren();

  const mine = (state.paid || []).find((one) => one.userId === z.viewer.id);
  const won = mine && mine.change > 0;
  const drew = !state.over.winner && state.over.winner !== 0;

  const title = document.createElement('h2');
  title.className = drew ? '' : won ? '' : 'last';
  title.textContent = drew ? 'Hoà' : won ? 'Bạn thắng' : 'Bạn thua';
  box.append(title);

  const why = document.createElement('div');
  why.className = 'over-why';
  why.textContent = OVER_WORDS[state.over.over] || '';
  box.append(why);

  if (mine && mine.change) {
    const money = document.createElement('div');
    money.className = 'finished-gold ' + (mine.change > 0 ? 'up' : 'down');
    money.textContent = `${change(mine.change)} vàng`;
    box.append(money);
    countUp(money, mine.change, 0.2, ' vàng', `board:${state.gameId}:${z.viewer.id}`);
  }
}

/// Đồng hồ một nước, vẽ từ một mốc chứ không đếm lùi — máy ngủ dậy là ra đúng số, không phải một
/// con số chậm mất nửa phút.
function boardTick() {
  if (!state || state.phase !== 'playing' || !state.turnEndsAt) return;
  const clock = document.querySelector('#board-bar .clock');
  if (!clock) return;
  const left = Math.max(0, (state.turnEndsAt - Date.now()) / 1000);
  clock.textContent = `${Math.round(left)}s`;
  clock.classList.toggle('low', left <= 15);
}
