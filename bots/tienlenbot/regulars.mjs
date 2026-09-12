/**
 * Nhóm **tay máy**: máy có ví, ngồi vào bàn chế độ người, đặt cược thật.
 *
 * Chỗ này là phần **quyết định** — ai thức, ngồi bàn nào, nghĩ bao lâu, đứng dậy khi nào — và nó
 * thuần y như mọi thứ dưới `rules/`: nhận vào số và trả ra số, không một cái `await` nào, không
 * biết mạng là gì. Cùng một lý lẽ, và lý lẽ ấy đã được viết ra ở đó rồi:
 *
 *   > *That is what lets a rule be checked with a function call rather than with a running table.*
 *
 * Phần **thi hành** nằm trong `tienlenbot.mjs`, và nó không được có một quyết định nào.
 *
 * Kế hoạch đầy đủ: [docs/ke-hoach-tay-may.md](../../docs/ke-hoach-tay-may.md).
 *
 * ---
 *
 * **Hai chữ, đừng lẫn.** `bot` là *đồ đạc* — con máy lấp ghế trống ở bàn "đấu với máy", không ví,
 * không được trả đồng nào, app không hề biết nó tồn tại. `house` là *nhà đi nước hộ ghế này* —
 * và một tay máy thì `house: true` mà `bot: false`, vì với mọi phép tính tiền nó **là** một
 * người. Xem `driven()` trong `tienlenbot.mjs`.
 */

import { MACHINES, TURN_MS } from './rules/tienlen.mjs';
import { MIN_STAKE, dayIn } from './economy.mjs';

/**
 * Bật tắt cả nhóm bằng một biến môi trường, không cần deploy.
 *
 * Không thương lượng. Một thứ chạy tự động, đụng vào ví người thật, và chỉ tắt được bằng một lần
 * deploy là một thứ không tắt được vào lúc ba giờ sáng — mà ba giờ sáng là lúc người ta cần tắt
 * nó.
 *
 * **Hàm, không phải hằng số.** Một hằng số đọc `process.env` lúc nạp module là một hằng số chỉ
 * đúng với cái môi trường lúc file được `import`, và một `import` thì chạy **trước** mọi câu lệnh
 * trong file gọi nó. Bộ test đã vấp đúng chuyện ấy một lần rồi và phải nạp bot bằng
 * `await import()` để lách — chỗ này thì không cần lách, chỉ cần hỏi lúc dùng.
 */
export const on = () => process.env.TIENLEN_HOUSE !== '0';

// ---- thang bậc --------------------------------------------------------------------------------
//
// Đã truyền thông là "siêu máy tính vào chiến đấu cùng người chơi", nên thang bậc này là một lời
// hứa công khai chứ không phải một cái nhãn dán. Ba điều nó phải giữ:
//
//   1. **Mức cao phải thật sự đánh hay hơn mức thấp.** Có test canh — nếu thứ tự tỉ lệ thắng
//      không đúng thứ tự thang bậc thì cái thang là một lời nói dối.
//   2. **Không mức nào được nhìn bài người khác.** `chooseMove` đã nói câu ấy từ đầu và nó giữ
//      nguyên ở mọi mức: *"A machine that looked at the hands would win every game and be no fun
//      for one, and it would be cheating for two."* Một con máy mạnh vì nhìn trộm không phải là
//      một con máy mạnh.
//   3. **Không hạ sức đánh của một con đã công bố ở mức nào đó để cân pot.** Cân bằng cách đổi
//      *bao nhiêu con mỗi mức thức*, không bằng cách biến cái nhãn thành lời nói dối.

/**
 * `slack` là **lấy nước tốt thứ mấy**.
 *
 * `chooseMove` đã xếp sẵn mọi nước đi được theo giá, nên "đánh dở hơn" ở đây không phải một con
 * AI thứ hai — nó là lùi xuống vài bậc trong đúng cái danh sách ấy. Đó là cách một người đánh dở
 * thật sự đánh dở: không phải đi nước điên, mà là bỏ lỡ nước hay nhất.
 *
 * `depth` là độ sâu cho hai bàn cờ, đi thẳng vào `choose(pos, level)` đã có sẵn.
 */
export const TIERS = {
  'so-cap': { name: 'Sơ cấp', slack: 2, depth: 1, nodes: 6_000 },
  kha: { name: 'Khá', slack: 1, depth: 3, nodes: 60_000 },
  sieu: { name: 'Siêu máy tính', slack: 0, depth: 5, nodes: 400_000 },
};

export const LEVELS = Object.keys(TIERS);

// ---- ai ---------------------------------------------------------------------------------------

/**
 * Tên đọc như tên người, **không** đọc như tên máy.
 *
 * `MACHINES` là năm cái tên vui — *Tư Ròm, Út Mập, Ba Gà, Năm Lì, Sáu Bảnh* — và chúng đọc ra là
 * máy, đó là chủ ý. Tay máy thì ngồi ở bàn chế độ người và ăn tiền thật, nên nó cần một danh
 * sách khác.
 *
 * **Hai danh sách không bao giờ được giao nhau.** Thấy "Tư Ròm" là đồ đạc ở bàn đấu máy rồi lại
 * thấy "Tư Ròm" ăn tiền thật ở bàn người là hai thứ khác hẳn nhau đội chung một cái tên. Có test
 * canh phép giao là rỗng.
 *
 * Cái nhãn thì nằm ở **bảng vàng**, không nằm ở cái tên: ở bàn chơi nó là một người ngồi xuống,
 * trên bảng nó có một dấu nói nó là máy.
 *
 * Danh sách này dài hơn số con thật sự dùng, và **cố ý dài hơn**: số con là một biến môi trường,
 * nên cái quyết định "nuôi bao nhiêu" không được phép là "sửa code rồi deploy". Hết tên thì dừng
 * ở số tên có — thà ít hơn con số xin còn hơn hai con trùng tên, hay một cái tên có đánh số đằng
 * sau, thứ mà nhìn một cái là biết.
 */
const NAMES = [
  'Hùng', 'Mai', 'Quân', 'Linh', 'Thắng', 'Trang', 'Dũng', 'Hà',
  'Nam', 'Vy', 'Khoa', 'Thu', 'Bảo', 'Ngọc', 'Sơn', 'Yến',
  'Tuấn', 'Phương', 'Đạt', 'Nhung', 'Hải', 'Loan', 'Kiên', 'Thảo',
  'Long', 'Huyền', 'Phúc', 'Hạnh', 'Tùng', 'Nga', 'Vinh', 'Diệp',
  'Cường', 'Xuân', 'Hiếu', 'Oanh', 'Trung', 'Lan', 'Tâm', 'Chi',
  'Thành', 'Dương', 'Lâm', 'Quyên', 'Hoàng', 'Tú', 'Nghĩa', 'Hiền',
  'Duy', 'Ánh', 'Minh Anh', 'Bích', 'Toàn', 'Giang', 'Việt', 'Thuý',
  'Đức', 'Nhi', 'Khánh', 'Uyên', 'Lộc', 'Trâm', 'Phong', 'Tuyết',
];

/// Bỏ dấu, để `house:hùng` không thành một cái id có dấu tiếng Việt trong đường dẫn và trong log.
const slugOf = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Nuôi bao nhiêu con.
 *
 * **Một biến môi trường, không phải một con số trong code.** Hai mươi con hay năm mươi con là
 * một quyết định vận hành — nó đổi theo việc sòng đông hay vắng, theo pot còn bao nhiêu, theo
 * việc hôm nay có ai chơi không — và một quyết định vận hành mà phải deploy mới đổi được là một
 * quyết định người ta thôi không đổi nữa.
 *
 * Kẹp ở số tên có. Xin nhiều hơn thì log nói ra, chứ không im lặng đẻ ra hai con trùng tên.
 */
export const count = () => Math.max(0, Math.min(
  Number(process.env.TIENLEN_HOUSE_COUNT ?? 24) || 0,
  NAMES.length,
));

/**
 * Tỉ lệ ba mức trong dân số — và **đây là cái núm cân pot**.
 *
 * Không cân bằng cách hạ sức đánh của một con đã công bố ở mức nào đó: làm thế là biến cái nhãn
 * thành lời nói dối. Cân bằng cách đổi **bao nhiêu con mỗi mức**, và cái đó thì hoàn toàn thật —
 * một sòng có nhiều tay mới hay nhiều tay già là một sòng khác nhau, không phải một sòng nói dối.
 *
 * Rải theo chu kỳ hai mươi chứ không bốc ngẫu nhiên, để hai lần khởi động ra cùng một dân số.
 */
const SPREAD = [
  'so-cap', 'kha', 'kha', 'sieu', 'so-cap', 'kha', 'kha', 'so-cap', 'kha', 'sieu',
  'so-cap', 'kha', 'kha', 'so-cap', 'kha', 'sieu', 'so-cap', 'kha', 'so-cap', 'sieu',
];

/**
 * Cả nhóm, dựng một lần lúc nạp và không đổi.
 *
 * `userId` bịa ở phía bot y như `machine:g12:0`, và **không bao giờ đưa cho app** — có test đọc
 * mọi `showSession` và đỏ nếu thấy một `house:` trong đó. Khác một chỗ: **bền**, không gắn với
 * `game.id`, vì nó phải có một dòng trong sổ sống qua mọi lần khởi động lại. Thêm con thứ hai
 * mươi lăm thì hai mươi bốn con cũ giữ nguyên id, nguyên ví, nguyên chỗ trên bảng.
 *
 * `pace` và `nerve` là hai nét riêng, để cái bàn không đọc ra là hai mươi bản sao của cùng một
 * người: `pace` là nghĩ nhanh hay chậm, `nerve` là dám ngồi bàn to tới đâu. Suy ra từ vị trí chứ
 * không bốc ngẫu nhiên — một người quen thì tuần sau vẫn là người ấy, và một cái test bốc lại
 * mỗi lần chạy là một cái test không canh được gì.
 */
const ALL = NAMES.map((name, at) => ({
  userId: `house:${slugOf(name)}`,
  displayName: name,
  level: SPREAD[at % SPREAD.length],
  house: true,
  pace: 0.7 + ((at * 7) % 9) / 10,          // 0,7 – 1,5
  nerve: 0.5 + ((at * 5) % 9) / 10,         // 0,5 – 1,3
}));

/// Nhóm đang nuôi, cắt ra từ danh sách đầy đủ. **Cắt từ đầu, luôn luôn** — đó là cái làm cho
/// việc nâng con số lên không đụng tới một con nào đang có: thêm con thứ hai mươi lăm thì hai
/// mươi bốn con cũ giữ nguyên id, nguyên ví, nguyên chỗ trên bảng.
export const roster = () => ALL.slice(0, count());

export const rosterNames = () => roster().map((one) => one.displayName);

/// Tên nào cũng chỉ được là một thứ. Kiểm ngay lúc nạp module chứ không đợi một cái test: hai
/// danh sách giao nhau là một lỗi không bao giờ nên lên tới được server.
for (const name of NAMES) {
  if (MACHINES.includes(name)) {
    throw new Error(`"${name}" vừa là tên máy đồ đạc vừa là tên tay máy`);
  }
}

export const isHouse = (userId) => typeof userId === 'string' && userId.startsWith('house:');

// ---- cái pot ----------------------------------------------------------------------------------

/// Mỗi con được gieo bấy nhiêu, **một lần**.
///
/// Đủ ngồi mười lăm ván ở mức hai chục nghìn mà không cháy — tức là đủ cho một buổi tối xui. Một
/// tay máy cháy sau ba ván là một cái ghế lại trống sau ba ván.
export const SEED_EACH = Number(process.env.TIENLEN_HOUSE_SEED ?? 300_000);

/**
 * Trần một cái ví — và **mặc định là không có trần**.
 *
 * Nó từng có, và lý do thì thật: tay máy lên **bảng vàng chung**, nên một con mức cao đánh cả
 * ngày sẽ leo lên đầu bảng rồi ở đó, và một cái bảng vàng do máy chiếm đầu là cái bảng không ai
 * còn muốn leo.
 *
 * Chủ sòng quyết khác, ngày 12/09: **cứ để nó đánh hết sức, leo top thì leo**. Đó là một quyết
 * định về sản phẩm chứ không phải về kỹ thuật, và nó có lý của nó — một con máy có tên, có nhãn,
 * đứng nhất bảng là một cái đích để người ta nhắm vào, chứ không phải một lời nói dối; chuyện máy
 * vào chơi đã nói ra công khai rồi.
 *
 * Cái phải nói ra kèm theo, vì nó là cái giá: **pot phình nghĩa là vàng chảy từ ví người chơi
 * sang nhóm nhà.** Cái trần từng là van chặn chiều ấy. Không có nó thì thứ duy nhất còn canh
 * chiều ngược lại là `FLOOR` — và `FLOOR` chỉ canh lúc nhà **thua**, không canh lúc nhà thắng.
 * Người vận hành nhìn pot mỗi lần khởi động, và đó là chỗ chuyện ấy hiện ra.
 *
 * Cơ chế giữ nguyên, tắt bằng số không, bật lại bằng một biến môi trường — vì một quyết định sản
 * phẩm thì đổi được, còn một đoạn code đã xoá thì phải viết lại.
 */
export const CAP_EACH = Math.max(0, Number(process.env.TIENLEN_HOUSE_CAP ?? 0) || 0);

/// Dưới mức này thì cả nhóm ngồi ra hết.
///
/// Pot cạn là một **tín hiệu**, không phải một cái lỗi: nó nghĩa là người chơi đang thắng, tức là
/// vàng đã chảy từ pot sang ví người thật. Không tự nạp lại — nạp lại là một quyết định của
/// người vận hành, vì một cái pot tự nạp là một cái vòi đội mũ khác.
export const FLOOR = Number(process.env.TIENLEN_HOUSE_FLOOR ?? SEED_EACH * 2);

/**
 * Chia lại phần vượt trần.
 *
 * Thuần và tổng bằng không: cái trả ra cộng lại đúng bằng cái lấy đi, không hơn một đồng, không
 * kém một đồng. Có test canh đúng câu ấy, vì đây là hàm duy nhất trong file có thể in tiền nếu
 * cộng sai — cùng một cái bẫy với `shareOut` bên `economy.mjs`, và cùng một cách canh.
 *
 * Hoà thì xếp theo id, để cùng một tình huống chia hai lần ra cùng một kết quả.
 */
export function spill(rows, cap = CAP_EACH) {
  // Không có trần thì không có gì để chia lại. Số không là "tắt", không phải "trần bằng không".
  if (!cap) return [];
  const over = rows.filter((one) => one.gold > cap);
  if (!over.length) return [];

  const taken = over.reduce((sum, one) => sum + (one.gold - cap), 0);
  const under = rows
    .filter((one) => one.gold <= cap)
    .sort((a, b) => a.gold - b.gold || String(a.userId).localeCompare(String(b.userId)));

  // Không có ai để nhận thì không lấy của ai. Phần vượt ở nguyên đó — thà một cái bảng hơi lệch
  // còn hơn một đồng vàng bốc hơi.
  if (!under.length) return [];

  // Xếp cả **phía người trả** theo id, không chỉ phía người nhận.
  //
  // Phần không còn chỗ để rải được trả ngược theo đúng thứ tự mảng này, nên để nguyên thứ tự
  // người gọi đưa sang là để "ai được giữ lại phần dư" phụ thuộc vào thứ tự một cái `Map` trả
  // về hôm ấy. Cùng một cuốn sổ chia hai lần phải ra cùng một kết quả — câu ấy nằm trong
  // docstring, và trước dòng này nó chỉ đúng với một nửa hàm.
  const moved = [...over]
    .sort((a, b) => String(a.userId).localeCompare(String(b.userId)))
    .map((one) => ({ userId: one.userId, got: cap - one.gold }));

  /**
   * Rải phần lấy được, và **người nhận cũng bị kẹp ở trần**.
   *
   * Bản đầu chia đều cho mọi ví dưới trần mà không hỏi từng ví còn trống bao nhiêu — nên một con
   * đang nằm sát trần nhận đúng bằng một con rỗng túi, rồi **vượt lên trên trần**. Tiền vẫn
   * không sinh không mất, nhưng cái trần thì thủng, và cái trần là toàn bộ lý do hàm này tồn
   * tại. Với `cap = 100` và ba ví `200 / 90 / 10`, bản đầu ra `100 / 140 / 60` trong khi có cách
   * chia cho cả ba cùng đứng ở trần.
   *
   * Nên rải theo vòng: mỗi vòng chia đều cho những ví **còn chỗ**, ai đầy thì ra khỏi vòng sau.
   * Dừng khi hết tiền hoặc hết chỗ — và phần không còn chỗ để nhận thì **ở lại với người vượt
   * trần**, chứ không bốc hơi.
   */
  const room = new Map(under.map((one) => [one.userId, cap - one.gold]));
  const got = new Map(under.map((one) => [one.userId, 0]));
  let left = taken;

  while (left > 0) {
    const open = under.filter((one) => room.get(one.userId) > 0);
    if (!open.length) break;

    const each = Math.floor(left / open.length);
    if (each < 1) {
      // Phần lẻ cuối: một đồng một người, từ ví nghèo nhất lên, đúng lối `shareOut` chia phần dư.
      for (const one of open) {
        if (left <= 0) break;
        room.set(one.userId, room.get(one.userId) - 1);
        got.set(one.userId, got.get(one.userId) + 1);
        left--;
      }
      break;
    }
    for (const one of open) {
      const take = Math.min(each, room.get(one.userId));
      room.set(one.userId, room.get(one.userId) - take);
      got.set(one.userId, got.get(one.userId) + take);
      left -= take;
    }
  }

  // Không rải hết thì trả lại cho người vượt trần, chia ngược theo đúng tỉ lệ đã lấy. Thà cái
  // trần hở một chút còn hơn một đồng vàng biến mất.
  if (left > 0) {
    for (const one of moved) {
      if (left <= 0) break;
      const back = Math.min(left, -one.got);
      one.got += back;
      left -= back;
    }
  }

  for (const one of under) {
    if (got.get(one.userId) > 0) moved.push({ userId: one.userId, got: got.get(one.userId) });
  }

  return moved.filter((one) => one.got !== 0);
}

// ---- ai thức, và bao giờ ----------------------------------------------------------------------

/**
 * Bao nhiêu con thức, theo giờ.
 *
 * Sòng Việt đông lúc tám giờ tối và vắng lúc năm giờ sáng. Một nhóm đánh đều tăm tắp suốt hai
 * mươi tư giờ là một nhóm mà nhìn vào danh sách bàn lúc bốn giờ sáng là biết ngay.
 *
 * Tính theo **giờ Việt Nam**: `dayIn` bên `economy.mjs` đã đặt sẵn quy ước +7 cho việc ngày đổi
 * lúc nửa đêm ở đây chứ không phải ở London, và dùng lại nó thì hai chỗ không bao giờ lệch nhau.
 */
/// **Tỉ lệ, không phải con số đếm.** Hai mươi con hay năm mươi con đều phải đọc ra là cùng một
/// cái sòng — đông lúc tám giờ tối, vắng lúc năm giờ sáng — và một bảng số tuyệt đối thì chỉ
/// đúng ở đúng cái quy mô nó được viết ra. Đổi `TIENLEN_HOUSE_COUNT` mà phải sửa cả bảng này
/// nữa là hai chỗ phải nhớ, và chỗ thứ hai là chỗ bị quên.
const BY_HOUR = [
  /* 0h */ 0.30, 0.20, 0.12, 0.08, 0.06, 0.08,
  /* 6h */ 0.14, 0.20, 0.26, 0.32, 0.38, 0.44,
  /* 12h */ 0.50, 0.44, 0.38, 0.38, 0.44, 0.56,
  /* 18h */ 0.74, 0.88, 1.00, 0.94, 0.76, 0.50,
];

export const hourIn = (at = Date.now()) => new Date(at + 7 * 3600_000).getUTCHours();

/**
 * Cái nhóm đang khoẻ tới đâu, và nó được phép làm gì.
 *
 * Một hàm chứ không phải ba, vì ba câu hỏi ấy đều đọc từ cùng một con số và tách ra là ba chỗ để
 * lệch nhau.
 */
export function health(pot, now = Date.now(), many = count()) {
  const open = on() && many > 0 && pot >= FLOOR;
  if (!open) return { open, awake: 0 };
  // Ép cứng số con thức, nếu người vận hành muốn thế. Không phải để test — để **nhìn**: một cái
  // sòng vắng lúc bốn giờ sáng là đúng, nhưng người đang xem thử một thay đổi lúc bốn giờ sáng
  // thì không có gì để nhìn cả, và "chờ tới tối" không phải một cách làm việc.
  const forced = Math.max(0, Number(process.env.TIENLEN_HOUSE_AWAKE ?? 0) || 0);
  if (forced > 0) return { open, awake: Math.min(forced, many) };
  // `Math.min` ở ngoài cùng, vì cái sàn hai con nói dối khi cả nhóm chỉ có một con — và `awake()`
  // che được chuyện ấy còn cái log thì không. Hai người đọc cùng một hàm phải ra cùng một số.
  return { open, awake: Math.min(many, Math.max(2, Math.round(BY_HOUR[hourIn(now)] * many))) };
}

/**
 * Ai thức, giờ này.
 *
 * Chọn **cố định theo giờ** chứ không bốc ngẫu nhiên mỗi lần gọi: hàm này được gọi mấy giây một
 * lần, và bốc lại mỗi lần là mười sáu con chớp tắt liên tục — ngồi xuống rồi biến mất giữa ván.
 * Cùng một giờ thì cùng một nhóm người, và đó cũng là cái đọc ra giống đời hơn.
 */
export function awake(now = Date.now(), group = roster(), pot = Infinity) {
  if (!group.length) return [];
  const many = Math.min(health(pot, now, group.length).awake, group.length);
  if (!many) return [];

  const hour = hourIn(now);
  // Xoay theo giờ, để không phải lúc nào cũng đúng mấy con đầu bảng thức.
  return [...group.slice(hour % group.length), ...group.slice(0, hour % group.length)]
    .slice(0, many);
}

// ---- ngồi xuống -------------------------------------------------------------------------------

/**
 * Bàn to nhất con này chịu ngồi.
 *
 * **Đây là cái chặn chính** chứ không phải một nét tính cách. `BOT_STAKE` cố định mười nghìn ở
 * bàn đấu máy tồn tại vì một lý do mà `economy.mjs` nói thẳng: *"A table anybody can open at any
 * stake and then fill with machines is a table that prints gold."* Tay máy làm cái chốt ấy hết
 * tác dụng, vì bàn có tay máy là bàn giữa người với người và đánh đúng mức của phòng — nên một
 * người có thể mở bàn một triệu, đợi tay máy vào lấp, và cày cái pot.
 *
 * Năm phần trăm cái ví, nhân với `nerve` của từng con. Nó cũng tình cờ là cái đọc ra giống người
 * nhất: không ai có ba trăm nghìn mà ngồi bàn một triệu.
 */
export function ceiling(one, gold) {
  return Math.max(MIN_STAKE, Math.floor(gold * 0.05 * one.nerve));
}

/**
 * Bàn nào con này muốn ngồi, nếu có.
 *
 * `tables` là đúng cái danh sách `openTables()` trả ra, nên chỗ này nhìn thấy y hệt cái một người
 * nhìn thấy trên màn hình của họ — không nhiều hơn một chữ.
 *
 * **Không phải bàn nào cũng ngồi, và không phải lúc nào cũng ngồi.** Một cái bàn vừa lên danh
 * sách đã đầy ngay là một cái bàn không ai *tìm thấy* nó cả; và một bàn bốn ghế lần nào cũng đầy
 * đúng ba con trong mười giây là bàn đấu máy đội mũ khác. Nên có `afterMs`, và nên có cả việc
 * **không ai tới** — để cái bàn hết giờ và bị quét, y như đời.
 */
/**
 * Mấy cái bàn con này **ngồi được**, trong số đang mở.
 *
 * Tách ra khỏi `wants` vì hai câu hỏi khác nhau, và chúng chỉ giống nhau chừng nào không ai hỏi
 * câu thứ hai: *"có bàn nào ngồi được không"* khác *"lần này có ngồi không"*. Người gọi phải
 * phân biệt được, vì **có bàn mà lần này không ngồi thì tuyệt đối không được đi mở bàn khác**.
 *
 * Đó là một lỗi thật, bắt được ở bộ flow test: một người mở bàn bốn ghế, sáu con thức, và cả sáu
 * lần lượt bỏ lượt rồi đi mở bàn của riêng chúng — **năm cái bàn** trong tám giây, và cái bàn
 * của người thật thì không ai vào. Nhìn từ ngoài, đó là đúng cái thứ nhóm này sinh ra để chữa,
 * làm ngược lại.
 *
 * Người ta không làm thế. Thấy một cái bàn ngồi được thì hoặc ngồi, hoặc đứng đó nhìn — không ai
 * mở một cái bàn thứ hai ngay cạnh cái mình vừa chê.
 */
export function fits(one, tables, gold) {
  const most = ceiling(one, gold);
  return tables.filter((table) => table.stake <= most && table.stake <= gold);
}

export function wants(one, tables, gold, rng = Math.random) {
  const can = fits(one, tables, gold);
  if (!can.length) return null;

  /**
   * **Bàn sắp đủ người trước, rồi mới tới bàn rẻ.**
   *
   * Xếp ở đây chứ không trông vào thứ tự người gọi đưa sang: `openTables()` trả về theo thứ tự
   * bàn được mở, nên lấy "ba cái đầu danh sách" thực ra là chọn *bàn mở sớm nhất*.
   *
   * Còn **thiếu mấy ghế** đứng trước **giá** vì hai lý do, và cả hai đều thật:
   *
   * - Nó là cái người ta làm. Một cái bàn còn một ghế là một ván sắp bắt đầu; một cái bàn còn ba
   *   ghế là một chỗ ngồi đợi.
   * - Và không có nó thì cả nhóm **rải mỏng** ra mọi cái bàn đang mở, mỗi bàn được một hai người
   *   rồi đứng đó. Đo được: bốn mươi giây mà cái bàn bốn ghế mới có ba người, trong khi có thừa
   *   người rảnh — họ đang ngồi đợi ở hai cái bàn khác. Xếp theo chỗ thiếu thì họ dồn vào một
   *   cái, và cái ấy chia bài.
   */
  /// Còn thiếu mấy ghế. Chịu được một cái bàn không nói ghế của nó — `openTables()` lúc nào cũng
  /// nói, nhưng một hàm thuần không nên vỡ vì người gọi đưa thiếu một trường, và vỡ ở đây là vỡ
  /// trong một vòng lặp không ai đứng nhìn.
  const short = (table) => Math.max(0, (table.size ?? 0) - (table.names?.length ?? 0));

  const near = [...can].sort((a, b) =>
    short(a) - short(b)
    || a.stake - b.stake
    || String(a.id).localeCompare(String(b.id)));
  const pick = near[Math.floor(rng() * Math.min(near.length, 3))] ?? near[0];

  // Một phần tư số lần thì thôi, để lần sau. Đây là chỗ "có bàn mà không ai vào" tới từ.
  if (rng() < 0.25) return null;

  // `SPEED` chạm tới cả quãng này, không chỉ quãng nghĩ. Không có nó thì một bộ test đặt
  // `TIENLEN_HOUSE_SPEED` thấp sẽ thấy máy nghĩ hai mươi mili giây mà vẫn đợi mười ba giây mới
  // có con ngồi xuống — tức là cái núm ấy chữa được đúng một nửa thứ nó sinh ra để chữa.
  return {
    gameId: pick.id,
    // Một tới tám giây. Đủ lâu để không đọc ra là một cái bàn *được lấp* — nhưng một cái bàn bốn
    // ghế cần ba người, nên mười ba giây một người là bốn chục giây cái bàn đứng im, và cái đứng
    // im ấy là thứ người thật nhìn thấy.
    afterMs: Math.max(1, Math.round((1_200 + rng() * 6_800) * SPEED)),
  };
}

/**
 * Có mở một bàn mới không, và mở bàn thế nào.
 *
 * Chỉ mở khi **danh sách đang vắng**. Một nhóm cứ thấy trống là mở bàn sẽ đẩy danh sách đầy
 * những bàn không ai ngồi, và một danh sách toàn bàn chờ là một danh sách người ta thôi mở ra.
 *
 * Bàn tay máy mở là bàn **không có phòng**: `conversationId` rỗng, không có dòng mời trong chat
 * nào cả. Một cái bàn có một dòng trong phòng nó được mở ra, mà tay máy thì không ở trong phòng
 * nào — nên nó chỉ vào được **từ danh sách thế giới**. Chấp nhận được, và nó làm cái màn hình
 * đầu tiên của người mới không còn rỗng.
 */
export function opens(one, tables, gold, rng = Math.random, running = 0, free = 0) {
  // Đã đủ bàn chờ rồi thì thôi. Một nhóm cứ thấy trống là mở bàn sẽ đẩy danh sách đầy những bàn
  // không ai ngồi, và một danh sách toàn bàn chờ là một danh sách người ta thôi mở ra.
  if (tables.length >= waiting()) return null;
  // Và đã đủ bàn **đang chạy** thì cũng thôi. Mỗi bàn là một tay bài được chia, một cái máy nghĩ
  // mỗi lượt, và một vòng đẩy trạng thái — con bot này chạy một luồng.
  if (running >= maxTables()) return null;

  if (rng() < 0.55) return null;

  const most = ceiling(one, gold);
  const stakes = [1_000, 5_000, 10_000, 20_000].filter((money) => money <= most && money <= gold);
  if (!stakes.length) return null;

  /**
   * **Không mở bàn to hơn số người có thể ngồi vào nó.**
   *
   * Đây là một lỗi thật, bắt được ở lần chạy đầu tiên trên máy: lúc rạng sáng chỉ hai con thức,
   * mà con mở bàn lại mở bàn bốn ghế — một cái bàn **không bao giờ đầy được**, đứng đó tới lúc
   * `LOBBY_MS` quét đi, rồi con sau lại mở một cái y hệt. Nhìn từ ngoài vào nó là "có bàn mà
   * chẳng ai chơi", tức là đúng cái thứ nhóm này sinh ra để chữa, làm ngược lại.
   *
   * Cộng một, vì một cái ghế để dành cho **người thật** là điểm của cả việc này. Nhưng không cộng
   * nhiều hơn một: hai ghế trống chờ hai người lạ cùng lúc là chờ một chuyện không xảy ra.
   *
   * `free` mặc định **không**, không phải bốn. Người gọi quên truyền số con đang rảnh thì hàm
   * này phải hỏng theo chiều an toàn — không mở bàn nào — chứ không im lặng quay lại đúng cái
   * hành vi vừa được sửa. Một mặc định rộng rãi ở đây là một cái bẫy chờ lần refactor sau.
   */
  const room = Math.min(4, free + 1);
  if (room < 2) return null;

  return {
    size: rng() < 0.55 ? 2 : Math.min(4, room),
    stake: stakes[Math.floor(rng() * stakes.length)],
    kind: rng() < 0.75 ? 'tienlen' : 'phom',
  };
}

// ---- nhịp người -------------------------------------------------------------------------------

/**
 * Bao nhiêu bàn chờ là đủ, và bao nhiêu bàn chạy cùng lúc là đủ.
 *
 * **Vắng người thì nhóm tự chơi với nhau**, và đó là chủ ý: một cái sảnh có bàn đang chạy để
 * xem thì khác hẳn một cái sảnh trống trơn, và người đi ngang qua lúc ba giờ chiều thấy một bàn
 * đang đánh thì có cái để ngồi xuống cạnh. `running()` đã lọc theo `!one.bot`, mà tay máy thì
 * `bot: false` — nên bàn toàn tay máy **tự động** hiện ra ở danh sách bàn đang chơi, không phải
 * viết thêm gì.
 *
 * Bàn toàn tay máy là **tổng bằng không trong chính cái pot**: vàng đi từ ví con này sang ví con
 * kia và không một đồng nào ra khỏi nhóm. Nên cái giá của nó không phải là tiền, mà là CPU — con
 * bot này chạy một luồng và phục vụ mọi cái bàn khác trên cùng luồng ấy. Đó là cái `MAX_TABLES`
 * canh, và là lý do nó là một biến môi trường chứ không phải một con số trong đầu ai đó.
 */
/// Hàm, không phải hằng, cùng lý do với `on()` và `count()`: một con số đọc lúc nạp module là
/// một con số chỉ đúng với cái môi trường lúc file được `import`. Đặt cả hai về không là **đóng
/// băng cả nhóm tại chỗ** — không mở bàn nào nữa — mà vẫn giữ nguyên ví và nguyên dòng trong sổ.
export const maxTables = () => Math.max(0, Number(process.env.TIENLEN_HOUSE_TABLES ?? 6) || 0);
export const waiting = () => Math.max(0, Number(process.env.TIENLEN_HOUSE_WAITING ?? 3) || 0);

/**
 * Nhịp của cả nhóm, và **cái hệ số làm chậm cả nhóm lại**.
 *
 * Hai cái đồng hồ này ra biến môi trường vì cùng một lý do mọi đồng hồ khác trong kho này ra biến
 * môi trường: một bộ test chạy con bot **thật** thì phải rút ngắn được mọi quãng chờ, không thì
 * một cái test đợi người ta nghĩ ba giây một nước là một cái test không ai chạy.
 *
 * `SPEED` nhân vào mọi quãng nghĩ. Ở đời nó là một; trong test nó là một phần trăm, và lúc ấy
 * "nghĩ như người" vẫn còn nguyên hình dạng của nó — lệch phải, có đuôi dài — chỉ là hai giây
 * thành hai chục mili giây.
 */
export const BEAT_MS = Math.max(20, Number(process.env.TIENLEN_HOUSE_MS ?? 3_000) || 3_000);
export const SPEED = Math.max(0.001, Number(process.env.TIENLEN_HOUSE_SPEED ?? 1) || 1);

/**
 * Nghĩ bao lâu trước khi đi.
 *
 * `THINK_MS` của máy đồ đạc là 2.100, phẳng lì. Người thì một tới mười lăm giây, lệch phải, **lâu
 * hơn khi nước khó** — nhiều nước hợp lệ, bài còn dài — và thỉnh thoảng rất lâu vì họ vừa có tin
 * nhắn.
 *
 * Cái đuôi hiếm ấy không phải trang trí. Một cái ghế **chưa bao giờ** chạm tới cái đồng hồ ba
 * mươi giây là một cái ghế không có người ngồi: bàn thật nào cũng có người lơ đãng.
 *
 * Trả về mili giây, và người gọi phải nhớ ghi `thinkUntil` xuống — `sweep` đang giật lại lượt của
 * bất cứ ghế nào ngồi im quá `THINK_MS * 3`, tức là sáu giây, và một con đang nghĩ mười tám giây
 * sẽ bị giật mất nước nếu không ai nói cho `sweep` biết.
 */
export function thinkFor(one, { choices = 1, cards = 13, first = false } = {}, rng = Math.random) {
  // Nền: nghĩ nhanh hay chậm là nét riêng của từng con.
  let ms = (900 + rng() * 2_600) * one.pace;

  // Nước khó thì lâu hơn. Nhiều thứ để chọn là nhiều thứ để cân nhắc.
  ms += Math.min(choices, 12) * 140;
  // Bài còn dài thì còn phải đọc.
  ms += Math.min(cards, 13) * 60;
  // Nước đầu của một ván là lúc người ta ngồi đọc cả tay bài.
  if (first) ms += 1_200 + rng() * 2_000;

  // Và một lần trong hai mươi, họ đi đâu mất.
  if (rng() < 0.05) ms += 6_000 + rng() * 16_000;

  /**
   * Nhưng **không bao giờ chạm tới cái đồng hồ một lượt**.
   *
   * Hết `TURN_MS` thì `sweep` đi hộ một nước, và nước nó đi là nước rẻ nhất còn đánh được — tức
   * là một con mức cao vừa nghĩ ba mươi giây sẽ bị đánh hộ một nước dở. Chủ sòng nói *"cứ đánh
   * hết sức"*, và một lượt bị cướp mất thì không phải đánh hết sức.
   *
   * Nên cái đuôi dài để **nhìn** thì được, để mất lượt thì không: kẹp dưới `TURN_MS` một quãng đủ
   * rộng cho cả đường truyền lẫn một nhịp `sweep` lỡ. Cái ghế vẫn đọc ra là có người đang nghĩ
   * lâu — nó chỉ không bao giờ thật sự bỏ lượt.
   */
  return Math.min(Math.round(ms * SPEED), Math.max(1, Math.round((TURN_MS - 6_000) * SPEED)));
}

/**
 * Ván nữa, hay về?
 *
 * **Bắt buộc phải có**, không phải tô vẽ: `rematch` đếm `!one.bot && !one.away`, nên một tay máy
 * không bấm "ván nữa" là một cái bàn treo tới lúc bị quét — và người thật thì ngồi nhìn màn hình
 * "đang đợi" mà không đợi ai cả.
 *
 * Cả ba lối đều có thật ở bàn người, nên cả ba đều phải có ở đây.
 */
export function again(one, { hands = 1 } = {}, rng = Math.random) {
  // Đánh mãi một bàn thì cũng chán. Càng nhiều ván càng dễ đứng dậy.
  if (rng() < 0.12 + hands * 0.07) return 'leave';
  return 'rematch';
}

/// Đợi bao lâu rồi mới bấm "ván nữa". Không ai bấm ngay lúc màn hình vừa hiện.
export const againAfter = (one, rng = Math.random) =>
  Math.max(1, Math.round((1_200 + rng() * 6_000) * SPEED));

/// Một ngày, cho cái log biết hôm nay pot đi đâu.
export const today = dayIn;
