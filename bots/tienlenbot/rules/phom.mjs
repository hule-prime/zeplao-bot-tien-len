/**
 * Luật phỏm (tá lả), và cái máy chơi nó.
 *
 * Thuần và không biết gì về mạng, y như luật tiến lên bên cạnh.
 *
 * **Một lá bài ở đây không đọc như một lá bài bên tiến lên.** Cùng một con số 0–51, cùng cách
 * `hạng * 4 + chất`, nhưng hạng thì khác hẳn: tiến lên xếp 3 thấp nhất và 2 cao nhất, phỏm xếp
 * A thấp nhất và K cao nhất — và A ở phỏm còn đáng đúng một điểm. Hai cách đọc trên cùng một con
 * số là chỗ dễ lẫn nhất trong cả file này, nên hai trò có hai bộ hàm đọc riêng và không dùng
 * chung `rankOf` với nhau bao giờ.
 */
import { SUITS, deck, chance } from './cards.mjs';
import { payouts } from '../economy.mjs';

/// A thấp nhất, K cao nhất, và điểm đúng bằng mặt bài.
export const PHOM_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const phomRank = (card) => Math.floor(card / 4);
export const phomSuit = (card) => card % 4;
export const phomName = (card) => PHOM_RANKS[phomRank(card)] + SUITS[phomSuit(card)];

/// A một điểm, K mười ba. Đây là toàn bộ cách tính điểm của trò này.
export const points = (card) => phomRank(card) + 1;

/// Chín lá mỗi người, riêng người cầm cái mười — lá thứ mười ấy là lượt đi đầu của họ.
export const PHOM_DEAL = 9;

/// Mỗi người bốn lượt. Hết lượt thứ tư của người cuối là hết ván.
export const PHOM_TURNS = 4;

/**
 * Máy nghĩ bao lâu, cho **mỗi nửa lượt**.
 *
 * Một lượt phỏm là hai việc — lấy một lá rồi đánh một lá — và máy làm cả hai trong cùng một
 * nhịp thì nhìn ra là một cái bàn tự nhảy: tay người ta dài thêm rồi ngắn lại trong cùng một
 * khung hình, và không ai kịp thấy nó lấy gì. Nên nghỉ hai lần, đẩy trạng thái ở giữa, và mỗi
 * nửa đủ dài để đọc được.
 */
export const PHOM_THINK_MS = Number(process.env.TIENLEN_PHOM_THINK_MS ?? 1_300);

/// Móm — hết ván không có phỏm nào — thua gấp đôi.
export const MOM = 2;

/// Ù ăn gấp đôi phần thường, thu của từng người.
export const U = 2;

/**
 * Chia bài.
 *
 * Người cầm cái mười lá và đi đầu bằng cách đánh ra một lá; những người còn lại chín. Phần thừa
 * là nọc, và nọc hết là ván hết dù chưa đủ bốn vòng.
 */
export function phomDeal(players, random = chance) {
  const cards = deck();
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const hands = [];
  let at = 0;
  for (let seat = 0; seat < players; seat++) {
    const many = seat === 0 ? PHOM_DEAL + 1 : PHOM_DEAL;
    hands.push(cards.slice(at, at + many).sort((a, b) => a - b));
    at += many;
  }
  return { hands, stock: cards.slice(at) };
}

// ---- phỏm là gì ------------------------------------------------------------------------------

/// Ba lá trở lên: cùng hạng khác chất, hoặc liên tiếp cùng chất.
export function isMeld(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return false;

  const seen = new Set();
  for (const card of cards) {
    if (!Number.isInteger(card) || card < 0 || card > 51) return false;
    if (seen.has(card)) return false;
    seen.add(card);
  }

  const sorted = [...cards].sort((a, b) => a - b);
  const ranks = sorted.map(phomRank);

  if (ranks.every((rank) => rank === ranks[0])) return true;

  const suit = phomSuit(sorted[0]);
  if (!sorted.every((card) => phomSuit(card) === suit)) return false;
  return ranks.every((rank, i) => i === 0 || rank === ranks[i - 1] + 1);
}

/**
 * Mọi phỏm dựng được từ tay bài này.
 *
 * Bộ ba đồng hạng thì liệt kê mọi cách chọn chất; sảnh thì mọi đoạn liên tiếp cùng chất. Không
 * cắt bớt gì cả — chín, mười lá thì số phỏm đếm được là vài chục, và cắt bớt ở đây là cắt mất
 * đúng cái cách chia làm điểm rác nhỏ nhất.
 */
export function meldsOf(hand) {
  const melds = [];

  const byRank = new Map();
  const bySuit = new Map();
  for (const card of [...hand].sort((a, b) => a - b)) {
    const rank = phomRank(card);
    const suit = phomSuit(card);
    if (!byRank.has(rank)) byRank.set(rank, []);
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    byRank.get(rank).push(card);
    bySuit.get(suit).push(card);
  }

  for (const [, cards] of byRank) {
    if (cards.length < 3) continue;
    if (cards.length === 3) { melds.push([...cards]); continue; }
    melds.push([...cards]);
    for (let out = 0; out < cards.length; out++) {
      melds.push(cards.filter((_, i) => i !== out));
    }
  }

  for (const [, cards] of bySuit) {
    for (let from = 0; from < cards.length; from++) {
      for (let to = from + 2; to < cards.length; to++) {
        const run = cards.slice(from, to + 1);
        const ranks = run.map(phomRank);
        if (ranks.every((rank, i) => i === 0 || rank === ranks[i - 1] + 1)) melds.push(run);
        else break;
      }
    }
  }

  return melds;
}

/**
 * Cách chia tay bài cho điểm rác nhỏ nhất.
 *
 * Quy hoạch động trên bitmask, y như bên tiến lên và vì đúng lý do đó: một tay phỏm nhiều nhất
 * mười lá, tức là 2¹⁰ = 1.024 trạng thái, nên hỏi "chia thế nào là ít điểm rác nhất" thì trả lời
 * *chính xác* rẻ hơn là đoán.
 *
 * Trả về `{ melds, junk, points }`.
 */
export function bestSplit(hand) {
  const order = [...hand].sort((a, b) => a - b);
  const n = order.length;
  if (!n) return { melds: [], junk: [], points: 0 };

  const index = new Map(order.map((card, i) => [card, i]));
  const masks = meldsOf(order).map((meld) => ({
    meld,
    mask: meld.reduce((mask, card) => mask | (1 << index.get(card)), 0),
  }));

  const full = (1 << n) - 1;
  const junkOf = new Int32Array(1 << n);
  for (let mask = 0; mask <= full; mask++) {
    let total = 0;
    for (let bit = 0; bit < n; bit++) if (mask & (1 << bit)) total += points(order[bit]);
    junkOf[mask] = total;
  }

  // `best[mask]` — điểm rác nhỏ nhất của đúng những lá trong `mask`, và phỏm đầu tiên đã dùng.
  const best = new Int32Array(1 << n);
  const took = new Int32Array(1 << n).fill(-1);
  for (let mask = 1; mask <= full; mask++) {
    best[mask] = junkOf[mask];
    for (let i = 0; i < masks.length; i++) {
      const { mask: part } = masks[i];
      if ((part & mask) !== part) continue;
      const rest = best[mask ^ part];
      if (rest < best[mask]) { best[mask] = rest; took[mask] = i; }
    }
  }

  const melds = [];
  let mask = full;
  while (mask && took[mask] !== -1) {
    const { meld, mask: part } = masks[took[mask]];
    melds.push([...meld]);
    mask ^= part;
  }

  const junk = [];
  for (let bit = 0; bit < n; bit++) if (mask & (1 << bit)) junk.push(order[bit]);

  return { melds, junk, points: best[full] };
}

/// Điểm rác của tay bài, chia theo cách tốt nhất.
export const junkOf = (hand) => bestSplit(hand).points;

/// Ù: cả tay vào phỏm hết, không còn lá rác nào.
export const isU = (hand) => hand.length >= 9 && bestSplit(hand).junk.length === 0;

// ---- ăn và gửi -------------------------------------------------------------------------------

/**
 * Những phỏm ăn được lá vừa đánh ra.
 *
 * Ăn là ghép **ngay** thành phỏm với ít nhất hai lá đang cầm — không phải cầm về rồi tính sau.
 * Chỉ trả về phỏm đúng ba lá, vì lá thứ tư trở đi vẫn nằm trên tay và gửi được lúc hạ; ăn thành
 * bộ to hơn không cho thêm gì mà lại khoá mất mấy lá kia.
 */
export function eatOptions(hand, card) {
  if (card === null || card === undefined) return [];
  return meldsOf([...hand, card])
    .filter((meld) => meld.length === 3 && meld.includes(card));
}

export const canEat = (hand, card) => eatOptions(hand, card).length > 0;

/**
 * Những lá rác gửi được vào phỏm đã hạ trên bàn.
 *
 * Gửi được thì không tính điểm, nên đây là chỗ cuối cùng để bớt điểm. Chỉ ai đã hạ được phỏm
 * mới được gửi — móm thì ôm trọn.
 */
export function sendable(junk, melds) {
  const sent = [];
  const table = melds.map((meld) => [...meld]);

  for (const card of [...junk].sort((a, b) => points(b) - points(a))) {
    for (const meld of table) {
      if (isMeld([...meld, card])) { meld.push(card); sent.push(card); break; }
    }
  }
  return sent;
}

// ---- cái máy ---------------------------------------------------------------------------------

/**
 * Ăn hay bốc.
 *
 * Ăn khi nó thật sự bớt điểm rác. Nghe hiển nhiên, nhưng cái bẫy là ăn xong vẫn phải nhả ra một
 * lá: ăn một lá ba điểm rồi buộc phải đánh đi một lá mười một điểm là ăn để lỗ tám điểm. Nên
 * phép so là **điểm rác sau khi ăn và đã đánh đi lá tốt nhất**, chứ không phải điểm rác lúc vừa
 * ăn xong.
 *
 * `card` là lá người trước vừa đánh, hoặc null nếu không có gì để ăn.
 */
export function phomChoose(hand, card, { late = false } = {}) {
  if (card === null || card === undefined) return null;
  const options = eatOptions(hand, card);
  if (!options.length) return null;

  const now = junkOf(hand);
  const after = bestAfterTaking(hand, card);
  if (after === null) return null;

  // Gần chốt thì ăn cẩn thận: ăn lá cuối rồi người sau ù là đền cả làng, mà tay còn nhiều rác
  // thì cái ù ấy chẳng bù lại được gì.
  if (late && now > 10 && after >= now) return null;

  return after < now ? options[0] : null;
}

/// Điểm rác thấp nhất đạt được nếu cầm lá này về rồi đánh đi một lá.
function bestAfterTaking(hand, card) {
  const held = [...hand, card];
  if (isU(held)) return 0;

  let best = null;
  for (const out of held) {
    if (out === card) continue;              // ăn xong nhả lại đúng lá vừa ăn thì vô nghĩa
    const rest = held.filter((one) => one !== out);
    const junk = junkOf(rest);
    if (best === null || junk < best) best = junk;
  }
  return best;
}

/**
 * Đánh lá nào.
 *
 * Lá rác đắt nhất mà bỏ đi ít tiếc nhất, và có nhìn sang người kế bên. `theirEaten` là những lá
 * người sau đã ăn trong ván này — họ ăn 7♥ thì họ đang gom quanh chỗ đó, và nhả thêm một lá
 * quanh đó là nuôi họ.
 */
export function phomDiscard(hand, { theirEaten = [], theirDiscarded = [] } = {}) {
  const split = bestSplit(hand);
  const junk = split.junk.length ? split.junk : [...hand];

  let worst = null;
  let worstCost = -Infinity;

  for (const card of junk) {
    const rest = hand.filter((one) => one !== card);
    // Bỏ lá này đi thì tay còn lại bao nhiêu điểm. Thấp là tốt, nên điểm bỏ đi là điểm âm của nó.
    let cost = -junkOf(rest);

    // Lá đang chờ: giữ 6♥7♥ thì còn cửa 5♥ và 8♥, mà một lá rác có cửa thì chưa hẳn là rác.
    cost -= waiting(rest, card) * 4;

    // Đừng nuôi người sau.
    if (feeds(card, theirEaten)) cost -= 12;
    // Lá họ vừa đánh đi thì họ không cần, nhả ra an toàn.
    if (theirDiscarded.some((one) => phomRank(one) === phomRank(card))) cost += 6;

    if (cost > worstCost) { worstCost = cost; worst = card; }
  }

  return worst ?? hand[0];
}

/// Lá này còn bao nhiêu cửa để thành phỏm — đếm số lá ngoài kia ghép được với những gì còn lại.
function waiting(rest, card) {
  let cửa = 0;
  for (let one = 0; one < 52; one++) {
    if (one === card || rest.includes(one)) continue;
    if (meldsOf([...rest, card, one]).some((meld) => meld.includes(one) && meld.includes(card))) {
      cửa++;
    }
  }
  return cửa;
}

/// Nhả lá này ra thì người sau có ăn được không, đoán từ những gì họ đã ăn.
function feeds(card, eaten) {
  return eaten.some((one) => phomRank(one) === phomRank(card)
    || (phomSuit(one) === phomSuit(card) && Math.abs(phomRank(one) - phomRank(card)) <= 2));
}

// ---- hết ván -------------------------------------------------------------------------------

/**
 * Điểm cuối ván của từng ghế, sau khi hạ và gửi.
 *
 * `laid` là thứ tự hạ bài — bằng điểm thì ai hạ sau thua, nên thứ tự ấy là một phần của luật
 * chứ không phải chuyện trang trí.
 */
export function phomScores(hands, { laid = [] } = {}) {
  const splits = hands.map((hand) => bestSplit(hand));
  const table = splits.flatMap((split) => split.melds.map((meld) => [...meld]));

  return splits.map((split, seat) => {
    // Chưa hạ được phỏm nào là móm, và móm thì không được gửi.
    const mom = split.melds.length === 0;
    const sent = mom ? [] : sendable(split.junk, table);
    const left = split.junk.filter((card) => !sent.includes(card));
    return {
      seat,
      melds: split.melds,
      junk: left,
      sent,
      mom,
      points: left.reduce((total, card) => total + points(card), 0),
      laidAt: laid.indexOf(seat) === -1 ? laid.length : laid.indexOf(seat),
    };
  });
}

/**
 * Chia tiền một ván phỏm.
 *
 * Cùng khung với tiến lên, để một cái ví ba trò không có ba cách hiểu về "thắng bao nhiêu":
 * xếp hạng rồi trả theo `payouts`. Trên đó là ba thứ riêng của phỏm — móm thua gấp đôi, ù ăn
 * gấp đôi từ mỗi người, và đền là trả thay cả làng.
 *
 * Máy không bao giờ được trả tiền, y như bên tiến lên. Bàn dưới hai người thật thì đánh với nhà
 * ở mức cược cố định, và mọi khoản riêng của phỏm đứng yên.
 */
export function phomSettle(seats, scores, stake, { u = null, owes = null, house = false } = {}) {
  const people = seats.filter((one) => !one.bot);
  if (!people.length) return [];

  const alone = people.length < 2;
  const worth = stake;

  // Ít điểm nhất thắng; bằng điểm thì ai hạ sau thua.
  const order = [...scores]
    .filter((one) => alone || !seats[one.seat].bot)
    .sort((a, b) => a.points - b.points || a.laidAt - b.laidAt);

  const share = payouts(alone ? seats.length : people.length);

  const paid = [];
  const at = new Map();
  order.forEach((one, place) => {
    const who = seats[one.seat];
    if (who.bot) return;
    const row = {
      userId: who.userId,
      displayName: who.displayName,
      seat: one.seat,
      place,
      // How many places there were. At a table of one person and three machines the human is
      // ranked among four, but only one row is paid — and naming a place out of the number of
      // rows told somebody who came first that they came bét.
      of: alone ? seats.length : people.length,
      points: one.points,
      mom: one.mom,
      placing: Math.round((share[place] ?? 0) * worth),
      extra: 0,
      owes: 0,
      change: 0,
    };
    row.change = row.placing;
    paid.push(row);
    at.set(who.userId, row);
  });

  // Ù. Không có thứ hạng nào cả — ván dừng ngay lúc ù, chưa ai kịp hạ.
  if (u !== null) {
    const winner = at.get(u);
    if (winner) {
      for (const row of paid) { row.placing = 0; row.change = 0; }
      const others = paid.length - 1;
      winner.extra = U * worth * others;
      winner.change = winner.extra;
      winner.place = 0;
      for (const row of paid) {
        if (row.userId === u) continue;
        row.extra = -U * worth;
        row.change = row.extra;
      }
    }
  } else {
    // Móm: phần thua nhân đôi, và phần cộng thêm ấy về tay người thắng.
    let carried = 0;
    for (const row of paid) {
      if (!row.mom || row.placing >= 0) continue;
      row.extra = row.placing * (MOM - 1);
      row.change += row.extra;
      carried -= row.extra;
    }
    if (carried) {
      const top = paid.find((row) => row.place === 0);
      if (top) { top.extra += carried; top.change += carried; }
    }
  }

  // Đền: một người trả thay tất cả những người thua.
  if (owes) {
    const owing = at.get(owes);
    if (owing) {
      // The payer pays the winners — not "the payer takes on the losers' debts", which is only
      // the same arithmetic while the payer is losing too.
      let owed = 0;
      for (const row of paid) {
        if (row.userId === owes) continue;
        if (row.change > 0) { owed += row.change; continue; }
        if (row.change < 0) { row.owes = -row.change; row.change = 0; }
      }
      owing.owes = -owed - owing.change;
      owing.change = -owed;
    }
  }

  return paid;
}
