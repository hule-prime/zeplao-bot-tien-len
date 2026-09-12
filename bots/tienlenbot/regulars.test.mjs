/**
 * Bộ test của nhóm **tay máy**.
 *
 * `regulars.mjs` thuần — nhận vào số, trả ra số, không một cái `await` nào — nên cả cái phần
 * *quyết định* của nhóm kiểm được bằng phép gọi hàm, không cần một cái bàn chạy. Đó chính là lý do
 * nó được viết ra thành một file riêng, và file này là chỗ thu tiền của cái lựa chọn ấy.
 *
 * Cái đáng canh nhất ở đây không phải là bot đánh hay hay dở — đó là việc của
 * `tienlenbot.flow.test.mjs`. Cái đáng canh nhất là **vàng**: `spill()` là hàm duy nhất trong
 * module đụng tới ví của cả nhóm cùng một lúc, và một hàm như thế mà cộng sai thì nó không báo
 * lỗi, nó chỉ in tiền. Cùng một cái bẫy với `shareOut` bên `economy.mjs`, nên cùng một cách canh.
 *
 * **Mọi câu hỏi về môi trường đều hỏi lúc gọi, không phải lúc nạp.** `on()`, `count()`, `roster()`
 * là hàm chứ không phải hằng số đúng vì chuyện ấy, và ở đây nó đọc ra thành một thứ rất cụ thể:
 * đặt `process.env` rồi gọi hàm là xong, không cần mẹo `await import('./regulars.mjs?n=8')` để
 * lách cái thứ tự "import chạy trước mọi câu lệnh". Test nào đụng vào môi trường thì trả lại
 * nguyên trạng trong `finally`, vì cả file dùng chung một `process.env`.
 *
 * Danh sách những thứ phải có đinh: [docs/ke-hoach-tay-may.md](../../docs/ke-hoach-tay-may.md)
 * mục 11.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  on, TIERS, LEVELS, count, roster, rosterNames, isHouse,
  SEED_EACH, CAP_EACH, FLOOR, spill,
  hourIn, health, awake,
  ceiling, fits, wants, opens, maxTables, waiting,
  SPEED, thinkFor, again, againAfter, today, KINDS,
} from './regulars.mjs';
import { MACHINES, TURN_MS } from './rules/tienlen.mjs';
import { MIN_STAKE, dayIn } from './economy.mjs';

/**
 * Một cái rng bịa, lặp lại được.
 *
 * Mọi hàm trong module đều nhận `rng` làm tham số chứ không gọi thẳng `Math.random`, và đây là
 * chỗ thu tiền của *cái đó*: một cái test bốc lại mỗi lần chạy là một cái test không canh được
 * gì — nó xanh hôm nay và đỏ thứ Ba tuần sau mà không ai sửa gì cả. Một cái LCG tầm thường là đủ:
 * nó không cần ngẫu nhiên cho ra hồn, nó chỉ cần **rải đều** và **lặp lại được**.
 */
const rngFrom = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
};

/// Một mốc thời gian rơi đúng vào giờ Việt Nam mình muốn — vì cả module tính theo giờ ở đây, chứ
/// không phải giờ của cái máy đang chạy test.
const atHour = (hour) => Date.UTC(2026, 0, 15, hour) - 7 * 3_600_000;

/// Đặt một biến môi trường, chạy, rồi trả lại đúng như lúc nhặt lên. Cả file dùng chung một
/// `process.env`, nên một cái test quên dọn là một cái test làm đỏ cái test đứng sau nó — và chỗ
/// đỏ thì không phải chỗ sai.
const withEnv = (name, value, body) => {
  const was = process.env[name];
  try {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    return body();
  } finally {
    if (was === undefined) delete process.env[name];
    else process.env[name] = was;
  }
};

const sum = (moved) => moved.reduce((total, one) => total + one.got, 0);
const avg = (numbers) => numbers.reduce((a, b) => a + b, 0) / numbers.length;

/// Áp cái `spill()` trả ra lên đúng cái sổ nó được tính từ đó, để hỏi câu duy nhất đáng hỏi: sau
/// khi chia xong thì ví ai còn bao nhiêu.
const applied = (rows, moved) => {
  const after = new Map(rows.map((one) => [one.userId, one.gold]));
  for (const one of moved) after.set(one.userId, after.get(one.userId) + one.got);
  return after;
};

// ---- thang bậc --------------------------------------------------------------------------------

test('mức cao lấy nước tốt hơn và nhìn sâu hơn mức thấp', () => {
  // Đây là cái test canh lời hứa, ở cái chỗ rẻ nhất mà canh được. "Siêu máy tính vào chiến đấu
  // cùng người chơi" đã là một câu nói ra ngoài, nên nếu `sieu` mà `slack` cao hơn `kha` thì cái
  // thang bậc là một cái nhãn dán — và không một cái test đánh nhau nghìn ván nào bắt được lỗi ấy
  // nhanh bằng ba dòng ở đây.
  assert.ok(TIERS['so-cap'].slack > TIERS.kha.slack, 'sơ cấp phải bỏ lỡ nước hay nhiều hơn khá');
  assert.ok(TIERS.kha.slack > TIERS.sieu.slack, 'khá phải bỏ lỡ nước hay nhiều hơn siêu');
  assert.equal(TIERS.sieu.slack, 0, 'mức cao nhất thì lấy đúng nước tốt nhất, không lùi bậc nào');

  assert.ok(TIERS['so-cap'].depth < TIERS.kha.depth, 'sơ cấp nhìn nông hơn khá');
  assert.ok(TIERS.kha.depth < TIERS.sieu.depth, 'khá nhìn nông hơn siêu');
  assert.ok(TIERS['so-cap'].nodes < TIERS.kha.nodes && TIERS.kha.nodes < TIERS.sieu.nodes,
    'và ngân sách nghĩ cũng phải đi cùng chiều với cái nhãn');
});

test('mỗi mức có một cái tên đọc được, và LEVELS là đúng ba mức ấy', () => {
  // `LEVELS` suy ra từ `TIERS` chứ không chép tay, nên cái test này canh chuyện thêm một mức thứ
  // tư mà quên một trong hai chỗ.
  assert.deepEqual(LEVELS, Object.keys(TIERS));
  assert.equal(LEVELS.length, 3);
  for (const level of LEVELS) {
    assert.equal(typeof TIERS[level].name, 'string');
    assert.ok(TIERS[level].name.length > 0, `${level} không có tên để hiện lên bảng`);
  }
});

// ---- ai ---------------------------------------------------------------------------------------

test('mỗi con có một cái id house: và không hai con nào đội chung một cái', () => {
  const group = roster();
  assert.ok(group.length > 0);
  assert.equal(group.length, count());

  for (const one of group) {
    assert.ok(one.userId.startsWith('house:'), `${one.userId} không phải id của nhóm`);
    assert.ok(isHouse(one.userId));
    // Bỏ dấu là để cái id không mang dấu tiếng Việt vào đường dẫn và vào log. Nếu `slugOf` hỏng
    // thì nó hỏng im lặng — id vẫn dùng được, chỉ là một ngày nào đó nó nằm trong một cái URL.
    assert.match(one.userId, /^house:[a-z0-9-]+$/, `${one.userId} có ký tự không nên có trong id`);
    assert.equal(one.house, true, 'với mọi phép tính tiền thì một tay máy là một người');
    assert.ok(LEVELS.includes(one.level));
  }

  assert.equal(new Set(group.map((one) => one.userId)).size, group.length,
    'hai con trùng id là hai con chung một cái ví');
  assert.equal(new Set(rosterNames()).size, group.length,
    'hai con trùng tên là cái bàn đọc ra vô lý, và cái bảng vàng thì đọc ra sai');
});

test('không cái tên nào vừa là đồ đạc vừa là tay máy', () => {
  // Thấy "Tư Ròm" là máy lấp ghế ở bàn đấu máy rồi lại thấy "Tư Ròm" ăn tiền thật ở bàn người là
  // hai thứ khác hẳn nhau đội chung một cái tên — và người chơi thì không có cách nào biết. Module
  // ném ngay lúc nạp nếu hai danh sách giao nhau, nên phần dưới đây canh **cả** danh sách tên dài
  // chứ không riêng phần đang nuôi: nếu nó đỏ theo kiểu ném lúc import thì lỗi còn to hơn.
  const shared = rosterNames().filter((name) => MACHINES.includes(name));
  assert.deepEqual(shared, [], 'hai danh sách tên giao nhau');

  withEnv('TIENLEN_HOUSE_COUNT', '999', () => {
    assert.deepEqual(rosterNames().filter((name) => MACHINES.includes(name)), [],
      'nuôi hết số tên có thì mới lòi ra một cái tên trùng — và lúc ấy thì đã lên server rồi');
  });

  // Và hai cái id cũng không được lẫn: `machine:` là đồ đạc, `house:` là người có ví.
  assert.ok(roster().every((one) => !one.userId.startsWith('machine:')));
  assert.ok(!isHouse('machine:g12:0'));
  assert.ok(!isHouse('u1'));
  assert.ok(!isHouse(undefined), 'id không phải chuỗi thì không phải tay máy, và không được ném');
});

test('thêm con thứ hai mươi lăm thì hai mươi bốn con cũ giữ nguyên chỗ', () => {
  // Đây là cái đinh của chữ **bền**. `userId` của tay máy có một dòng trong sổ vàng sống qua mọi
  // lần khởi động lại, nên nếu nuôi thêm con mà danh sách xáo lại thì cái dòng ấy đổi chủ: ví của
  // Hùng thành ví của Mai, và không ai đọc ra được điều đó từ một cái log.
  const few = withEnv('TIENLEN_HOUSE_COUNT', '8', () => roster());
  const many = withEnv('TIENLEN_HOUSE_COUNT', '24', () => roster());

  assert.equal(few.length, 8);
  assert.equal(many.length, 24);
  assert.deepEqual(few, many.slice(0, 8),
    'nuôi thêm con mà tám con cũ đổi id, đổi mức, hay đổi nét riêng');
  assert.deepEqual(
    withEnv('TIENLEN_HOUSE_COUNT', '8', () => rosterNames()),
    withEnv('TIENLEN_HOUSE_COUNT', '24', () => rosterNames()).slice(0, 8));

  // Và nuôi ít đi cũng chỉ là cắt đuôi: mười sáu con còn lại vẫn là đúng mười sáu con ấy.
  assert.deepEqual(withEnv('TIENLEN_HOUSE_COUNT', '16', () => roster()), many.slice(0, 16));
});

test('xin nhiều hơn số tên có thì dừng ở số tên có', () => {
  // Thà ít hơn con số xin còn hơn hai con trùng tên, hay một cái tên có đánh số đằng sau — thứ mà
  // nhìn một cái là biết ngay đây không phải người.
  withEnv('TIENLEN_HOUSE_COUNT', '999', () => {
    assert.ok(count() < 999, 'xin chín trăm chín chín con mà nó gật đầu');
    assert.equal(roster().length, count());
    assert.equal(new Set(roster().map((one) => one.userId)).size, count(),
      'kẹp ở số tên có mà vẫn ra hai cái id giống nhau');
    assert.equal(new Set(rosterNames()).size, count());
  });

  // Một biến môi trường gõ nhầm thì ra không con nào, không ra NaN con.
  withEnv('TIENLEN_HOUSE_COUNT', 'ba mươi', () => {
    assert.equal(count(), 0);
    assert.deepEqual(roster(), []);
  });
  withEnv('TIENLEN_HOUSE_COUNT', '-5', () => assert.equal(count(), 0));
});

// ---- cái pot ----------------------------------------------------------------------------------

test('mặc định là không có trần, và không có trần thì không ai bị đụng tới', () => {
  // Chủ sòng quyết ngày 12/09: cứ để tay máy đánh hết sức, leo top thì leo. Cái cơ chế trần vẫn
  // còn nguyên — tắt bằng số không, bật lại bằng một biến môi trường — vì một quyết định sản phẩm
  // thì đổi được, còn một đoạn code đã xoá thì phải viết lại.
  //
  // Số không là **tắt**, không phải "trần bằng không". Đọc nhầm chữ ấy thì mỗi lần chia là cả
  // nhóm bị vét sạch về số không, và đó là cách tệ nhất để phát hiện ra một hằng số đổi mặc định.
  assert.equal(CAP_EACH, 0, process.env.TIENLEN_HOUSE_CAP
    ? 'máy đang chạy test có TIENLEN_HOUSE_CAP — bỏ nó ra rồi chạy lại, không phải sửa test'
    : 'mặc định của trần đổi rồi mà cái test này chưa được đọc lại');

  const rows = [
    { userId: 'house:vo-dich', gold: SEED_EACH * 100 },
    { userId: 'house:thuong', gold: SEED_EACH },
  ];
  assert.deepEqual(spill(rows), [], 'trần tắt mà vẫn có tiền chạy qua lại');
  assert.deepEqual(spill(rows, 0), []);
  assert.equal(sum(spill(rows, 0)), 0);
});

test('hai cái mốc còn lại của pot nằm đúng chỗ của chúng', () => {
  // `FLOOR` giờ là thứ **duy nhất** còn canh cái pot, và nó chỉ canh được một chiều: lúc nhà thua.
  // Nên nó phải nằm dưới cái vốn của cả nhóm, không thì nhóm đóng cửa ngay từ lúc vừa gieo xong.
  assert.ok(SEED_EACH > 0);
  assert.ok(FLOOR > 0);
  assert.ok(FLOOR < SEED_EACH * count(), 'sàn cao hơn cả cái pot vừa gieo thì nhóm không bao giờ mở');
});

test('phần vượt trần chảy đi đúng bằng phần lấy về, không hơn một đồng không kém một đồng', () => {
  // Cái test đắt nhất trong file này, và nó đắt vì `spill()` là hàm **duy nhất** ở đây có thể in
  // tiền. Lỗi tiền là lỗi duy nhất người chơi nhớ mãi, và một cái sổ tự đẻ ra vàng thì không ai
  // báo — họ chỉ ở lại chơi. Nên: nhiều hình dạng sổ, số lẻ không chia hết, người nghèo bằng
  // nhau, nhiều người vượt trần cùng lúc, và cả những sổ mà **cả nhóm không còn chỗ chứa**.
  const rng = rngFrom(20_260_912);
  for (let round = 0; round < 400; round += 1) {
    const many = 1 + Math.floor(rng() * 30);
    const cap = 1_000 + Math.floor(rng() * 900_000);
    const rows = Array.from({ length: many }, (ignore, at) => ({
      userId: `house:r${at}`,
      // Cố ý cho quá nửa số ví rơi quanh cái trần, để lần nào cũng có kẻ vượt và có kẻ vừa đúng.
      gold: Math.floor(rng() * cap * 2.5),
    }));

    const moved = spill(rows, cap);
    assert.equal(sum(moved), 0,
      `vòng ${round}: chia ${many} ví ở trần ${cap} ra ${sum(moved)} vàng từ hư không`);
    assert.equal(new Set(moved.map((one) => one.userId)).size, moved.length,
      'không ai được ghi hai dòng trong cùng một lần chia');
    assert.ok(moved.every((one) => Number.isInteger(one.got) && one.got !== 0),
      'nửa đồng vàng, hay một dòng nhận số không, đều là thứ không có trong sổ');

    // Và cái đinh của lần sửa 12/09: **không ai bị đẩy lên trên trần**. Ai vốn đã ở trên trần thì
    // chỉ được đi xuống — phần không còn chỗ để rải thì ở lại với họ, chứ không bốc hơi.
    const before = new Map(rows.map((one) => [one.userId, one.gold]));
    for (const [userId, gold] of applied(rows, moved)) {
      assert.ok(gold <= Math.max(cap, before.get(userId)),
        `vòng ${round}: ${userId} từ ${before.get(userId)} lên ${gold}, trên trần ${cap}`);
      assert.ok(gold >= 0, 'không ai bị chia thành âm');
    }
  }
});

test('người vượt trần bị kéo về đúng cái trần, không hơn không kém', () => {
  const cap = 900_000;
  const rows = [
    { userId: 'house:a', gold: 2_400_000 },
    { userId: 'house:b', gold: 1_100_000 },
    { userId: 'house:c', gold: 300_000 },
    { userId: 'house:d', gold: 40_000 },
    // Đủ chỗ trống trong nhóm để chứa hết phần vượt — không thì câu hỏi ở đây thành câu hỏi khác,
    // và câu hỏi ấy có cái test riêng của nó ở ngay dưới.
    { userId: 'house:e', gold: 0 },
    { userId: 'house:f', gold: 0 },
  ];
  const after = applied(rows, spill(rows, cap));

  assert.equal(after.get('house:a'), cap, 'con giàu nhất phải đứng đúng ở trần');
  assert.equal(after.get('house:b'), cap);
  assert.ok(after.get('house:c') > 300_000 && after.get('house:d') > 40_000,
    'và phần vượt phải thật sự chảy sang người khác, không chỉ biến mất khỏi ví con giàu');
});

test('phần chia tự kẹp lại ở trần, cả ở phía người nhận', () => {
  // Cái test này **từng canh điều ngược lại**, và cái comment nó để lại dặn ai sửa `spill` thì
  // phải quay nó lại. Đây là lần quay ấy.
  //
  // Bản đầu chia đều phần vượt cho mọi ví dưới trần mà không hỏi từng ví còn trống bao nhiêu: một
  // con đang nằm sát trần nhận đúng bằng một con rỗng túi, rồi vượt lên trên trần. Tiền vẫn không
  // sinh không mất, nhưng cái trần thì thủng — mà cái trần là toàn bộ lý do hàm này tồn tại. Đúng
  // cái sổ ấy: trần 100, ba ví 200/90/10, tổng vừa đúng 300, tức là **có** cách cho cả ba cùng
  // đứng ở trần. Bản đầu ra 100/140/60. Giờ nó phải ra 100/100/100.
  const cap = 100;
  const rows = [
    { userId: 'house:giau', gold: 200 },
    { userId: 'house:sat-tran', gold: 90 },
    { userId: 'house:rong', gold: 10 },
  ];
  const moved = spill(rows, cap);
  assert.equal(sum(moved), 0, 'kẹp lại rồi thì tiền vẫn phải không sinh không mất');

  const after = applied(rows, moved);
  assert.equal(after.get('house:giau'), 100);
  assert.equal(after.get('house:sat-tran'), 100, 'con sát trần chỉ được nhận đúng phần còn trống');
  assert.equal(after.get('house:rong'), 100);
});

test('sau một lần chia thì không ví nào trong nhóm còn vượt trần', () => {
  // Đây là câu hỏi cái trần sinh ra để trả lời: một con mức cao đánh cả ngày không được phép leo
  // lên đầu bảng vàng rồi ở đó. Sổ ở đây là hình dạng thật của nhóm — hai con ăn đậm, phần còn
  // lại quanh quẩn chỗ vừa được gieo.
  const cap = SEED_EACH * 3;
  const rows = roster().map((one, at) => ({
    userId: one.userId,
    gold: at === 0 ? cap * 3 : at === 1 ? cap + 200_000 : 80_000 + (at * 37_000) % 300_000,
  }));

  const after = applied(rows, spill(rows, cap));
  for (const [userId, gold] of after) {
    assert.ok(gold <= cap, `${userId} còn ${gold} vàng, trên trần ${cap}`);
  }
  assert.equal(sum(spill(rows, cap)), 0);
});

test('cả nhóm cùng chạm trần thì phần thừa ở lại với người vượt, không bốc hơi', () => {
  // Chỗ dễ mất tiền nhất trong cả hàm: lấy của người vượt trần trước rồi mới phát hiện ra không
  // còn chỗ nào để đưa. Cái trần không phải lúc nào cũng giữ được — một cái pot to hơn `trần nhân
  // số con` thì không có cách sắp xếp nào cho tất cả cùng ở dưới trần, và đó là số học chứ không
  // phải lỗi. Cái **là** lỗi thì chỉ có một: một đồng vàng biến mất khỏi một cái pot đóng, vì cái
  // đó thì không cách nào dựng lại được.
  const cap = 100_000;
  const rows = [
    { userId: 'house:a', gold: 5_000_000 },
    { userId: 'house:b', gold: 4_000_000 },
  ];
  const moved = spill(rows, cap);
  assert.equal(sum(moved), 0);

  const after = applied(rows, moved);
  assert.equal(after.get('house:a') + after.get('house:b'), 9_000_000, 'tổng của nhóm phải y nguyên');

  // Không ai dưới trần thì không lấy của ai cả — không có một vòng lấy đi rồi trả lại thừa ra.
  assert.deepEqual(moved, []);
});

test('phần lẻ không chia hết về người ít vàng nhất, mỗi người một đồng', () => {
  // Cùng một quy ước với `shareOut` bên `economy.mjs`, và cố ý giống: hai chỗ chia tiền mà làm
  // tròn theo hai lối khác nhau là hai chỗ để đối chiếu sổ ra hai con số.
  const moved = spill([
    { userId: 'house:giau', gold: 110 },
    { userId: 'house:c', gold: 30 },
    { userId: 'house:a', gold: 10 },
    { userId: 'house:b', gold: 20 },
  ], 100);

  const got = new Map(moved.map((one) => [one.userId, one.got]));
  assert.equal(got.get('house:giau'), -10);
  assert.equal(got.get('house:a'), 4, 'đồng lẻ về người ít vàng nhất');
  assert.equal(got.get('house:b'), 3);
  assert.equal(got.get('house:c'), 3);
  assert.equal(sum(moved), 0);
});

test('chia cho nhiều người hơn số vàng vượt trần thì chỉ những người nghèo nhất có phần', () => {
  const moved = spill([
    { userId: 'house:giau', gold: 103 },
    { userId: 'house:a', gold: 5 },
    { userId: 'house:b', gold: 4 },
    { userId: 'house:c', gold: 3 },
    { userId: 'house:d', gold: 2 },
    { userId: 'house:e', gold: 1 },
  ], 100);

  assert.equal(sum(moved), 0);
  assert.deepEqual(moved.filter((one) => one.got > 0).map((one) => one.userId),
    ['house:e', 'house:d', 'house:c'], 'ba đồng thì đúng ba người nghèo nhất có phần');
  assert.ok(moved.every((one) => one.got !== 0), 'không ai được ghi một dòng nhận số không');
});

test('cùng một tình huống chia hai lần ra cùng một kết quả', () => {
  // Hai con cùng số vàng thì thứ tự phải do một thứ đứng yên quyết định, không phải do thứ tự cái
  // `Map` trả về hôm ấy. Một cái sổ chia khác nhau giữa hai lần chạy là một cái sổ không đối chiếu
  // được với cái gì.
  const rows = [
    { userId: 'house:b', gold: 1_000 },
    { userId: 'house:a', gold: 1_000 },
    { userId: 'house:giau', gold: 3_000 },
    { userId: 'house:c', gold: 1_000 },
  ];
  assert.deepEqual(spill(rows, 2_000), spill(rows, 2_000));

  // Ba ví giống hệt nhau, một đồng lẻ: nó phải về một cái id đoán trước được, không về cái nào
  // tình cờ đứng đầu mảng hôm nay.
  const got = new Map(spill(rows, 2_000).map((one) => [one.userId, one.got]));
  assert.equal(got.get('house:a'), 334);
  assert.equal(got.get('house:b'), 333);
  assert.equal(got.get('house:c'), 333);

  // Và đảo thứ tự cái sổ đưa vào cũng không đổi được ai nhận bao nhiêu.
  const byId = (moved) => [...moved].sort((a, b) => a.userId.localeCompare(b.userId));
  assert.deepEqual(byId(spill(rows, 2_000)), byId(spill([...rows].reverse(), 2_000)));
});

test('phần không rải hết cũng về đúng một chỗ, dù cuốn sổ đọc ra theo thứ tự nào', () => {
  // Cái test này **từng canh điều ngược lại**, và cái comment nó để lại dặn ai sửa thì phải quay
  // nó lại. Đây là lần quay ấy.
  //
  // Phía người nhận thì xếp theo `gold` rồi tới `id` ngay từ đầu. Phía **người trả** thì không:
  // `over` giữ nguyên thứ tự mảng đưa sang, mà phần không còn chỗ để rải thì được trả ngược theo
  // đúng thứ tự ấy — đầy người đầu tiên trước. Nên cùng một cuốn sổ, đọc ra theo hai thứ tự khác
  // nhau, thì người giữ lại phần thừa là hai người khác nhau: thuận thì B còn 290, đảo mảng thì A
  // còn 290. Tiền không sinh không mất, nhưng cái bảng vàng thì đổi chỗ hai người.
  //
  // Ba trăm, ba trăm, chín mươi, trần một trăm: cả nhóm chỉ còn mười chỗ trống, nên có đúng mười
  // đồng rải đi được và ba trăm chín mươi đồng phải ở lại với ai đó. Ai, thì giờ đã là một câu
  // hỏi có một câu trả lời.
  const rows = [
    { userId: 'house:A', gold: 300 },
    { userId: 'house:B', gold: 300 },
    { userId: 'house:C', gold: 90 },
  ];
  const thuan = spill(rows, 100);
  const nguoc = spill([...rows].reverse(), 100);

  assert.equal(sum(thuan), 0);
  assert.equal(sum(nguoc), 0);
  assert.deepEqual(thuan, nguoc, 'cùng một cuốn sổ mà chia ra hai kết quả khác nhau');

  const after = applied(rows, thuan);
  assert.equal(after.get('house:C'), 100, 'chỗ trống có bao nhiêu thì rải đi bấy nhiêu');
  assert.equal(after.get('house:A'), 300);
  assert.equal(after.get('house:B'), 290);
  assert.deepEqual([...applied(rows, nguoc)], [...after], 'đảo thứ tự sổ là đổi ví của hai người');
});

// ---- ai thức, và bao giờ ----------------------------------------------------------------------

test('giờ đọc ra là giờ Việt Nam, không phải giờ của cái máy đang chạy', () => {
  // Nửa đêm ở London là bảy giờ sáng ở đây. Nếu chỗ này lệch thì cả nhóm đông nhất lúc một giờ
  // chiều và vắng nhất lúc chín giờ tối — nhìn vào danh sách bàn là biết ngay có gì đó không phải
  // người.
  assert.equal(hourIn(Date.UTC(2026, 0, 15, 0)), 7);
  assert.equal(hourIn(Date.UTC(2026, 0, 15, 17)), 0, 'năm giờ chiều giờ UTC là nửa đêm ở đây');
  for (const hour of [0, 4, 12, 20, 23]) assert.equal(hourIn(atHour(hour)), hour);
});

test('bốn giờ sáng thì vắng, tám giờ tối thì đông', () => {
  // Một nhóm đánh đều tăm tắp suốt hai mươi tư giờ là một nhóm mà nhìn vào danh sách bàn lúc bốn
  // giờ sáng là biết ngay. Cái nhịp này là thứ duy nhất làm cái danh sách đọc ra như một cái sòng
  // chứ không như một cái cron.
  const group = roster();
  const night = awake(atHour(4), group).length;
  const evening = awake(atHour(20), group).length;
  const noon = awake(atHour(12), group).length;

  assert.ok(night < noon, `bốn giờ sáng ${night} con, giữa trưa ${noon} con`);
  assert.ok(noon < evening, `giữa trưa ${noon} con, tám giờ tối ${evening} con`);
  assert.ok(evening <= group.length);
});

test('không giờ nào thức nhiều hơn số con đang có, kể cả khi cả nhóm chỉ có một con', () => {
  // Cái bảng nhịp là **tỉ lệ**, nên nó phải đúng ở mọi quy mô: nuôi một con hay sáu mươi tư con
  // đều phải đọc ra là cùng một cái sòng. Cái sàn "ít nhất hai con" là chỗ nó từng nói dối —
  // `health()` trả về hai trong khi cả nhóm có một, `awake()` che được còn cái log thì không, và
  // hai người đọc cùng một hàm ra hai con số khác nhau. Giờ `Math.min` nằm ở ngoài cùng.
  const group = roster();
  for (const size of [1, 2, 3, 7, group.length]) {
    const some = group.slice(0, size);
    for (let hour = 0; hour < 24; hour += 1) {
      assert.ok(health(Infinity, atHour(hour), size).awake <= size,
        `${hour}h: health nói ${health(Infinity, atHour(hour), size).awake} con thức trong nhóm ${size} con`);

      const up = awake(atHour(hour), some);
      assert.ok(up.length <= some.length, `${hour}h: ${up.length} con thức trong nhóm ${size} con`);
      assert.equal(new Set(up.map((one) => one.userId)).size, up.length,
        'một con không được thức hai lần');
      assert.ok(up.every((one) => some.includes(one)), 'thức ra một con không có trong danh sách');
    }
  }
  assert.equal(health(Infinity, atHour(20), 1).awake, 1, 'nhóm một con thì nhiều nhất là một con thức');
});

test('cùng một giờ thì cùng một nhóm người, gọi bao nhiêu lần cũng thế', () => {
  // Hàm này được gọi mấy giây một lần. Bốc lại mỗi lần là mười sáu con chớp tắt liên tục — ngồi
  // xuống rồi biến mất giữa ván — và cái đó thì người chơi nhìn thấy ngay trong một phút.
  const group = roster();
  const ids = (at) => awake(at, group).map((one) => one.userId);
  assert.deepEqual(ids(atHour(20)), ids(atHour(20)));
  assert.deepEqual(ids(atHour(20)), ids(atHour(20) + 5 * 60_000), 'năm phút sau vẫn đúng nhóm ấy');
  assert.deepEqual(ids(atHour(20)), ids(atHour(20) + 59 * 60_000 + 59_000));

  // Và không phải lúc nào cũng đúng mấy con đầu danh sách thức — nếu không thì nửa cuối danh sách
  // là hai mươi cái ví gieo ra rồi không bao giờ động tới.
  const seen = new Set();
  for (let hour = 0; hour < 24; hour += 1) for (const one of awake(atHour(hour), group)) seen.add(one.userId);
  assert.equal(seen.size, group.length, 'có con không bao giờ được thức giờ nào');
});

test('pot dưới sàn thì nhóm đóng cửa và không con nào thức', () => {
  // Pot cạn là một **tín hiệu**, không phải một cái lỗi: nó nghĩa là người chơi đang thắng. Cái
  // sàn chỉ có nghĩa nếu chạm tới nó thì thật sự không còn con nào ngồi xuống nữa.
  const now = atHour(20);
  assert.deepEqual(health(FLOOR - 1, now), { open: false, awake: 0 });
  assert.deepEqual(health(0, now), { open: false, awake: 0 });
  assert.deepEqual(awake(now, roster(), FLOOR - 1), [], 'đóng cửa rồi mà vẫn có con ngồi xuống');

  // Và đúng ở sàn thì vẫn mở — cái sàn là mức thấp nhất còn chơi được, không phải mức đầu tiên
  // phải nghỉ.
  assert.equal(health(FLOOR, now).open, true);
  assert.ok(health(FLOOR, now).awake > 0);
});

test('không nuôi con nào thì cũng đóng, dù pot đầy', () => {
  assert.deepEqual(health(SEED_EACH * 100, atHour(20), 0), { open: false, awake: 0 });
  assert.deepEqual(awake(atHour(20), [], Infinity), []);
  withEnv('TIENLEN_HOUSE_COUNT', '0', () => {
    assert.deepEqual(roster(), []);
    assert.deepEqual(health(SEED_EACH * 100, atHour(20)), { open: false, awake: 0 });
    assert.deepEqual(awake(atHour(20), roster(), Infinity), []);
  });
});

test('tắt bằng một biến môi trường thì lúc nào cũng đóng, và hỏi lại được ngay', () => {
  // Không thương lượng. Một thứ chạy tự động, đụng vào ví người thật, và chỉ tắt được bằng một
  // lần deploy là một thứ không tắt được vào lúc ba giờ sáng — mà ba giờ sáng là lúc người ta cần
  // tắt nó. Đọc lúc **gọi** chứ không lúc nạp, nên tắt giữa chừng là tắt thật, không phải đợi
  // lần khởi động sau.
  assert.equal(on(), true, 'mặc định là bật; phần dưới mới là cái canh việc tắt');

  withEnv('TIENLEN_HOUSE', '0', () => {
    assert.equal(on(), false);
    assert.deepEqual(health(SEED_EACH * 1_000, atHour(20)), { open: false, awake: 0 },
      'tắt rồi mà pot đầy thì nó vẫn mở cửa');
    assert.deepEqual(awake(atHour(20), roster(), Infinity), []);
  });

  assert.equal(on(), true, 'bật lại cũng phải ăn ngay, không thì cái nút chỉ có một chiều');
  assert.equal(health(SEED_EACH * 1_000, atHour(20)).open, true);
});

test('ép cứng số con thức thì ép được, và vẫn không vượt quá số con có', () => {
  // Không phải để test — để **nhìn**: một cái sòng vắng lúc bốn giờ sáng là đúng, nhưng người
  // đang xem thử một thay đổi lúc bốn giờ sáng thì không có gì để nhìn cả, và "chờ tới tối" không
  // phải một cách làm việc. Cái núm ấy vẫn phải nằm dưới hai cái chốt thật: sàn pot, và số con có.
  withEnv('TIENLEN_HOUSE_AWAKE', '9', () => {
    assert.equal(health(Infinity, atHour(4)).awake, 9, 'ép chín con lúc bốn giờ sáng mà không ăn');
    assert.equal(awake(atHour(4), roster()).length, 9);
    assert.equal(health(Infinity, atHour(4), 3).awake, 3, 'ép nhiều hơn số con có thì kẹp lại');
    assert.deepEqual(health(FLOOR - 1, atHour(4)), { open: false, awake: 0 },
      'ép cứng không được phép đạp qua cái sàn pot');
  });
  withEnv('TIENLEN_HOUSE_AWAKE', '0', () => {
    assert.ok(health(Infinity, atHour(4)).awake > 0, 'số không là "thôi ép", không phải "không con nào"');
  });
});

// ---- ngồi xuống -------------------------------------------------------------------------------

test('trần của một con không bao giờ thấp hơn mức cược nhỏ nhất', () => {
  // Nếu nó tụt xuống dưới `MIN_STAKE` thì một con hết tiền không còn ngồi được bàn rẻ nhất, và nó
  // đứng đó cho tới lúc có người nạp lại pot — tức là một cái ghế trống vĩnh viễn mang tên một
  // người.
  for (const one of roster()) {
    for (const gold of [0, 1, 999, MIN_STAKE, 20_000]) {
      assert.ok(ceiling(one, gold) >= MIN_STAKE, `${one.userId} với ${gold} vàng ra trần quá thấp`);
    }
  }
});

test('ví to gấp đôi thì bàn to nhất dám ngồi cũng to gấp đôi', () => {
  // Đây là **cái chặn chính**, không phải một nét tính cách: bàn có tay máy là bàn giữa người với
  // người và đánh đúng mức của phòng, nên một người có thể mở bàn một triệu rồi đợi tay máy vào
  // lấp. Năm phần trăm cái ví là thứ chặn cái đó, và nó chỉ chặn được nếu nó thật sự đi theo ví.
  for (const one of roster().slice(0, 6)) {
    const small = ceiling(one, 1_000_000);
    const twice = ceiling(one, 2_000_000);
    assert.equal(twice, small * 2);
    assert.ok(ceiling(one, 10_000_000) > ceiling(one, 1_000_000));
    assert.ok(small < 1_000_000 / 10, 'trần phải là một phần nhỏ của ví, không phải cả cái ví');
  }
});

test('không bao giờ ngồi xuống một cái bàn to hơn trần hay to hơn ví', () => {
  const tables = [1_000, 5_000, 10_000, 20_000, 50_000, 200_000, 1_000_000]
    .map((stake, at) => ({ id: `g${at}`, kind: 'tienlen', size: 4, stake }));
  const stakeOf = new Map(tables.map((one) => [one.id, one.stake]));

  const rng = rngFrom(7);
  for (const one of roster()) {
    for (const gold of [500, MIN_STAKE, 45_000, 300_000, 5_000_000]) {
      for (let draw = 0; draw < 60; draw += 1) {
        const want = wants(one, tables, gold, rng);
        if (!want) continue;
        const stake = stakeOf.get(want.gameId);
        assert.ok(stake <= ceiling(one, gold), `${one.userId} ngồi bàn ${stake} quá trần`);
        assert.ok(stake <= gold, `${one.userId} có ${gold} vàng mà ngồi bàn ${stake}`);
        // Rút ngắn cách mấy thì cũng không được rút xuống số không: ngồi xuống ngay lúc cái bàn
        // vừa lên danh sách là đúng cái dấu vết mà `afterMs` sinh ra để xoá.
        assert.ok(want.afterMs >= 1 && Number.isInteger(want.afterMs),
          `${one.userId} ngồi xuống sau ${want.afterMs}ms`);
      }
    }
  }
});

test('hỏi có bàn nào ngồi được không, khác hỏi lần này có ngồi không', () => {
  // Hai câu hỏi ấy chỉ giống nhau chừng nào không ai hỏi câu thứ hai. `fits` là câu đầu, và nó
  // tách ra khỏi `wants` vì một lỗi thật ở bộ flow test: một người mở bàn bốn ghế, sáu con thức,
  // cả sáu lần lượt bỏ lượt rồi đi mở bàn của riêng chúng — năm cái bàn trong tám giây, và cái bàn
  // của người thật thì không ai vào. Người gọi phải phân biệt được hai câu, nên hai câu phải khớp
  // nhau: **thứ `wants` chọn bao giờ cũng là một thứ `fits` đã gật đầu.**
  const one = roster()[3];
  const tables = [1_000, 5_000, 10_000, 50_000, 1_000_000]
    .map((stake, at) => ({ id: `g${at}`, stake }));

  const can = fits(one, tables, 300_000);
  assert.ok(can.length > 0 && can.length < tables.length, 'cái test này cần cả hai loại bàn');
  assert.ok(can.every((table) => table.stake <= ceiling(one, 300_000) && table.stake <= 300_000));
  assert.deepEqual(fits(one, tables, 0), [], 'ví rỗng thì không bàn nào ngồi được');
  assert.deepEqual(fits(one, [], 300_000), []);

  // Và cái ràng buộc giữa hai hàm, canh qua nhiều ví và nhiều lần bốc: `wants` không bao giờ chọn
  // một cái bàn mà `fits` không nhận, và không có bàn nào ngồi được thì nó cũng không ngồi.
  const rng = rngFrom(63);
  for (const gold of [900, 20_000, 300_000, 9_000_000]) {
    const ids = new Set(fits(one, tables, gold).map((table) => table.id));
    for (let draw = 0; draw < 200; draw += 1) {
      const want = wants(one, tables, gold, rng);
      if (!ids.size) assert.equal(want, null, 'không bàn nào vừa túi mà vẫn ngồi xuống một cái');
      if (want) assert.ok(ids.has(want.gameId), `ngồi vào ${want.gameId}, cái bàn fits đã loại ra`);
    }
  }
});

test('không có bàn nào vừa túi thì thôi, không ngồi bừa', () => {
  const one = roster()[0];
  assert.equal(wants(one, [], 300_000, rngFrom(1)), null);
  assert.equal(wants(one, [{ id: 'g1', stake: 1_000_000 }], 300_000, rngFrom(1)), null,
    'bàn một triệu với cái ví ba trăm nghìn');
  assert.equal(wants(one, [{ id: 'g1', stake: 5_000 }], 900, rngFrom(1)), null,
    'bàn rẻ nhưng trong ví không có đủ tiền cược');
});

test('cùng một rng thì chọn cùng một bàn, cùng một nhịp chờ', () => {
  // Không phải vì cái bàn cần tất định, mà vì cái test cần. Mọi hàm ở đây nhận `rng` làm tham số
  // đúng để chỗ này kiểm được — nếu có ngày ai đó gọi thẳng `Math.random` trong `wants` thì cái
  // test này là chỗ đỏ lên.
  const tables = [1_000, 5_000, 10_000].map((stake, at) => ({ id: `g${at}`, stake }));
  const run = () => {
    const rng = rngFrom(2_026);
    return Array.from({ length: 50 }, () => wants(roster()[2], tables, 300_000, rng));
  };
  assert.deepEqual(run(), run());

  // Và với một cái rng dựng tay thì đọc ra được từng con số: bàn thứ ba trong ba bàn nó nhìn,
  // chờ 7,32 giây rồi mới vào — nhân với `SPEED`, y như mọi quãng chờ khác, để một bộ test chạy
  // con bot thật rút ngắn được **cả** quãng ngồi xuống chứ không riêng quãng nghĩ.
  //
  // Quãng chờ ngắn lại (1,2–8 giây thay vì 1,5–13,5) vì một cái bàn bốn ghế cần **ba** người:
  // mười ba giây một người là bốn chục giây cái bàn đứng im, và cái đứng im ấy là thứ người thật
  // nhìn thấy. Ba cái bàn ở đây không nói ghế của chúng, nên phép xếp theo "còn thiếu mấy ghế"
  // hoà đều và thứ tự rơi về giá — vẫn là `g2`.
  assert.deepEqual(wants(roster()[2], tables, 1_000_000, () => 0.9),
    { gameId: 'g2', afterMs: Math.max(1, Math.round(7_320 * SPEED)) });
});

test('không phải lúc nào cũng ngồi, và đó là chỗ bàn hết giờ tới từ', () => {
  // Một cái bàn vừa lên danh sách đã đầy ngay là một cái bàn không ai *tìm thấy* nó cả. Phải có
  // những lần không ai tới, để cái bàn hết giờ và bị quét — y như đời.
  const tables = [1_000, 5_000, 10_000].map((stake, at) => ({ id: `g${at}`, stake }));
  const rng = rngFrom(31);
  const outs = Array.from({ length: 2_000 }, () => wants(roster()[1], tables, 300_000, rng));
  const sat = outs.filter(Boolean).length;

  assert.ok(sat > 0 && sat < outs.length, `ngồi ${sat}/${outs.length} lần`);
  assert.ok(outs.length - sat > outs.length * 0.1,
    'gần như lần nào cũng ngồi thì cái danh sách bàn đọc ra là một cái máy hút ghế');
});

test('nó chọn trong ba cái bàn rẻ nhất, không phải ba cái bàn mở sớm nhất', () => {
  // Cái test này cũng từng canh điều ngược lại — hồi `wants` lấy trong ba cái **đầu danh sách**
  // và trông vào thứ tự người gọi đưa sang. Mà `openTables()` trả về theo thứ tự bàn được mở, nên
  // thứ nó thật sự chọn là *bàn mở sớm nhất*, và một cái bàn rẻ nằm thứ tư trở đi thì không bao
  // giờ được nhìn tới. Giờ `wants` tự xếp, nên cái bàn rẻ nằm cuối danh sách vẫn được chọn, còn
  // cái bàn đắt nằm đầu thì không.
  const tables = [
    { id: 'dat', stake: 20_000 },
    { id: 're', stake: 1_000 },
    { id: 'vua', stake: 5_000 },
    { id: 'cuoi-danh-sach', stake: 1_000 },
  ];
  const rng = rngFrom(5);
  const picked = new Set();
  for (let draw = 0; draw < 500; draw += 1) {
    // Ví rộng rãi, để cả bốn cái bàn đều nằm dưới trần — câu hỏi ở đây là thứ tự, không phải giá.
    const want = wants(roster()[3], tables, 5_000_000, rng);
    if (want) picked.add(want.gameId);
  }
  assert.deepEqual([...picked].sort(), ['cuoi-danh-sach', 're', 'vua'],
    'cái bàn đắt nhất vẫn được chọn chỉ vì nó nằm đầu danh sách');
});

// ---- mở bàn -----------------------------------------------------------------------------------

test('đủ bàn chờ rồi thì thôi, và đủ bàn đang chạy thì cũng thôi', () => {
  // Một nhóm cứ thấy trống là mở bàn sẽ đẩy danh sách đầy những bàn không ai ngồi, và một danh
  // sách toàn bàn chờ là một danh sách người ta thôi mở ra. Cái thứ hai thì không phải chuyện đẹp
  // xấu: mỗi bàn là một tay bài được chia và một cái máy nghĩ mỗi lượt, trên đúng một luồng.
  const one = roster()[0];
  const full = Array.from({ length: waiting() }, (ignore, at) => ({ id: `g${at}`, stake: 1_000 }));
  const generous = () => 0.9;

  // `free` truyền đủ lớn ở mọi lời gọi dưới đây, để cái `null` nào cũng chỉ có đúng một lý do —
  // một cái test đỏ vì ba lý do cùng lúc là một cái test không chỉ ra được lý do nào.
  assert.equal(opens(one, full, 300_000, generous, 0, 4), null);
  assert.equal(opens(one, [], 300_000, generous, maxTables(), 4), null);
  assert.equal(opens(one, [], 300_000, generous, maxTables() + 3, 4), null);
  assert.ok(opens(one, full.slice(0, waiting() - 1), 300_000, generous, maxTables() - 1, 4),
    'còn chỗ cả hai phía mà vẫn không mở thì cái sảnh trống trơn');
});

test('không mở cái bàn to hơn số người có thể ngồi vào nó', () => {
  // Một lỗi thật, bắt được ở lần chạy đầu tiên trên máy: lúc rạng sáng chỉ hai con thức mà con mở
  // bàn lại mở bàn bốn ghế — một cái bàn không bao giờ đầy được, đứng đó tới lúc bị quét, rồi con
  // sau lại mở một cái y hệt. Nhìn từ ngoài vào nó là "có bàn mà chẳng ai chơi", tức là đúng cái
  // thứ nhóm này sinh ra để chữa, làm ngược lại.
  const one = roster()[0];
  const generous = () => 0.9;

  assert.equal(opens(one, [], 300_000, generous, 0, 0), null, 'một mình thì không mở bàn nào cả');
  assert.equal(opens(one, [], 300_000, generous, 0, 1).size, 2,
    'còn một con nữa thức thì mở bàn hai, cộng một ghế để dành cho người thật');

  // Ba con thức: bàn ba ghế là vừa hết, bàn bốn ghế là một cái ghế không bao giờ có người.
  const rng = rngFrom(13);
  const sizes = new Set();
  for (let draw = 0; draw < 300; draw += 1) {
    const open = opens(one, [], 300_000, rng, 0, 2);
    if (open) sizes.add(open.size);
  }
  assert.deepEqual([...sizes].sort(), [2, 3], `ba con thức mà mở ra bàn ${[...sizes].join(', ')} ghế`);
});

test('quên không nói có mấy con rảnh thì nó hỏng theo chiều an toàn', () => {
  // `free` mặc định là **không con nào**, không phải bốn. Một mặc định bốn thì im lặng trả lại
  // đúng cái hành vi vừa sửa xong — mở bàn bốn ghế lúc rạng sáng chỉ có hai con thức — và nó trả
  // lại đúng vào lúc tệ nhất: lúc người gọi vừa quên một tham số, tức là lúc không ai đang nhìn.
  //
  // Hỏng theo chiều an toàn nghĩa là: không mở bàn nào cả. Một cái sảnh thiếu một bàn thì người ta
  // đợi thêm một lúc; một cái bàn không bao giờ đầy được thì người ta thôi mở danh sách ra.
  const one = roster()[0];
  const rng = rngFrom(21);
  for (let draw = 0; draw < 500; draw += 1) {
    assert.equal(opens(one, [], 300_000, rng, 0), null, 'mở được một cái bàn mà không ai ngồi vào');
  }
  // Cả hai đầu của cái rng, để không ai nghĩ cái `null` ở trên là do bốc trượt.
  assert.equal(opens(one, [], 5_000_000, () => 0, 0), null);
  assert.equal(opens(one, [], 5_000_000, () => 0.999_999, 0), null);
});

test('bàn nó mở không bao giờ to hơn trần hay to hơn ví', () => {
  // Cùng một chỗ in tiền với `wants`, chỉ khác chiều: ở đây chính nó là người đặt ra mức cược, nên
  // nếu chặn sót thì không có ai khác chặn hộ.
  const rng = rngFrom(11);
  for (const one of roster()) {
    for (const gold of [1_500, 12_000, 300_000, 4_000_000]) {
      for (let draw = 0; draw < 40; draw += 1) {
        const open = opens(one, [], gold, rng, 0, 4);
        if (!open) continue;
        assert.ok(open.stake <= ceiling(one, gold), `mở bàn ${open.stake} quá trần của ${one.userId}`);
        assert.ok(open.stake <= gold, `mở bàn ${open.stake} với ${gold} vàng trong ví`);
        assert.ok([2, 4].includes(open.size), 'bàn ba ghế không có trong sòng này');
        // Bốn trò, không phải hai: hai bàn cờ đã được mở ra cho nhóm. Bàn cờ thì luôn hai ghế —
    // đó là cả cái bàn cờ — nên chỗ này canh luôn câu ấy.
    assert.ok(KINDS.map(([kind]) => kind).includes(open.kind), `trò lạ: ${open.kind}`);
    if (open.kind === 'chess' || open.kind === 'xiangqi') assert.equal(open.size, 2);
    assert.ok(['tienlen', 'phom', 'chess', 'xiangqi'].includes(open.kind));
      }
    }
  }
});

test('ví mỏng hơn mức cược rẻ nhất thì không mở bàn nào', () => {
  // Không phải để giữ tiền, mà vì cái bàn ấy mở ra là mở ra để treo: nó không đủ tiền vào chính
  // cái bàn nó vừa mở.
  assert.equal(opens(roster()[0], [], MIN_STAKE - 1, () => 0.9, 0, 4), null);
  assert.equal(opens(roster()[0], [], 0, () => 0.9, 0, 4), null);
});

test('quá nửa số lần nó chỉ nhìn danh sách rồi thôi', () => {
  const rng = rngFrom(77);
  const outs = Array.from({ length: 2_000 }, () => opens(roster()[4], [], 300_000, rng, 0, 4));
  const opened = outs.filter(Boolean).length;
  assert.ok(opened > 0 && opened < outs.length, `mở ${opened}/${outs.length} lần`);
  assert.ok(opened < outs.length * 0.6, 'thấy trống là mở thì danh sách đầy bàn không ai ngồi');
});

// ---- nhịp người -------------------------------------------------------------------------------

test('nghĩ bao giờ cũng mất một khoảng thời gian đọc ra được', () => {
  // `THINK_MS` của máy đồ đạc là 2.100, phẳng lì, và đó là một trong mười một cái dấu vết. Cái
  // đáng canh ở đây chỉ là: không bao giờ ra số không, không bao giờ ra số âm, không bao giờ ra
  // một số lẻ nửa mili giây mà `setTimeout` phải đoán hộ.
  const rng = rngFrom(3);
  for (const one of roster()) {
    for (let draw = 0; draw < 100; draw += 1) {
      const ms = thinkFor(one, { choices: draw % 13, cards: draw % 14, first: draw % 5 === 0 }, rng);
      assert.ok(ms > 0, `${one.userId} nghĩ ${ms}ms`);
      assert.ok(Number.isInteger(ms));
    }
  }
  assert.ok(thinkFor(roster()[0], {}, rngFrom(1)) > 0, 'không có gì để nói thì vẫn phải mất một lúc');
});

test('nước khó nghĩ lâu hơn nước dễ, và nước đầu ván lâu hơn cả', () => {
  // Nhiều nước hợp lệ và bài còn dài là nhiều thứ phải cân nhắc; nước đầu của một ván là lúc người
  // ta ngồi đọc cả tay bài. Một cái ghế nghĩ đúng bằng nhau ở mọi nước là một cái ghế đang đếm
  // giờ chứ không đang nghĩ.
  const many = 4_000;
  const measure = (what) => {
    const rng = rngFrom(101);
    return avg(Array.from({ length: many }, () => thinkFor(roster()[0], what, rng)));
  };
  const easy = measure({ choices: 1, cards: 3 });
  const hard = measure({ choices: 12, cards: 13 });
  const opening = measure({ choices: 12, cards: 13, first: true });

  assert.ok(hard > easy, `nước khó ${Math.round(hard)}ms, nước dễ ${Math.round(easy)}ms`);
  assert.ok(opening > hard, `nước đầu ván ${Math.round(opening)}ms, nước khó ${Math.round(hard)}ms`);
});

test('con thong thả nghĩ lâu hơn con nhanh tay', () => {
  // `pace` là nét riêng, và nó tồn tại để cái bàn không đọc ra là hai mươi bản sao của cùng một
  // người. Nếu nó không đi vào con số thì nó chỉ là một cột thừa trong danh sách.
  const group = roster();
  const slow = group.reduce((a, b) => (a.pace > b.pace ? a : b));
  const quick = group.reduce((a, b) => (a.pace < b.pace ? a : b));
  const measure = (one) => {
    const rng = rngFrom(202);
    return avg(Array.from({ length: 3_000 }, () => thinkFor(one, { choices: 4 }, rng)));
  };
  assert.ok(measure(slow) > measure(quick), `${slow.userId} phải nghĩ lâu hơn ${quick.userId}`);
});

test('và thỉnh thoảng họ đi đâu mất', () => {
  // Cái đuôi hiếm này không phải trang trí. Một cái ghế **chưa bao giờ** nghĩ quá mười giây là một
  // cái ghế không có người ngồi: bàn thật nào cũng có người lơ đãng, và trong mười một cái dấu
  // vết thì "bao giờ cũng đi trong đúng hai giây" là cái người chơi đọc ra sớm nhất.
  const group = roster();
  const rng = rngFrom(909);
  const draws = Array.from({ length: 5_000 },
    (ignore, at) => thinkFor(group[at % group.length], { choices: 8, cards: 13 }, rng));

  const long = draws.filter((ms) => ms > 10_000).length;
  assert.ok(long > 0, 'năm nghìn nước mà không lần nào nghĩ quá mười giây');
  assert.ok(long < draws.length * 0.2, `${long}/5000 nước nghĩ quá mười giây thì bàn nào cũng treo`);

  // Và cái đuôi ấy phải là *đuôi*: phần lớn các nước vẫn nằm trong một nhịp người ta ngồi đợi được.
  assert.ok(avg(draws) < 8_000, `trung bình ${Math.round(avg(draws))}ms là chậm quá mức người`);
});

test('nhưng cái đuôi ấy không bao giờ chạm tới cái đồng hồ một lượt', () => {
  // Hết `TURN_MS` thì `sweep` đi hộ một nước, và nước nó đi là nước rẻ nhất còn đánh được — tức là
  // một con mức cao vừa nghĩ ba mươi giây sẽ bị đánh hộ một nước dở. Chủ sòng nói *"cứ đánh hết
  // sức"*, và một lượt bị cướp mất thì không phải đánh hết sức. Nên đuôi dài để **nhìn** thì được,
  // để mất lượt thì không.
  const most = Math.round((TURN_MS - 6_000) * SPEED);
  const group = roster();
  const rng = rngFrom(1_234);

  let top = 0;
  for (let draw = 0; draw < 40_000; draw += 1) {
    // Đúng cái nước đắt nhất có thể: con chậm nhất, nhiều lựa chọn nhất, bài dài nhất, nước đầu.
    const ms = thinkFor(group[draw % group.length], { choices: 99, cards: 99, first: true }, rng);
    assert.ok(ms <= most, `nghĩ ${ms}ms, quá cái kẹp ${most}ms`);
    assert.ok(ms < TURN_MS * SPEED, `nghĩ ${ms}ms là đủ để bị sweep đi hộ một nước`);
    if (ms > top) top = ms;
  }
  assert.equal(top, most, 'không lần nào chạm tới cái kẹp thì cái kẹp không phải chỗ nó đang nằm');
});

test('đứng dậy hay ván nữa, và càng đánh lâu càng hay đứng dậy', () => {
  // **Bắt buộc phải có**, không phải tô vẽ: `rematch` đếm những ghế không phải máy, nên một tay
  // máy không bấm gì cả là một cái bàn treo tới lúc bị quét — và người thật thì ngồi nhìn màn hình
  // "đang đợi" mà không đợi ai cả.
  const rate = (hands) => {
    const rng = rngFrom(404);
    const outs = Array.from({ length: 4_000 }, () => again(roster()[0], { hands }, rng));
    assert.ok(outs.every((one) => one === 'rematch' || one === 'leave'),
      'trả về một chữ thứ ba thì người gọi không biết làm gì với nó');
    return outs.filter((one) => one === 'leave').length / outs.length;
  };

  const first = rate(1);
  const later = rate(5);
  const long = rate(12);

  assert.ok(first > 0 && first < 1, `ván đầu đã bỏ về ${first}`);
  assert.ok(later > first, `năm ván ${later} phải hay bỏ về hơn một ván ${first}`);
  assert.ok(long > later, `mười hai ván ${long} phải hay bỏ về hơn năm ván ${later}`);
});

test('không ai bấm ván nữa ngay lúc màn hình vừa hiện', () => {
  const rng = rngFrom(55);
  const waits = Array.from({ length: 500 }, () => againAfter(roster()[0], rng));
  assert.ok(waits.every((ms) => ms >= Math.round(1_200 * SPEED) && Number.isInteger(ms)),
    'bấm trong một giây là một cái dấu vết, y như nghĩ đúng 2,1 giây mọi lần');
  assert.ok(new Set(waits).size > 100, 'ai cũng đợi đúng bằng nhau thì cũng là một cái dấu vết');
});

test('một ngày ở đây là đúng một ngày của cái sổ', () => {
  // Hai chỗ tính ngày theo hai quy ước là hai cái log không cộng lại được với nhau. Nên ngày ở đây
  // không phải một hàm thứ hai, nó là đúng cái hàm bên `economy.mjs`.
  assert.equal(today, dayIn);
  assert.equal(today(atHour(0)), today(atHour(23)), 'cùng một ngày Việt Nam thì cùng một dòng sổ');
  assert.notEqual(today(atHour(23)), today(atHour(23) + 2 * 3_600_000));
});
