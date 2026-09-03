/**
 * Cái máy nghĩ, dùng chung cho cả hai bàn cờ.
 *
 * Cờ vua và cờ tướng khác nhau ở mọi quân và mọi ô, nhưng **cách nghĩ thì một**: đi thử, để đối
 * phương đi nước tốt nhất của họ, và chọn nhánh nào mình còn khá nhất sau đó. Nên chỗ này không
 * biết gì về quân cờ cả — nó nhận vào một bộ luật (`moves`, `apply`, `evaluate`) và một thế cờ.
 *
 * Viết một lần chứ không hai, vì hai bản của cùng một thuật toán là hai bản lệch nhau dần: sửa
 * một cái cắt tỉa ở bên này rồi quên bên kia là hai con máy chơi khác hẳn nhau mà không ai biết
 * vì sao.
 *
 * **Trần là số nút, không phải đồng hồ.** Con bot này chạy một luồng và phục vụ nhiều bàn cùng
 * lúc: một lượt nghĩ dài là mọi bàn khác đứng im trong ngần ấy. Đếm nút thì cắt được ở chỗ định
 * trước, và — quan trọng hơn cho việc kiểm — cùng một thế cờ bao giờ cũng ra cùng một nước, dù
 * chạy trên máy nào.
 */

/**
 * Hai cái đồng hồ một bàn cờ chạy trên.
 *
 * Một lượt cờ dài hơn hẳn một lượt bài: ở tiến lên người ta đọc mười ba lá và đánh, ở đây người
 * ta *nghĩ*. Sáu mươi giây, và hết giờ thì máy đi hộ một nước — cùng lối với phỏm, và vì cùng
 * một lý do: một cái bàn đứng im thì không phân biệt được với một người đang suy nghĩ, và bàn
 * nào cũng có hai người đợi.
 *
 * Nhịp nghĩ của máy thì ngược lại: nó **giả vờ chậm**. Máy tính xong trong mấy chục mili giây,
 * mà một quân tự nhảy ngay lúc tay mình vừa rời ra thì không đọc ra là có ai đang chơi.
 */
export const BOARD_TURN_MS = Number(process.env.TIENLEN_BOARD_TURN_MS ?? 60_000);
export const BOARD_THINK_MS = Number(process.env.TIENLEN_BOARD_THINK_MS ?? 900);

/// Điểm của một thế đã chiếu bí. Trừ đi số nước đã đi, để máy chọn đường bí **nhanh nhất**: bí
/// sau ba nước hơn bí sau bảy nước, mà nếu không trừ thì hai cái ấy bằng nhau và máy đi vòng
/// quanh mãi không kết thúc.
const mateIn = (mate, ply) => -(mate - ply);

/**
 * Chỉ đếm tiếp những nước **ăn quân**, khi đã hết độ sâu.
 *
 * Không có nó thì máy dừng ngay sau khi vừa ăn một con xe và ghi lại "đang hơn một xe" — mà nước
 * sau đối phương ăn lại. Cái đó gọi là hiệu ứng chân trời, và nó là khác biệt giữa một con máy
 * yếu và một con máy đi những nước không ai hiểu nổi.
 */
function quiesce(pos, rules, alpha, beta, count) {
  count.n++;
  const stand = rules.evaluate(pos);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  // Chỉ nước ăn quân, và chỉ khi còn ngân sách. Hết ngân sách thì trả về chỗ đang đứng — một con
  // số hơi thô còn hơn một lượt nghĩ không bao giờ dừng.
  if (count.n > count.cap) return alpha;

  for (const move of rules.order(pos, rules.moves(pos).filter((one) => !rules.quiet(pos, one)))) {
    const score = -quiesce(rules.apply(pos, move, true), rules, -beta, -alpha, count);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function alphaBeta(pos, rules, depth, alpha, beta, ply, count) {
  count.n++;
  if (count.n > count.cap) return rules.evaluate(pos);

  const list = rules.moves(pos);
  if (!list.length) {
    // Hết nước đi. Ở cờ vua, bị chiếu là bí và không bị chiếu là hoà; ở cờ tướng thì cả hai đều
    // là thua. Bộ luật tự nói, vì đó là chỗ hai trò khác nhau thật.
    return rules.dead(pos, ply);
  }
  if (depth <= 0) return quiesce(pos, rules, alpha, beta, count);

  let best = -Infinity;
  for (const move of rules.order(pos, list)) {
    const score = -alphaBeta(rules.apply(pos, move, true), rules,
      depth - 1, -beta, -alpha, ply + 1, count);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Nước máy chọn.
 *
 * Đào sâu dần: xong độ sâu một mới sang độ sâu hai, và giữ lại nước tốt nhất của **độ sâu cuối
 * cùng chạy trọn**. Nhờ thế cắt ở giữa chừng vẫn có nước để đi — chứ không phải nửa cây tìm dở
 * rồi lấy bừa. Và nước tốt nhất của vòng trước được xét trước ở vòng sau, cắt được rất nhiều.
 *
 * `level` là số nước nhìn xa nhất. Không phải để chỉnh độ khó — để chỉnh **thời gian một lượt**:
 * đây là một con bot trong phòng chat, không phải một cái engine.
 */
export function think(pos, rules, { level = 3, nodes = 60_000 } = {}) {
  const list = rules.moves(pos);
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const count = { n: 0, cap: nodes };
  let best = list[0];
  let score = -Infinity;

  for (let depth = 1; depth <= level; depth++) {
    let bestHere = null;
    let scoreHere = -Infinity;
    let alpha = -Infinity;

    // Nước hay nhất của vòng trước đi trước. Đây là cả lý do đào sâu dần lại **nhanh hơn** đánh
    // thẳng vào độ sâu cuối, dù nó làm lại từ đầu mỗi vòng.
    const order = rules.order(pos, list);
    const first = order.indexOf(best);
    if (first > 0) order.splice(0, 0, ...order.splice(first, 1));

    for (const move of order) {
      const value = -alphaBeta(rules.apply(pos, move, true), rules,
        depth - 1, -Infinity, -alpha, 1, count);
      if (value > scoreHere) { scoreHere = value; bestHere = move; }
      if (value > alpha) alpha = value;
      if (count.n > count.cap) break;
    }

    // Chỉ nhận kết quả của một vòng **chạy trọn**. Một vòng bị cắt giữa chừng đã xét vài nước
    // đầu và bỏ hết phần còn lại, nên "hay nhất" của nó là hay nhất trong một danh sách bị cụt.
    if (count.n <= count.cap && bestHere) { best = bestHere; score = scoreHere; }
    if (count.n > count.cap) break;
    // Đã thấy đường bí thì thôi, không cần nhìn xa hơn.
    if (Math.abs(score) > rules.MATE - 1000) break;
  }

  return best;
}

export { mateIn };
