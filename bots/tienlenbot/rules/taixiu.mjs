/**
 * Luật tài xỉu: ba con xúc xắc, một cái bát, và **tổng** của chúng.
 *
 * Khác bầu cua ở đúng một chỗ, mà chỗ ấy đổi cả trò: bầu cua đặt vào *mặt* nào ra thì ăn mặt
 * ấy, còn ở đây ba con chỉ có nghĩa khi cộng lại. Nên cửa không phải là mặt xúc xắc — cửa là
 * một câu nói về cái tổng: nó lớn hay nhỏ, chẵn hay lẻ, hay cả ba con giống hệt nhau.
 *
 * Thuần và không biết gì về mạng, như mọi file trong thư mục này: số vào, số ra.
 */

import { randomInt } from 'node:crypto';

/// How many dice are thrown. Three, and everything below is arithmetic on the three of them.
export const TX_DICE = 3;

/**
 * The doors, in the order they sit on the mat.
 *
 * Xỉu first and tài second because that is the order of the numbers, and a mat where the small
 * one is on the right is a mat everybody reads backwards once.
 */
export const TX_DOORS = ['xiu', 'tai', 'chan', 'le', 'bao'];

export const TX_DOOR_NAMES = {
  xiu: 'Xỉu', tai: 'Tài', chan: 'Chẵn', le: 'Lẻ', bao: 'Bão',
};

/**
 * What a winning stake comes back with, on top of itself.
 *
 * One for one on the four even-money doors, thirty for one on bão. Thirty and not thirty-five:
 * a triple is one throw in thirty-six, so thirty is the house keeping a little under fourteen
 * percent of what goes on that door — the lottery price everybody in the country knows it at.
 */
export const TX_PAYS = { xiu: 1, tai: 1, chan: 1, le: 1, bao: 30 };

/// Xỉu is four to ten, tài is eleven to seventeen. Three and eighteen are missing from both on
/// purpose: the only ways to reach them are 1-1-1 and 6-6-6, and a triple is bão.
export const TX_SMALL = [4, 10];
export const TX_BIG = [11, 17];

/// How long the bát is shaking for. The dice are decided at the end of it and not the start:
/// what the bot has not worked out yet is not in any push anybody could read early.
export const TX_ROLL_MS = Number(process.env.TIENLEN_TX_ROLL_MS ?? 1_700);

/// How long a finished throw stays up before the next window opens.
///
/// Longer than bầu cua's, and for a reason that is the whole of this game: there are two things
/// to lift here rather than one. The bát comes off, and then the three dice are turned over one
/// at a time — so the room this needs is the room a whole nặn needs, not the room a result needs
/// to be read.
export const TX_SHOW_MS = Number(process.env.TIENLEN_TX_SHOW_MS ?? 5_600);

/// How long the board takes bets for.
export const TX_BETTING_MS = Number(process.env.TIENLEN_TX_BETTING_MS ?? 25_000);

/// How many throws the cầu remembers.
///
/// Thirty-six rather than bầu cua's thirty, because this board is drawn as a road — one column
/// a run — and a road is worth reading only as far back as it has runs in it.
export const TX_HISTORY = 36;

/// What may be put on a door in one tap. The same three as the bầu cua bowl on purpose: the two
/// games sit side by side on one menu and share a purse, and two different ladders of chips
/// would be two different games to learn.
export const TX_CHIPS = [1_000, 5_000, 20_000];

/// The one table everybody shares. There is exactly one and nobody opens it.
export const TX_WORLD = 'taixiu';

/**
 * Three dice, one to six each.
 *
 * Takes nothing, exactly as `roll` in bầu cua takes nothing: it cannot see who is at the table,
 * what is on the board, or how much of it, because there is no argument through which it could.
 * That is the whole of the guarantee and it is worth being able to read it in three lines.
 *
 * `randomInt(6)` rather than scaling a float, for the reason six always has: it does not divide
 * a power of two, so rounding a float leaves two faces very slightly likelier than the rest.
 */
export function txRoll() {
  return Array.from({ length: TX_DICE }, () => randomInt(6) + 1);
}

/// What the three of them come to. The only number this game is about.
export const txTotal = (dice) => dice.reduce((sum, one) => sum + one, 0);

/**
 * Bão: all three the same.
 *
 * The rule that makes tài xỉu tài xỉu rather than a coin. Six throws out of two hundred and
 * sixteen, and on every one of them **tài, xỉu, chẵn and lẻ all lose** — which is where the
 * house's two and eight tenths percent comes from, and why the two ranges are written 4–10 and
 * 11–17 rather than 3–10 and 11–18.
 */
export const isBao = (dice) => dice[0] === dice[1] && dice[1] === dice[2];

/// Whether one door came up.
export function txHits(door, dice) {
  const bao = isBao(dice);
  if (door === 'bao') return bao;
  // Everything else is a statement about the total, and a triple silences all of them.
  if (bao) return false;

  const sum = txTotal(dice);
  if (door === 'tai') return sum >= TX_BIG[0] && sum <= TX_BIG[1];
  if (door === 'xiu') return sum >= TX_SMALL[0] && sum <= TX_SMALL[1];
  if (door === 'chan') return sum % 2 === 0;
  if (door === 'le') return sum % 2 === 1;
  return false;
}

/// Every door this throw paid. What the mat lights up.
export const txWon = (dice) => TX_DOORS.filter((door) => txHits(door, dice));

/**
 * What one stake on one door is worth once the dice have landed.
 *
 * Returned as the **change** to somebody's gold, the way bầu cua's is: `+stake × what the door
 * pays` on a hit and `−stake` on a miss. Not "stake back plus winnings" — nothing has left the
 * purse yet at the moment this is asked, because nothing is taken until the dice are down.
 */
export function doorWorth(stake, door, dice) {
  if (!stake) return 0;
  if (!TX_DOORS.includes(door)) return 0;
  return txHits(door, dice) ? stake * TX_PAYS[door] : -stake;
}

/// What a whole board of stakes is worth to one person. Doors nobody backed are simply not in
/// `bets`.
export function txBoardWorth(bets, dice) {
  let change = 0;
  for (const door of TX_DOORS) change += doorWorth(bets?.[door] ?? 0, door, dice);
  return change;
}

/// Everything staked on this board, which is the most it can lose.
export const txStaked = (bets) =>
  TX_DOORS.reduce((sum, door) => sum + (bets?.[door] ?? 0), 0);

/**
 * The throw, said in the words the table uses.
 *
 * One place rather than five: the widget draws the total, the road draws a bead, the line under
 * the bát reads out what happened, and all three are asking the same question.
 */
export function txOutcome(dice) {
  const bao = isBao(dice);
  const sum = txTotal(dice);
  return {
    total: sum,
    bao,
    // Which side of the table it fell. Nothing at all on a bão, which is the point of a bão.
    side: bao ? null : sum >= TX_BIG[0] ? 'tai' : 'xiu',
    parity: bao ? null : sum % 2 === 0 ? 'chan' : 'le',
    won: txWon(dice),
  };
}
