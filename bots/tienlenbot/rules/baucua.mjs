/**
 * Luật bầu cua tôm cá: sáu mặt, ba con xúc xắc, và tiền về theo mặt.
 *
 * Thuần và không biết gì về mạng: mọi thứ ở đây nhận vào bài hoặc số và trả về bài hoặc số.
 * Đó là lý do nó tách ra khỏi `tienlenbot.mjs` — một luật chơi kiểm được bằng một phép gọi hàm
 * là một luật chơi kiểm được, còn một luật chơi chỉ kiểm được qua một cái bàn đang chạy thì
 * không.
 */

import { randomInt } from 'node:crypto';

/**
 * The six faces, in the order they sit on a board.
 *
 * Kept as names rather than numbers because the widget draws each of them and the state has to
 * say which is which. Three dice, six faces, and everything below is counting.
 */
export const FACES = ['bau', 'cua', 'tom', 'ca', 'ga', 'nai'];

export const FACE_NAMES = {
  bau: 'Bầu', cua: 'Cua', tom: 'Tôm', ca: 'Cá', ga: 'Gà', nai: 'Nai',
};

/// How many dice are thrown. Three, and the whole shape of the game is that number.
export const DICE = 3;

/// How long the bowl is shaking for.
///
/// Long enough to be a throw rather than a number appearing, short enough that nobody watching
/// four rounds in a row starts wishing it were shorter. The dice are decided at the end of it
/// and not the start: what the bot has not worked out yet is not in any push anybody could read.
export const ROLL_MS = Number(process.env.TIENLEN_ROLL_MS ?? 1_600);

/// How long a finished throw stays up before the next round opens.
///
/// Longer than it needs to be for reading a result, because the result is under a plate that
/// somebody has to lift. Whoever does not lift it has it lifted for them after a moment; this
/// is the room the two of those need between them.
export const SHOW_MS = Number(process.env.TIENLEN_SHOW_MS ?? 5_000);

/// How many throws the board of past throws remembers.
///
/// Thirty, which is about ten minutes of a sòng and as many columns as fit across a phone. Old
/// throws say nothing about new ones — the dice have no memory — but reading the run of them is
/// half of what people are doing while they wait, and a game that hides it is a game pretending
/// its players are somebody else.
export const HISTORY = 30;

/// How long a table with more than one person at it takes bets for.
export const BETTING_MS = Number(process.env.TIENLEN_BETTING_MS ?? 25_000);

/// What may be put on a face in one tap.
export const CHIPS = [1_000, 5_000, 20_000];

/// The one sòng everybody shares. A fixed name rather than a counted one, because there is
/// exactly one of it and it has to be findable without being looked up.
export const WORLD = 'world';

/// How many people fit round one board. Wider than a card table because nobody takes turns —
/// everybody is betting on the same three dice at the same time.
export const BAUCUA_SEATS = 8;

/**
 * Three dice.
 *
 * Takes nothing. It cannot see who is at the table, what is on the board, or how much of it —
 * there is no argument through which it could, and it is called after the betting has closed.
 * That is the whole of the guarantee and it is worth being able to read it in four lines.
 *
 * `randomInt(6)` rather than `floor(chance() * 6)`. Six does not divide a power of two, so
 * scaling a float leaves two of the faces very slightly likelier than the other four — about
 * seven parts in a thousand million million, which nobody could ever measure and which there is
 * no reason to carry. `randomInt` rejects and re-draws instead, and is exactly uniform.
 */
export function roll() {
  return Array.from({ length: DICE }, () => FACES[randomInt(FACES.length)]);
}

/**
 * What one stake on one face is worth once the dice have landed.
 *
 * The rule everybody at a pavement table knows: the stake comes back with as much again for
 * every die showing that face, and goes if none of them do. So a thousand on cua is worth a
 * thousand, two, or three — or nothing at all, three times out of four.
 *
 * Returned as the *change* to somebody's gold, which is what the ledger moves by: `+n × stake`
 * on a hit and `−stake` on a miss. Not "stake back plus winnings", because there is no moment
 * here where the stake has left and might come back — nothing is taken until this says so.
 */
export function faceWorth(stake, face, dice) {
  if (!stake) return 0;
  const hits = dice.filter((one) => one === face).length;
  return hits ? stake * hits : -stake;
}

/**
 * What a whole board of stakes is worth to one person.
 *
 * `bets` is a face-to-stake object, and faces nobody put anything on are simply not in it.
 */
export function boardWorth(bets, dice) {
  let change = 0;
  for (const face of FACES) change += faceWorth(bets?.[face] ?? 0, face, dice);
  return change;
}

/// Everything staked on this board, which is the most it can lose.
export const staked = (bets) =>
  FACES.reduce((sum, face) => sum + (bets?.[face] ?? 0), 0);

/// Which faces came up, and how many times each. What the widget lights up.
export function tally(dice) {
  const counted = {};
  for (const face of dice) counted[face] = (counted[face] ?? 0) + 1;
  return counted;
}
