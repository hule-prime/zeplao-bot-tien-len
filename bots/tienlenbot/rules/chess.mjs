/**
 * Luật cờ vua: bàn tám nhân tám, và đủ mọi thứ làm nó thành cờ vua chứ không phải một trò đi
 * quân — nhập thành, bắt tốt qua đường, phong hậu, chiếu, chiếu bí, hết nước đi, và mấy cách
 * hoà mà ai chơi cũng gặp.
 *
 * Thuần và không biết gì về mạng: bàn cờ vào, bàn cờ ra. Đó là lý do nó ở đây chứ không ở trong
 * `tienlenbot.mjs` — một luật chơi kiểm được bằng một phép gọi hàm là một luật chơi kiểm được,
 * còn một luật chơi chỉ kiểm được qua một cái bàn đang chạy thì không. Và ở cờ thì điều đó nặng
 * hơn hẳn ba trò kia: "quân này đi được tới đâu" là câu hỏi hỏi vài trăm lần một nước.
 *
 * **Ô số 0 là a8.** Hàng 0 là hàng cuối của Đen, hàng 7 là hàng cuối của Trắng, và ô = hàng×8 +
 * cột. Xếp thế vì đó là thứ tự trang vẽ ra: đọc mảng từ đầu tới cuối là vẽ bàn từ trên xuống.
 * Mọi phép tính hướng bên dưới đọc theo đúng chiều ấy — Trắng đi về phía hàng 0, tức là −8.
 */

/// Quân: ba bit thấp là loại, bit thứ tư là màu. 0 là ô trống.
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

/// Màu, và nó là một bit chứ không phải một chuỗi: nước đi được sinh ra vài trăm nghìn lần một
/// lượt máy nghĩ, và so sánh số thì rẻ hơn so sánh chuỗi.
export const WHITE = 0;
export const BLACK = 8;

export const typeOf = (piece) => piece & 7;
export const colourOf = (piece) => piece & 8;
export const isWhite = (piece) => piece !== 0 && (piece & 8) === 0;

/// Chữ một ký tự cho mỗi quân, để viết ra và đọc lại một thế cờ. Hoa là Trắng, thường là Đen —
/// đúng lối ai cũng viết.
const LETTERS = ' PNBRQK';
export const letterOf = (piece) =>
  piece === 0 ? '.' : colourOf(piece) === WHITE
    ? LETTERS[typeOf(piece)] : LETTERS[typeOf(piece)].toLowerCase();

/// Ô, đọc theo lối người ta gọi: `e2`, `g8`.
export const nameOfSquare = (at) => 'abcdefgh'[at % 8] + (8 - ((at / 8) | 0));
export const squareNamed = (name) =>
  'abcdefgh'.indexOf(name[0]) + (8 - Number(name[1])) * 8;

/// Một nước, viết ra thành chữ: `e2e4`, `e7e8q`. Đây là thứ đi qua dây, và nó ngắn để đọc được
/// bằng mắt trong một cái log.
export const nameOfMove = (move) =>
  nameOfSquare(move.from) + nameOfSquare(move.to) + (move.promo ? LETTERS[move.promo].toLowerCase() : '');

/// Bốn quyền nhập thành, mỗi quyền một bit.
import { think } from './search.mjs';

export const WK = 1;
export const WQ = 2;
export const BK = 4;
export const BQ = 8;

/// Thế cờ mở đầu.
export function start() {
  const board = new Int8Array(64);
  const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
  for (let i = 0; i < 8; i++) {
    board[i] = back[i] | BLACK;
    board[8 + i] = PAWN | BLACK;
    board[48 + i] = PAWN | WHITE;
    board[56 + i] = back[i] | WHITE;
  }
  return {
    board,
    turn: WHITE,
    // Quyền nhập thành còn lại. Mất đi khi vua hay xe rời chỗ, và **không bao giờ về lại**.
    castle: WK | WQ | BK | BQ,
    // Ô mà tốt vừa nhảy hai bước đi qua — ô bắt được của nước bắt tốt qua đường, và chỉ đúng một
    // nước sau đó.
    ep: -1,
    // Số nửa nước không ăn quân và không đi tốt. Năm mươi nước là hoà.
    half: 0,
    // Số nước đầy, chỉ để đọc.
    full: 1,
    // Mọi thế đã qua, để bắt lặp ba lần. Chuỗi chứ không phải đối tượng: so sánh một lần là một
    // phép so chuỗi, và bàn cờ chỉ có sáu tư ô.
    seen: [],
  };
}

/**
 * Một thế cờ đọc từ FEN, và viết ngược ra.
 *
 * Không ai trong bot này gửi FEN đi đâu cả — nó ở đây để **kiểm**. Mọi cái bẫy của luật cờ vua
 * nằm ở những thế không bao giờ tới được từ nước khai cuộc trong vài nước: nhập thành khi xe bị
 * ăn trên ô nhà, bắt tốt qua đường mở ra một đường chiếu ngang, phong hậu thành ra tự chiếu
 * mình. Không đọc được thế cờ thì không viết được cái test nào về chúng.
 */
export function fromFen(fen) {
  const [rows, side, rights, ep] = fen.trim().split(/\s+/);
  const board = new Int8Array(64);
  let at = 0;
  for (const ch of rows) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') { at += Number(ch); continue; }
    const kind = LETTERS.indexOf(ch.toUpperCase());
    board[at++] = kind | (ch === ch.toUpperCase() ? WHITE : BLACK);
  }
  let castle = 0;
  for (const [ch, bit] of [['K', WK], ['Q', WQ], ['k', BK], ['q', BQ]]) {
    if ((rights ?? '').includes(ch)) castle |= bit;
  }
  return {
    board,
    turn: side === 'b' ? BLACK : WHITE,
    castle,
    ep: ep && ep !== '-' ? squareNamed(ep) : -1,
    half: 0,
    full: 1,
    seen: [],
  };
}

export function toFen(pos) {
  let rows = '';
  for (let row = 0; row < 8; row++) {
    let gap = 0;
    for (let col = 0; col < 8; col++) {
      const piece = pos.board[row * 8 + col];
      if (piece === 0) { gap++; continue; }
      if (gap) { rows += gap; gap = 0; }
      rows += letterOf(piece);
    }
    if (gap) rows += gap;
    if (row < 7) rows += '/';
  }
  const rights = [[WK, 'K'], [WQ, 'Q'], [BK, 'k'], [BQ, 'q']]
    .filter(([bit]) => pos.castle & bit).map(([, ch]) => ch).join('') || '-';
  return `${rows} ${pos.turn === WHITE ? 'w' : 'b'} ${rights} `
    + `${pos.ep >= 0 ? nameOfSquare(pos.ep) : '-'} ${pos.half} ${pos.full}`;
}

/// Chép một thế cờ. Mọi thứ ở đây trả về thế mới chứ không sửa thế cũ — cái máy đi thử hàng
/// chục nghìn nước, và một hàm sửa tại chỗ là một hàm phải nhớ hoàn tác.
function copy(pos) {
  return {
    board: Int8Array.from(pos.board),
    turn: pos.turn,
    castle: pos.castle,
    ep: pos.ep,
    half: pos.half,
    full: pos.full,
    seen: pos.seen,
  };
}

/// Thế cờ, viết thành một chuỗi. Dùng để bắt lặp ba lần, nên nó phải mang đủ những gì làm hai
/// thế **khác nhau**: quân, lượt, quyền nhập thành, ô bắt qua đường.
export function keyOf(pos) {
  let key = '';
  for (let at = 0; at < 64; at++) key += letterOf(pos.board[at]);
  return `${key}|${pos.turn}|${pos.castle}|${pos.ep}`;
}

/// Đi bao xa theo mỗi hướng, cho quân đi dài và quân đi một bước.
const ROOK_WAYS = [-8, 8, -1, 1];
const BISHOP_WAYS = [-9, -7, 7, 9];
const QUEEN_WAYS = [-9, -8, -7, -1, 1, 7, 8, 9];
const KNIGHT_WAYS = [-17, -15, -10, -6, 6, 10, 15, 17];

/// Ô có nằm trên bàn không, **và** có phải là bước đi liền kề thật không.
///
/// Đây là cái bẫy kinh điển của bàn cờ một chiều: từ ô h4 đi sang phải một bước ra ô a5, vẫn nằm
/// trong 0..63 nên mọi phép kiểm biên đều nói được. Nên nó kiểm bằng **khoảng cách cột**: một
/// bước ngang không bao giờ đổi cột quá hai (mã đi hai), nên vượt quá là đã vòng qua mép bàn.
const onBoard = (from, to, spread) =>
  to >= 0 && to < 64 && Math.abs((from % 8) - (to % 8)) <= spread;

/**
 * Ô này có đang bị màu kia ăn tới không.
 *
 * Hỏi ngược từ ô ra chứ không quét cả bàn: đứng ở ô ấy và bắn ra mọi hướng, gặp quân nào thì hỏi
 * quân ấy có với tới được không. Rẻ hơn hẳn sinh hết nước đi của đối phương rồi tìm — mà tìm
 * cách kia còn dẫn tới đệ quy, vì nước đi hợp lệ lại phải hỏi chiếu.
 */
export function attacked(board, at, by) {
  // Tốt. Tốt trắng ăn chéo lên (−7, −9), tốt đen ăn chéo xuống (+7, +9) — nên đứng từ ô bị ăn mà
  // nhìn thì ngược lại.
  const pawnWays = by === WHITE ? [7, 9] : [-7, -9];
  for (const way of pawnWays) {
    const from = at + way;
    if (!onBoard(at, from, 1)) continue;
    if (board[from] === (PAWN | by)) return true;
  }

  for (const way of KNIGHT_WAYS) {
    const from = at + way;
    if (!onBoard(at, from, 2)) continue;
    if (board[from] === (KNIGHT | by)) return true;
  }

  for (const way of QUEEN_WAYS) {
    const from = at + way;
    if (!onBoard(at, from, 1)) continue;
    if (board[from] === (KING | by)) return true;
  }

  // Quân đi dài: trượt tới khi gặp cái gì đó, rồi hỏi cái ấy là gì.
  for (const [ways, kind] of [[ROOK_WAYS, ROOK], [BISHOP_WAYS, BISHOP]]) {
    for (const way of ways) {
      let from = at;
      for (;;) {
        const next = from + way;
        if (!onBoard(from, next, 1)) break;
        from = next;
        const piece = board[from];
        if (piece === 0) continue;
        if (colourOf(piece) === by && (typeOf(piece) === kind || typeOf(piece) === QUEEN)) {
          return true;
        }
        break;
      }
    }
  }
  return false;
}

/// Vua của màu này đang đứng ở đâu.
export function kingAt(board, colour) {
  for (let at = 0; at < 64; at++) if (board[at] === (KING | colour)) return at;
  return -1;
}

/// Bên này có đang bị chiếu không.
export function inCheck(pos, colour = pos.turn) {
  const at = kingAt(pos.board, colour);
  return at >= 0 && attacked(pos.board, at, colour === WHITE ? BLACK : WHITE);
}

/**
 * Mọi nước đi **giả** của bên đang đi: đúng luật đi quân, chưa hỏi vua có bị hở không.
 *
 * Tách riêng khỏi `moves` vì cái máy gọi nó hàng chục nghìn lần và phần lớn không cần lọc — và
 * vì phép lọc ấy phải đi thử từng nước, nên trộn hai việc lại là làm việc đắt cho cả những nước
 * sẽ bị bỏ ngay.
 */
export function pseudoMoves(pos) {
  const { board, turn } = pos;
  const them = turn === WHITE ? BLACK : WHITE;
  const out = [];
  const add = (from, to) => out.push({ from, to, promo: 0 });

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (piece === 0 || colourOf(piece) !== turn) continue;
    const kind = typeOf(piece);

    if (kind === PAWN) {
      const up = turn === WHITE ? -8 : 8;
      const home = turn === WHITE ? 6 : 1;
      const last = turn === WHITE ? 0 : 7;
      const row = (from / 8) | 0;

      // Đi thẳng. Một bước, và hai bước từ hàng nhà nếu cả hai ô đều trống.
      const one = from + up;
      if (one >= 0 && one < 64 && board[one] === 0) {
        if (((one / 8) | 0) === last) {
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) out.push({ from, to: one, promo });
        } else {
          add(from, one);
          const two = one + up;
          if (row === home && board[two] === 0) add(from, two);
        }
      }

      // Ăn chéo, và bắt tốt qua đường — cùng một phép, khác nhau ở chỗ ô đích trống hay không.
      for (const side of [-1, 1]) {
        const to = from + up + side;
        if (!onBoard(from, to, 1)) continue;
        const target = board[to];
        const takes = target !== 0 && colourOf(target) === them;
        if (!takes && to !== pos.ep) continue;
        if (((to / 8) | 0) === last) {
          for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) out.push({ from, to, promo });
        } else {
          add(from, to);
        }
      }
      continue;
    }

    if (kind === KNIGHT || kind === KING) {
      const ways = kind === KNIGHT ? KNIGHT_WAYS : QUEEN_WAYS;
      const spread = kind === KNIGHT ? 2 : 1;
      for (const way of ways) {
        const to = from + way;
        if (!onBoard(from, to, spread)) continue;
        const target = board[to];
        if (target !== 0 && colourOf(target) === turn) continue;
        add(from, to);
      }
      continue;
    }

    const ways = kind === ROOK ? ROOK_WAYS : kind === BISHOP ? BISHOP_WAYS : QUEEN_WAYS;
    for (const way of ways) {
      let at = from;
      for (;;) {
        const to = at + way;
        if (!onBoard(at, to, 1)) break;
        at = to;
        const target = board[at];
        if (target !== 0 && colourOf(target) === turn) break;
        add(from, at);
        if (target !== 0) break;
      }
    }
  }

  // Nhập thành.
  //
  // Ba điều kiện, và cả ba đều hay bị quên đúng một cái: còn quyền, đường đi trống, và **vua
  // không đi qua ô nào đang bị ăn** — kể cả ô nó đang đứng. Ô cuối của xe thì được phép bị ăn;
  // chỉ ba ô của vua mới bị hỏi.
  const back = turn === WHITE ? 56 : 0;
  const kingHome = back + 4;
  if (board[kingHome] === (KING | turn) && !attacked(board, kingHome, them)) {
    const short = turn === WHITE ? WK : BK;
    const long = turn === WHITE ? WQ : BQ;

    if ((pos.castle & short) && board[back + 7] === (ROOK | turn)
      && board[back + 5] === 0 && board[back + 6] === 0
      && !attacked(board, back + 5, them) && !attacked(board, back + 6, them)) {
      add(kingHome, back + 6);
    }
    if ((pos.castle & long) && board[back] === (ROOK | turn)
      && board[back + 1] === 0 && board[back + 2] === 0 && board[back + 3] === 0
      && !attacked(board, back + 3, them) && !attacked(board, back + 2, them)) {
      add(kingHome, back + 2);
    }
  }

  return out;
}

/// Mọi nước đi **hợp lệ**: đi thử, rồi hỏi vua mình có hở không.
export function moves(pos) {
  return pseudoMoves(pos).filter((move) => {
    const after = apply(pos, move, true);
    return !inCheck(after, pos.turn);
  });
}

/**
 * Đi một nước, và trả về thế mới.
 *
 * `quick` bỏ qua việc ghi lại thế đã qua — cái máy đi thử hàng chục nghìn nước và không ai đếm
 * lặp ba lần trong lúc nghĩ.
 */
export function apply(pos, move, quick = false) {
  const next = copy(pos);
  const { board } = next;
  const piece = board[move.from];
  const kind = typeOf(piece);
  const taken = board[move.to];

  board[move.to] = move.promo ? (move.promo | pos.turn) : piece;
  board[move.from] = 0;

  // Bắt tốt qua đường: quân bị ăn không đứng ở ô mình vừa tới.
  if (kind === PAWN && move.to === pos.ep) {
    board[move.to + (pos.turn === WHITE ? 8 : -8)] = 0;
  }

  // Nhập thành: xe đi theo, và không có nước nào khác làm vua nhảy hai ô.
  if (kind === KING && Math.abs((move.from % 8) - (move.to % 8)) === 2) {
    const back = pos.turn === WHITE ? 56 : 0;
    if (move.to === back + 6) { board[back + 5] = board[back + 7]; board[back + 7] = 0; }
    else { board[back + 3] = board[back]; board[back] = 0; }
  }

  // Quyền nhập thành, mất đi và không về lại. Mất khi vua đi, khi xe đi, **và khi xe bị ăn ngay
  // trên ô nhà của nó** — cái vế thứ ba là cái hay thiếu, và nó chỉ lộ ra ở một ván trong trăm.
  if (kind === KING) next.castle &= pos.turn === WHITE ? ~(WK | WQ) : ~(BK | BQ);
  for (const [at, right] of [[56, WQ], [63, WK], [0, BQ], [7, BK]]) {
    if (move.from === at || move.to === at) next.castle &= ~right;
  }

  // Ô bắt qua đường, chỉ khi tốt vừa nhảy hai bước.
  next.ep = kind === PAWN && Math.abs(move.to - move.from) === 16
    ? (move.from + move.to) / 2
    : -1;

  next.half = kind === PAWN || taken !== 0 ? 0 : pos.half + 1;
  if (pos.turn === BLACK) next.full = pos.full + 1;
  next.turn = pos.turn === WHITE ? BLACK : WHITE;
  next.seen = quick ? pos.seen : [...pos.seen, keyOf(pos)];
  return next;
}

/// Bàn cờ còn đủ quân để chiếu bí không. Vua trơ, vua với một mã, vua với một tượng — không bên
/// nào chiếu bí được bên nào, nên ván ấy hoà ngay chứ không đi tiếp tới hết giờ.
function tooFewToMate(board) {
  const rest = [];
  for (let at = 0; at < 64; at++) {
    const piece = board[at];
    if (piece === 0 || typeOf(piece) === KING) continue;
    if (typeOf(piece) === PAWN || typeOf(piece) === ROOK || typeOf(piece) === QUEEN) return false;
    rest.push(piece);
  }
  if (rest.length <= 1) return true;
  // Hai tượng cùng màu ô cũng không chiếu bí được, nhưng đó là chỗ tinh vi hiếm gặp — dừng ở đây
  // là dừng đúng chỗ luật FIDE gọi là "không thể chiếu bí bằng bất kỳ chuỗi nước nào".
  return false;
}

/**
 * Ván này đã xong chưa, và xong kiểu gì.
 *
 * Trả về `null` nếu còn đi được. Chiếu bí thì kèm bên thắng; mọi kiểu hoà đều kèm lý do, vì "hoà"
 * một mình nó không nói được vì sao ván dừng lại — mà đó chính là câu người thua hỏi.
 */
export function status(pos) {
  if (!moves(pos).length) {
    return inCheck(pos)
      ? { over: 'mate', winner: pos.turn === WHITE ? BLACK : WHITE }
      : { over: 'stalemate', winner: null };
  }
  if (pos.half >= 100) return { over: 'fifty', winner: null };
  if (tooFewToMate(pos.board)) return { over: 'material', winner: null };

  const key = keyOf(pos);
  let same = 1;
  for (const before of pos.seen) if (before === key) same++;
  if (same >= 3) return { over: 'repeat', winner: null };

  return null;
}

// ---- cái máy ------------------------------------------------------------------------------

/// Quân đáng bao nhiêu. Con số ai cũng dùng, tính bằng phần trăm con tốt.
export const WORTH = [0, 100, 320, 330, 500, 900, 0];

/**
 * Quân đứng ở đâu thì hơn.
 *
 * Bảng viết theo **góc nhìn của Trắng**, ô 0 là a8. Đen đọc cùng bảng ấy lật ngược — một bảng cho
 * cả hai bên, vì bàn cờ đối xứng và hai bảng là hai chỗ để lệch nhau.
 *
 * Không phải để đánh hay: để đừng đánh dở một cách khó chịu. Không có nó thì máy đẩy tốt biên,
 * dí mã ra góc và để vua đứng giữa bàn — mấy nước ấy không thua ngay, chúng chỉ làm ván cờ
 * trông như máy không hiểu mình đang làm gì.
 */
const PLACE = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  [KING]: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/// Vua ở cuối ván thì ngược lại hẳn: đi ra giữa bàn. Không có bảng này thì máy có xe với vua vẫn
/// ngồi trong góc và không bao giờ chiếu bí nổi.
const KING_LATE = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

/// Thế cờ đáng bao nhiêu, tính theo **bên đang đi**. Dương là đang hơn.
export function evaluate(pos) {
  const { board } = pos;
  let score = 0;
  let heavy = 0;
  for (let at = 0; at < 64; at++) {
    const piece = board[at];
    if (piece === 0) continue;
    const kind = typeOf(piece);
    if (kind !== PAWN && kind !== KING) heavy += WORTH[kind];
  }
  // Cuối ván, đo bằng số quân nặng còn lại. Không có ngưỡng nào đúng cả; cái này đủ để vua biết
  // lúc nào nên trốn và lúc nào nên đi ra.
  const late = heavy < 1400;

  for (let at = 0; at < 64; at++) {
    const piece = board[at];
    if (piece === 0) continue;
    const kind = typeOf(piece);
    const white = colourOf(piece) === WHITE;
    // Bảng viết theo góc nhìn Trắng; Đen đọc cùng bảng ấy lật ngược.
    const square = white ? at : (7 - ((at / 8) | 0)) * 8 + (at % 8);
    const place = kind === KING && late ? KING_LATE[square] : PLACE[kind][square];
    score += white ? WORTH[kind] + place : -(WORTH[kind] + place);
  }
  return pos.turn === WHITE ? score : -score;
}

/// Nước ăn quân to bằng quân bé thì xét trước. Sắp thô thế này thôi cũng cắt được phần lớn cây.
function order(pos, list) {
  const { board } = pos;
  return list
    .map((move) => {
      const taken = board[move.to];
      const gain = taken === 0 ? 0 : WORTH[typeOf(taken)] * 10 - WORTH[typeOf(board[move.from])];
      return { move, gain: gain + (move.promo ? WORTH[move.promo] : 0) };
    })
    .sort((a, b) => b.gain - a.gain)
    .map((one) => one.move);
}

export const MATE = 100_000;

/**
 * Những gì một nước đi làm **ngoài** việc dời quân từ ô này sang ô kia.
 *
 * Có đúng hai thứ, và cả hai đều là chỗ bàn cờ đổi ở một ô mà nước đi không hề nhắc tới: nhập
 * thành thì con xe cũng đi, và bắt tốt qua đường thì con tốt bị ăn **không đứng ở ô mình vừa
 * tới**.
 *
 * Cái này tồn tại để cái trang vẽ được nước đi của chính mình **ngay lập tức**, trước khi bot kịp
 * trả lời. Trang không được tự biết luật cờ — đó là luật của cả thiết kế — nên nó không được tự
 * suy ra hai thứ trên. Nhưng đọc lại đúng cái bot vừa nói thì không phải là biết luật: bot mô tả
 * trọn vẹn nước đi, trang diễn lại. Chỗ quyết định vẫn nằm đúng một nơi.
 */
export function extrasOf(pos, move) {
  const piece = pos.board[move.from];
  const kind = typeOf(piece);
  const extras = {};

  if (kind === KING && Math.abs((move.from % 8) - (move.to % 8)) === 2) {
    const back = pos.turn === WHITE ? 56 : 0;
    extras.rook = move.to === back + 6
      ? { from: back + 7, to: back + 5 }
      : { from: back, to: back + 3 };
  }

  if (kind === PAWN && move.to === pos.ep && pos.board[move.to] === 0) {
    extras.ep = move.to + (pos.turn === WHITE ? 8 : -8);
  }

  return extras;
}

/**
 * Bộ luật, gói lại đúng cái hình dạng cái máy nghĩ cần.
 *
 * `dead` là chỗ hai trò cờ khác nhau thật, nên nó nằm ở đây chứ không ở trong cái máy: hết nước
 * đi mà đang bị chiếu là **bí** — thua; hết nước đi mà không bị chiếu là **hoà**. Cờ tướng thì
 * cả hai đều là thua, và nó tự nói lấy.
 */
export const RULES = {
  moves, pseudoMoves, apply, evaluate, order, inCheck, status, MATE,
  quiet: (pos, move) => pos.board[move.to] === 0 && !move.promo,
  dead: (pos, ply) => (inCheck(pos) ? -(MATE - ply) : 0),
};

/// Nước máy chọn. Một dòng, vì mọi thứ khó đều ở `search.mjs` và không có gì ở đây là của riêng
/// cờ vua ngoài bộ luật vừa gói ở trên.
export function choose(pos, level = 3) {
  return think(pos, RULES, { level, nodes: 60_000 });
}
