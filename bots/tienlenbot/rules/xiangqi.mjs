/**
 * Luật cờ tướng: bàn chín đường ngang mười đường dọc, con sông ở giữa, và cung của mỗi bên.
 *
 * Thuần và không biết gì về mạng, như mọi file trong thư mục này.
 *
 * **Ô số 0 là góc trên bên trái, phía Đen.** Ô = hàng×9 + cột, hàng 0 là hàng cuối của Đen, hàng
 * 9 là hàng cuối của Đỏ. Xếp thế vì đó là thứ tự trang vẽ ra, và vì Đỏ đi *lên* — về phía hàng
 * 0, tức là −9 — y như Trắng ở file cờ vua bên cạnh. Hai bàn cờ khác nhau ở mọi quân, nhưng cùng
 * một quy ước toạ độ thì đọc file này không phải học lại từ đầu.
 *
 * Quân đứng trên **giao điểm**, không phải trong ô. Với mảng thì không khác gì; với trang vẽ thì
 * khác hẳn, và đó là chỗ hay vẽ sai.
 */

import { think } from './search.mjs';

/// Bảy loại quân. Ba bit thấp là loại, bit thứ tư là màu.
export const KING = 1;      // tướng / soái
export const ADVISOR = 2;   // sĩ
export const ELEPHANT = 3;  // tượng / tướng
export const HORSE = 4;     // mã
export const CHARIOT = 5;   // xe
export const CANNON = 6;    // pháo
export const SOLDIER = 7;   // tốt / binh

export const RED = 0;
export const BLACK = 8;

export const typeOf = (piece) => piece & 7;
export const colourOf = (piece) => piece & 8;

/// Bàn cờ rộng chín, cao mười.
export const FILES = 9;
export const RANKS = 10;
export const rowOf = (at) => (at / FILES) | 0;
export const colOf = (at) => at % FILES;
export const squareAt = (row, col) => row * FILES + col;

const LETTERS = ' KABNRCP';
export const letterOf = (piece) =>
  piece === 0 ? '.' : colourOf(piece) === RED
    ? LETTERS[typeOf(piece)] : LETTERS[typeOf(piece)].toLowerCase();

/// Tên quân bằng chữ, và mỗi bên gọi một kiểu — đó là cờ tướng, không phải một chi tiết trang
/// trí. Bên Đỏ là soái/sĩ/tượng, bên Đen là tướng/sỹ/tịnh; ở đây lấy lối gọi phổ thông nhất.
export const NAMES = {
  [KING]: ['Tướng', 'Tướng'],
  [ADVISOR]: ['Sĩ', 'Sĩ'],
  [ELEPHANT]: ['Tượng', 'Tượng'],
  [HORSE]: ['Mã', 'Mã'],
  [CHARIOT]: ['Xe', 'Xe'],
  [CANNON]: ['Pháo', 'Pháo'],
  [SOLDIER]: ['Tốt', 'Tốt'],
};

/// Chữ vẽ lên mặt quân. Đỏ và Đen dùng chữ khác nhau cho cùng một quân — đó là bàn cờ tướng thật,
/// và người chơi nhận ra quân bằng đúng những chữ này.
export const FACE = {
  [RED]: { [KING]: '帥', [ADVISOR]: '仕', [ELEPHANT]: '相', [HORSE]: '傌', [CHARIOT]: '俥', [CANNON]: '炮', [SOLDIER]: '兵' },
  [BLACK]: { [KING]: '將', [ADVISOR]: '士', [ELEPHANT]: '象', [HORSE]: '馬', [CHARIOT]: '車', [CANNON]: '砲', [SOLDIER]: '卒' },
};

export const nameOfSquare = (at) => `${colOf(at)},${rowOf(at)}`;
export const nameOfMove = (move) => `${nameOfSquare(move.from)}-${nameOfSquare(move.to)}`;

/// Cung: ba cột giữa, ba hàng cuối của mỗi bên. Tướng và sĩ không ra khỏi đây bao giờ.
const inPalace = (at, colour) => {
  const col = colOf(at);
  const row = rowOf(at);
  if (col < 3 || col > 5) return false;
  return colour === RED ? row >= 7 : row <= 2;
};

/// Bên mình của con sông. Tượng không sang sông; tốt sang rồi thì đi ngang được.
const ownSide = (at, colour) => (colour === RED ? rowOf(at) >= 5 : rowOf(at) <= 4);

export function start() {
  const board = new Int8Array(FILES * RANKS);
  const back = [CHARIOT, HORSE, ELEPHANT, ADVISOR, KING, ADVISOR, ELEPHANT, HORSE, CHARIOT];
  for (let col = 0; col < FILES; col++) {
    board[squareAt(0, col)] = back[col] | BLACK;
    board[squareAt(9, col)] = back[col] | RED;
  }
  for (const col of [1, 7]) {
    board[squareAt(2, col)] = CANNON | BLACK;
    board[squareAt(7, col)] = CANNON | RED;
  }
  for (const col of [0, 2, 4, 6, 8]) {
    board[squareAt(3, col)] = SOLDIER | BLACK;
    board[squareAt(6, col)] = SOLDIER | RED;
  }
  return { board, turn: RED, half: 0, full: 1, seen: [] };
}

function copy(pos) {
  return {
    board: Int8Array.from(pos.board),
    turn: pos.turn,
    half: pos.half,
    full: pos.full,
    seen: pos.seen,
  };
}

export function keyOf(pos) {
  let key = '';
  for (let at = 0; at < pos.board.length; at++) key += letterOf(pos.board[at]);
  return `${key}|${pos.turn}`;
}

export function kingAt(board, colour) {
  // Chỉ tìm trong cung — tướng không bao giờ ở đâu khác, và mười hai ô rẻ hơn chín mươi ô.
  const rows = colour === RED ? [7, 8, 9] : [0, 1, 2];
  for (const row of rows) {
    for (let col = 3; col <= 5; col++) {
      const at = squareAt(row, col);
      if (board[at] === (KING | colour)) return at;
    }
  }
  return -1;
}

/**
 * Hai tướng có đang nhìn thẳng vào nhau không.
 *
 * "Tướng đối mặt" — cùng một cột và không có quân nào chen giữa. Không phải một nước đi, mà là
 * một thế **cấm**: bên nào đi tới đó là nước ấy không hợp lệ. Cách gọn nhất để cài là coi nó như
 * một kiểu chiếu, vì đó đúng là cái nó là.
 */
export function facing(board) {
  const red = kingAt(board, RED);
  const black = kingAt(board, BLACK);
  if (red < 0 || black < 0) return false;
  if (colOf(red) !== colOf(black)) return false;
  for (let row = rowOf(black) + 1; row < rowOf(red); row++) {
    if (board[squareAt(row, colOf(red))] !== 0) return false;
  }
  return true;
}

const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
/// Mã: tám nước, và mỗi nước có một ô **cản chân** riêng — ô đi thẳng một bước trước khi rẽ.
const HORSE_WAYS = [
  [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
  [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
];

/**
 * Ô này có đang bị màu kia ăn tới không.
 *
 * Hỏi ngược từ ô ra, như ở cờ vua — nhưng ở đây **pháo** làm nó khác hẳn: một quân có thể bị ăn
 * bởi một cái pháo đứng xa, cách đúng một quân bất kỳ. Nên đường trượt không dừng ở quân đầu
 * tiên gặp được: gặp quân thứ nhất thì đó là ngòi, và phải nhìn tiếp xem quân thứ hai có phải
 * pháo địch không.
 */
export function attacked(board, at, by) {
  const row = rowOf(at);
  const col = colOf(at);

  // Tướng và sĩ: đứng cạnh trong cung.
  for (const [dr, dc] of STEPS) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
    const from = squareAt(r, c);
    if (board[from] === (KING | by) && inPalace(from, by)) return true;
  }
  for (const [dr, dc] of DIAGONALS) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
    const from = squareAt(r, c);
    if (board[from] === (ADVISOR | by) && inPalace(from, by)) return true;
  }

  // Tượng: hai bước chéo, và mắt tượng phải trống.
  for (const [dr, dc] of DIAGONALS) {
    const r = row + dr * 2;
    const c = col + dc * 2;
    if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
    const from = squareAt(r, c);
    if (board[from] !== (ELEPHANT | by)) continue;
    if (board[squareAt(row + dr, col + dc)] !== 0) continue;
    if (!ownSide(from, by)) continue;
    return true;
  }

  // Mã: nhìn ngược lại, nên ô cản chân là ô cạnh **con mã**, không phải cạnh ô bị ăn.
  for (const [dr, dc, br, bc] of HORSE_WAYS) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
    const from = squareAt(r, c);
    if (board[from] !== (HORSE | by)) continue;
    // Chân của con mã ấy: từ nó bước một bước về phía ô này.
    if (board[squareAt(r - br, c - bc)] !== 0) continue;
    return true;
  }

  // Tốt: đi tới, và sang sông rồi thì đi ngang. Nhìn ngược lại nên chiều tới là chiều ngược.
  const forward = by === RED ? 1 : -1;      // ô bị ăn nằm *trước* con tốt, nên tốt ở phía sau
  for (const [dr, dc] of [[forward, 0], [0, -1], [0, 1]]) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
    const from = squareAt(r, c);
    if (board[from] !== (SOLDIER | by)) continue;
    if (dc !== 0 && ownSide(from, by)) continue;   // chưa sang sông thì không đi ngang
    return true;
  }

  // Xe và pháo, cùng một đường trượt. Quân đầu tiên gặp được là xe địch thì bị ăn; **quân thứ
  // hai** sau nó là pháo địch thì cũng bị ăn.
  for (const [dr, dc] of STEPS) {
    let r = row + dr;
    let c = col + dc;
    let screen = false;
    while (r >= 0 && r < RANKS && c >= 0 && c < FILES) {
      const piece = board[squareAt(r, c)];
      if (piece !== 0) {
        if (!screen) {
          if (piece === (CHARIOT | by)) return true;
          screen = true;
        } else {
          if (piece === (CANNON | by)) return true;
          break;
        }
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

export function inCheck(pos, colour = pos.turn) {
  const at = kingAt(pos.board, colour);
  return at >= 0 && attacked(pos.board, at, colour === RED ? BLACK : RED);
}

/// Mọi nước đi giả của bên đang đi: đúng luật đi quân, chưa hỏi tướng có hở không.
export function pseudoMoves(pos) {
  const { board, turn } = pos;
  const out = [];
  const push = (from, to) => {
    const target = board[to];
    if (target !== 0 && colourOf(target) === turn) return;
    out.push({ from, to });
  };

  for (let from = 0; from < board.length; from++) {
    const piece = board[from];
    if (piece === 0 || colourOf(piece) !== turn) continue;
    const kind = typeOf(piece);
    const row = rowOf(from);
    const col = colOf(from);

    if (kind === KING) {
      for (const [dr, dc] of STEPS) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
        const to = squareAt(r, c);
        if (!inPalace(to, turn)) continue;
        push(from, to);
      }
      continue;
    }

    if (kind === ADVISOR) {
      for (const [dr, dc] of DIAGONALS) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
        const to = squareAt(r, c);
        if (!inPalace(to, turn)) continue;
        push(from, to);
      }
      continue;
    }

    if (kind === ELEPHANT) {
      for (const [dr, dc] of DIAGONALS) {
        const r = row + dr * 2;
        const c = col + dc * 2;
        if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
        const to = squareAt(r, c);
        // Không sang sông, và mắt tượng phải trống.
        if (!ownSide(to, turn)) continue;
        if (board[squareAt(row + dr, col + dc)] !== 0) continue;
        push(from, to);
      }
      continue;
    }

    if (kind === HORSE) {
      for (const [dr, dc, br, bc] of HORSE_WAYS) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
        // Cản chân: ô đi thẳng một bước trước khi rẽ.
        if (board[squareAt(row + br, col + bc)] !== 0) continue;
        push(from, squareAt(r, c));
      }
      continue;
    }

    if (kind === SOLDIER) {
      const forward = turn === RED ? -1 : 1;
      const ways = ownSide(from, turn) ? [[forward, 0]] : [[forward, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of ways) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= RANKS || c < 0 || c >= FILES) continue;
        push(from, squareAt(r, c));
      }
      continue;
    }

    // Xe và pháo. Cùng một đường đi, khác nhau ở chỗ ăn quân: xe ăn quân đầu tiên gặp được, pháo
    // phải nhảy qua đúng một quân rồi mới ăn được quân sau nó.
    for (const [dr, dc] of STEPS) {
      let r = row + dr;
      let c = col + dc;
      let screen = false;
      while (r >= 0 && r < RANKS && c >= 0 && c < FILES) {
        const to = squareAt(r, c);
        const target = board[to];
        if (kind === CHARIOT) {
          if (target === 0) out.push({ from, to });
          else { push(from, to); break; }
        } else if (!screen) {
          if (target === 0) out.push({ from, to });
          else screen = true;
        } else if (target !== 0) {
          push(from, to);
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  return out;
}

/**
 * Mọi nước đi hợp lệ.
 *
 * Hai điều kiện, không phải một: tướng mình không được bị chiếu **và** hai tướng không được nhìn
 * thẳng nhau. Cái thứ hai là chỗ cờ tướng khác cờ vua, và nó không phải một luật phụ — một nước
 * dời quân ra khỏi cột giữa mà để hở mặt tướng là một nước không đi được, dù nó chẳng liên quan
 * gì tới quân nào của mình.
 */
export function moves(pos) {
  const { board, turn } = pos;
  const them = turn === RED ? BLACK : RED;
  const out = [];

  // Đi rồi lùi **ngay trên bàn đang có**, không chép ra bàn mới.
  //
  // Cách viết thẳng thớm là `apply` rồi hỏi thế mới; nó đúng và nó chậm gấp mấy lần. Bàn cờ
  // tướng chín mươi ô, mỗi thế có bốn mươi nước, và cái máy hỏi câu này vài chục nghìn lần một
  // lượt — nên bốn mươi lần cấp phát một `Int8Array` cho mỗi nút là chỗ tốn nhất của cả trò.
  //
  // Chỉ an toàn vì hai dòng lùi lại nằm ngay dưới hai dòng đi, không có `await` và không có
  // nhánh nào ở giữa. Viết kiểu này ở chỗ khác thì là một cái bẫy; ở đây nó là chỗ duy nhất
  // đáng đổi sự thẳng thớm lấy tốc độ, và nó được ghim bằng perft.
  for (const move of pseudoMoves(pos)) {
    const taken = board[move.to];
    board[move.to] = board[move.from];
    board[move.from] = 0;

    const king = kingAt(board, turn);
    const bad = (king >= 0 && attacked(board, king, them)) || facing(board);

    board[move.from] = board[move.to];
    board[move.to] = taken;

    if (!bad) out.push(move);
  }
  return out;
}

export function apply(pos, move, quick = false) {
  const next = copy(pos);
  const taken = next.board[move.to];
  next.board[move.to] = next.board[move.from];
  next.board[move.from] = 0;
  next.half = taken !== 0 ? 0 : pos.half + 1;
  if (pos.turn === BLACK) next.full = pos.full + 1;
  next.turn = pos.turn === RED ? BLACK : RED;
  next.seen = quick ? pos.seen : [...pos.seen, keyOf(pos)];
  return next;
}

/**
 * Ván này đã xong chưa.
 *
 * **Hết nước đi là thua**, dù có đang bị chiếu hay không. Đây là chỗ cờ tướng khác cờ vua rõ
 * nhất: bên kia hoà, bên này thua. Ai chuyển từ cờ vua sang hay quên đúng chỗ đó.
 *
 * Còn luật cấm chiếu mãi thì ở đây **rút gọn thành lặp ba lần là hoà**. Luật thật phân biệt ai
 * là bên gây ra thế lặp — chiếu mãi thì bên chiếu thua, đuổi mãi thì bên đuổi thua — và nó là
 * một tập luật dài mà các giải khác nhau còn ghi khác nhau. Rút gọn thì mất phần phạt bên chiếu
 * mãi; ván ấy thành hoà thay vì thành thua cho họ. Ghi ra đây vì đó là một chỗ **cố ý** khác
 * luật thi đấu, không phải một chỗ chưa làm.
 */
export function status(pos) {
  if (!moves(pos).length) {
    return { over: inCheck(pos) ? 'mate' : 'stalemate', winner: pos.turn === RED ? BLACK : RED };
  }
  if (pos.half >= 120) return { over: 'fifty', winner: null };

  const key = keyOf(pos);
  let same = 1;
  for (const before of pos.seen) if (before === key) same++;
  if (same >= 3) return { over: 'repeat', winner: null };

  return null;
}

// ---- cái máy ------------------------------------------------------------------------------

/// Quân đáng bao nhiêu. Xe là quân mạnh nhất; pháo đầu ván hơn mã, cuối ván thì kém — ở đây lấy
/// một con số ở giữa, vì máy này nhìn xa ba nước chứ không phân biệt giai đoạn.
export const WORTH = [0, 0, 200, 200, 400, 900, 450, 100];

/// Tốt sang sông đáng gấp đôi, và càng gần cung địch càng đáng. Đây là điều đầu tiên ai học cờ
/// tướng cũng được dạy, và không có nó thì máy giữ tốt ở nhà tới hết ván.
const SOLDIER_PLACE = [
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  90, 90, 110, 120, 120, 120, 110, 90, 90,
  90, 90, 110, 120, 120, 120, 110, 90, 90,
  70, 70, 90, 100, 100, 100, 90, 70, 70,
  50, 50, 60, 70, 70, 70, 60, 50, 50,
  20, 20, 20, 30, 30, 30, 20, 20, 20,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
];

/// Mã và pháo thích đứng giữa bàn, và ghét đứng ở góc.
const CENTRE = [
  0, 2, 4, 6, 6, 6, 4, 2, 0,
  2, 4, 6, 8, 8, 8, 6, 4, 2,
  4, 6, 10, 12, 14, 12, 10, 6, 4,
  6, 8, 12, 16, 18, 16, 12, 8, 6,
  6, 8, 14, 18, 20, 18, 14, 8, 6,
  6, 8, 14, 18, 20, 18, 14, 8, 6,
  6, 8, 12, 16, 18, 16, 12, 8, 6,
  4, 6, 10, 12, 14, 12, 10, 6, 4,
  2, 4, 6, 8, 8, 8, 6, 4, 2,
  0, 2, 4, 6, 6, 6, 4, 2, 0,
];

export function evaluate(pos) {
  const { board } = pos;
  let score = 0;
  for (let at = 0; at < board.length; at++) {
    const piece = board[at];
    if (piece === 0) continue;
    const kind = typeOf(piece);
    const red = colourOf(piece) === RED;
    // Bảng viết theo góc nhìn Đỏ; Đen đọc cùng bảng ấy lật ngược.
    const square = red ? at : squareAt(RANKS - 1 - rowOf(at), colOf(at));

    let worth = WORTH[kind];
    if (kind === SOLDIER) worth += SOLDIER_PLACE[square];
    else if (kind === HORSE || kind === CANNON) worth += CENTRE[square];

    score += red ? worth : -worth;
  }
  return pos.turn === RED ? score : -score;
}

function order(pos, list) {
  const { board } = pos;
  return list
    .map((move) => {
      const taken = board[move.to];
      const gain = taken === 0 ? 0 : WORTH[typeOf(taken)] * 10 - WORTH[typeOf(board[move.from])];
      return { move, gain };
    })
    .sort((a, b) => b.gain - a.gain)
    .map((one) => one.move);
}

/// Cờ tướng không có nước nào đổi bàn cờ ở một ô mà nó không nhắc tới — không nhập thành, không
/// bắt qua đường. Nên nó rỗng, và nó **có mặt** để bên gọi không phải hỏi đang chơi trò nào.
export const extrasOf = () => ({});

export const MATE = 100_000;

export const RULES = {
  moves, pseudoMoves, apply, evaluate, order, inCheck, status, MATE,
  quiet: (pos, move) => pos.board[move.to] === 0,
  // Hết nước đi là thua, có bị chiếu hay không — đó là cờ tướng.
  dead: (_pos, ply) => -(MATE - ply),
};

/**
 * Nước máy chọn.
 *
 * Trần nút thấp hơn hẳn cờ vua — mười tám nghìn so với sáu mươi — và không phải vì cờ tướng dễ
 * hơn. Sinh nước đi ở đây đắt hơn nhiều: mỗi nước phải thử rồi hỏi lại *hai* câu (tướng có bị
 * chiếu không, và hai tướng có nhìn nhau không), mà bàn thì rộng chín mươi ô. Cùng một trần nút,
 * cờ tướng ngốn gần mười lần thời gian của cờ vua.
 *
 * Con bot này chạy một luồng và phục vụ nhiều bàn: một lượt nghĩ bốn trăm mili giây là mọi bàn
 * khác đứng im trong ngần ấy. Nên trần đặt ở chỗ một lượt nghĩ nằm trong khoảng một phần mười
 * giây, và cái máy thì cứ nhìn xa được tới đâu thì nhìn.
 */
export function choose(pos, level = 3) {
  return think(pos, RULES, { level, nodes: 18_000 });
}
