/**
 * Bộ bài: lá, chất, chia bài, và nguồn ngẫu nhiên.
 *
 * Thuần và không biết gì về mạng: mọi thứ ở đây nhận vào bài hoặc số và trả về bài hoặc số.
 * Đó là lý do nó tách ra khỏi `tienlenbot.mjs` — một luật chơi kiểm được bằng một phép gọi hàm
 * là một luật chơi kiểm được, còn một luật chơi chỉ kiểm được qua một cái bàn đang chạy thì
 * không.
 */
import { randomInt } from 'node:crypto';

/// Low to high, which is the whole of the ordering.
///
/// A card is one number, `rank * 4 + suit`, and that number *is* its strength: 3♠ is 0 and 2♥
/// is 51. Every comparison in the game — a higher single, a higher pair, a longer run — is
/// then `>` on an integer, and there is no second place for the ordering to be written down
/// differently.
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

/// Bích, chuồn, rô, cơ. The suit breaks a tie between equal ranks and nothing else.
export const SUITS = ['♠', '♣', '♦', '♥'];

/// The rank that cannot be in a run, and the one every bomb exists to cut.
export const TWO = 12;

export const rankOf = (card) => Math.floor(card / 4);
export const suitOf = (card) => card % 4;
export const nameOf = (card) => RANKS[rankOf(card)] + SUITS[suitOf(card)];

export const deck = () => Array.from({ length: 52 }, (_, i) => i);

/**
 * A number in [0, 1), from the operating system rather than from V8.
 *
 * `Math.random` is xorshift128+. It is fast, it is fine for anything nobody is betting on, and
 * its internal state can be recovered from its own output — which is the whole of the problem
 * here. The dice are thrown *after* the bets are down, this bot plays for gold, and its source
 * is public: three of these decide a throw, and a throw happens in front of everybody every
 * twenty-five seconds. That is an oracle handed to anybody who wants one.
 *
 * There was a comment on the shuffle saying `Math.random` was fine because a deal happens in
 * one go and predicting it predicts nothing that has not already happened. That was true of the
 * deal and was never true of the dice, and it stopped being a safe thing to write down at all
 * the moment the repository went public.
 */
/// Forty-seven bits of it. `randomInt` will not span more than 2⁴⁸ − 1 in one call, and a
/// number of bits that fits well inside that is worth more than a number that sits on the edge
/// of it.
const SPREAD = 2 ** 47;
export const chance = () => randomInt(0, SPREAD) / SPREAD;

/**
 * A deal, shuffled.
 *
 * Thirteen each however many are sitting down, and the rest of the deck is simply not used.
 * That is how the game is played at a short table: three people are not dealt seventeen
 * cards, they are dealt thirteen and the game is quicker.
 */
export function deal(players, random = chance) {
  const cards = deck();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return Array.from({ length: players }, (_, seat) =>
    cards.slice(seat * 13, seat * 13 + 13).sort((a, b) => a - b));
}
