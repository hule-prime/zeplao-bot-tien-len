// Tài xỉu: ba con xúc xắc, một cái bát, và cái tổng của chúng.
//
// Cùng con bot, cùng cái ví, cùng đường chip với bầu cua — và cố tình **không** dùng chung mặt
// bàn. Bầu cua đặt vào một *mặt*: cửa là một con vật, nhìn ra con vật là xong. Tài xỉu đặt vào
// một *câu nói về con số*: lớn hay nhỏ, chẵn hay lẻ, hay cả ba giống hệt nhau. Hai thứ ấy không
// xếp giống nhau ở chỗ nào cả, nên đây là một màn riêng chứ không phải chiếu bầu cua đổi hình.
//
// Nạp **trước** `tienlen.js`. Mấy hàm ở đây được `render()` bên kia gọi tới, mà khai báo hàm thì
// được hoist ra toàn cục ngay khi file này chạy xong — còn mọi thứ file này đọc của bên kia
// (`state`, `stack`, `squeezing`…) đều chỉ đọc **trong lòng hàm**, tức là lúc đã chạy rồi. Đọc ở
// thân file thì rơi vào vùng chết, và vùng chết thì không báo lỗi cho tới lúc có người mở bàn.

/**
 * Cái bát tự đi sau bằng ấy, nếu không ai đụng vào.
 *
 * Hai giây tám, không phải một tám. Một tám là **chưa kịp với tay**: mắt còn đang ở mặt chiếu
 * xem cửa nào của mình, ngẩng lên thì cái bát đã đi rồi — và một cái nặn tự mở trước khi người
 * ta kịp chạm thì không phải là một cái nặn, nó là một hiệu ứng.
 *
 * Trần của nó là `TX_SHOW_MS`: mở xong còn phải đủ chỗ để đọc kết quả. Có test canh cả hai đầu.
 */
const BAT_MS = 2_800;

/// Ba con hiện ra cách nhau bằng ấy khi cái bát đi trong một nhịp.
const TX_LAND_MS = 110;

/// Mặt xúc xắc: chấm ở đâu, theo lưới 3×3. Vẽ bằng chấm chứ không phải bằng số, vì trên bàn thật
/// nó là chấm — và đếm chấm nhanh hơn đọc số ở cỡ hai mươi pixel.
const TX_PIPS = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};

/// Nhất và tứ chấm đỏ. Xúc xắc ở đâu cũng vẽ thế, và một bộ ba con toàn chấm đen thì trông như
/// xúc xắc của bàn cờ tỷ phú chứ không phải của một cái bát.
const TX_RED = new Set([1, 4]);

/// Cửa nào ra thì hiện chữ gì, khi bot chưa kịp nói. Bot mới là chỗ giữ tên cửa — cái này chỉ để
/// khung đầu tiên không trống.
const TX_NAMES = { xiu: 'Xỉu', tai: 'Tài', chan: 'Chẵn', le: 'Lẻ', bao: 'Bão' };

/// Ván nào đang được nặn, và cái bát của ván ấy đã đi chưa.
///
/// Khoá theo `bàn:ván` chứ không phải theo số ván: đổi bàn mà số ván trùng nhau thì cái bát của
/// bàn mới coi như đã mở rồi.
let txFor = '';
let txLifted = '';

/**
 * Con nào đang **thò ra khỏi cái bát**, ngay lúc này.
 *
 * Không phải một trạng thái ai đó bật lên: nó được đo lại từ hình học mỗi lần ngón tay nhích cái
 * bát. Kéo chậm thì ba con lần lượt ló ra và cái tổng lớn dần theo — đó là nặn. Kéo nhanh hay
 * chạm một cái thì cả ba ra cùng lúc, và không ai phải đợi gì.
 *
 * Nó **không** quyết định kết quả đã mở hay chưa — cái ấy là `txLifted`. Ba con ló ra trong lúc
 * cái bát còn ở đó là mình đang liếc trộm, chứ không phải ván đã mở.
 */
let txUp = new Set();
let txTumbling = null;

/// Nửa nào của sòng đang hiện: chiếu, cầu, hay luật.
let txTab = 'board';

/// Ván này, theo cách duy nhất phân biệt được nó với ván trùng số ở bàn khác.
function txKey() {
  return state ? `${state.gameId}:${state.round}` : '';
}

/**
 * Cái bát của ván này đã đi chưa.
 *
 * `covered()` bên `tienlen.js` hỏi cái này, và toàn bộ kết quả treo ở câu trả lời: cái ví, cửa
 * sáng, dòng được mất, bảng cầu.
 *
 * Ván mới thì mặc định là chưa. Không phải chi tiết vụn: `drawPurse()` chạy *trước* `drawTaixiu()`
 * trong `render()`, nên nếu chỗ này trả lời theo cái `txLifted` của ván trước thì cái ví nói ra
 * kết quả trước khi cái bát kịp úp xuống.
 */
function txAllUp() {
  if (!state || state.kind !== 'taixiu') return true;
  if (!squeezing) return true;
  return txLifted === txKey();
}

/// Đặt cái sòng xuống: thôi lắc, thôi đếm giờ lật. Gọi khi màn hình chuyển sang thứ khác — một
/// cái đồng hồ còn chạy sau lưng là một cái `render()` nổ ra giữa lúc người ta đang cầm bài.
function txIdle() {
  clearInterval(txTumbling);
  txTumbling = null;
}

/// Khe giữa ba con, cỡ lớn nhất một con được phép to, và chỗ chừa dưới đáy bát cho hàng chữ.
/// `TX_BELOW` phải cùng con số với `padding-bottom` của `#tx-bowl`.
const TX_GAP = 8;
const TX_BIGGEST = 58;
const TX_BELOW = 58;

/// Con xúc xắc to bằng bao nhiêu. Phép cắt nằm ở `dieFor` bên `tienlen.js` — cùng một phép cho cả
/// hai cái bát, vì cả hai đều là cái thứ co lại khi cột hết chỗ.
const txDieSize = (bowlHeight) => dieFor(bowlHeight, TX_GAP, TX_BIGGEST, TX_BELOW);

/// Chấm lên mặt một con. Tách ra vì lúc quay nó được gọi mười một lần một giây.
function setPips(die, pips) {
  die.dataset.pips = String(pips);
  die.replaceChildren();
  for (const [row, col] of TX_PIPS[pips] || []) {
    const dot = document.createElement('i');
    dot.className = 'tx-pip' + (TX_RED.has(pips) ? ' red' : '');
    dot.style.gridRow = String(row);
    dot.style.gridColumn = String(col);
    die.append(dot);
  }
}

/// Một con xúc xắc, chấm và tất cả.
function pipDie(pips, extra) {
  const die = document.createElement('div');
  die.className = 'tx-die' + (extra ? ' ' + extra : '');
  setPips(die, pips);
  return die;
}

/**
 * Một lần xóc, đọc ra thành chữ.
 *
 * Khoảng tài/xỉu lấy từ `state` chứ không viết cứng ở đây: bot là chỗ duy nhất được quyết cửa
 * nào ăn, và một trang tự biết luật là một trang có thể bị sửa cho biết luật khác. Chỗ này chỉ
 * dùng để **vẽ** — tiền thì bot đã tính xong và gửi sang rồi.
 */
function txReadOf(dice) {
  const total = dice.reduce((sum, one) => sum + one, 0);
  const bao = dice[0] === dice[1] && dice[1] === dice[2];
  const big = (state && state.big) || [11, 17];
  return { total, bao, side: bao ? 'bao' : total >= big[0] ? 'tai' : 'xiu' };
}

/// Cửa nào ván này ăn, theo một bộ ba giả định. Dùng cho dải "con cuối ra gì thì sao" — chỗ duy
/// nhất trang này phải tự đoán, và nó đoán về một ván **chưa xảy ra**.
function txWinsOf(dice) {
  const read = txReadOf(dice);
  if (read.bao) return ['bao'];
  const small = (state && state.small) || [4, 10];
  const big = (state && state.big) || [11, 17];
  const won = [];
  if (read.total >= big[0] && read.total <= big[1]) won.push('tai');
  if (read.total >= small[0] && read.total <= small[1]) won.push('xiu');
  won.push(read.total % 2 === 0 ? 'chan' : 'le');
  return won;
}

/**
 * Con nào đang thò ra khỏi cái bát, đo lại từ hình học.
 *
 * Gọi mỗi lần ngón tay nhích cái bát. Cái bát là một hình **tròn**, nên phép kiểm là tròn-với-ô
 * chứ không phải ô-với-ô: điểm gần tâm nhất trên hình chữ nhật của con xúc xắc, xa tâm hơn bán
 * kính thì con ấy đã ló ra.
 *
 * Nó chỉ đổi cái tổng đang hiện, nên chỉ vẽ lại đúng cái tổng. Một `render()` gọi giữa lúc đang
 * kéo là dựng lại cả cái bát và cướp mất `setPointerCapture` khỏi ngón tay đang giữ nó.
 */
function txPeek() {
  const bat = $('tx-bat').getBoundingClientRect();
  if (!bat.width) return;
  const cx = (bat.left + bat.right) / 2;
  const cy = (bat.top + bat.bottom) / 2;
  const r = bat.width / 2;

  const out = new Set();
  [...$('tx-dice').children].forEach((die, i) => {
    const box = die.getBoundingClientRect();
    const nx = Math.max(box.left, Math.min(cx, box.right));
    const ny = Math.max(box.top, Math.min(cy, box.bottom));
    if (Math.hypot(cx - nx, cy - ny) > r) out.add(i);
  });

  if (out.size === txUp.size) return;
  for (let i = 0; i < out.size - txUp.size; i++) landedSound(i * 0.06);
  txUp = out;
  drawTxSum();
}

/**
 * Cả cái sòng, vẽ lại từ đầu.
 *
 * Cái nắp và ba con thì **không** vẽ lại mỗi lần: chúng đang có ngón tay đặt lên. Chỗ nào có thể
 * đang bị cầm thì được canh bằng `dataset` và chỉ dựng lại khi thực sự đổi.
 */
function drawTaixiu() {
  // Ván mới thì úp lại, không cần ai nhớ úp.
  if (txFor !== txKey()) {
    txFor = txKey();
    txUp = new Set();
    txLifted = '';
  }
  // Tắt nặn thì không có cái bát nào cả — chứ không phải úp xuống rồi mở ngay. Úp một phần mười
  // giây rồi bật lên là một cái nháy, khó chịu hơn hẳn không có gì.
  if (!squeezing && state.phase === 'paid' && txLifted !== txKey()) {
    txLifted = txKey();
    txUp = new Set([0, 1, 2]);
    for (let i = 0; i < 3; i++) landedSound(i * (TX_LAND_MS / 1000));
  }

  drawTxDice();
  drawTxSum();
  drawTxNote();
  drawTxBat();
  drawTxTabs();

  if (txTab === 'cau') drawTxCau();
  else if (txTab === 'help') drawTxHelp();
  else { drawTxBoard(); drawChips($('tx-chips')); }
}

/**
 * Ba con trong bát.
 *
 * Chưa xóc thì để nguyên ván trước, mờ đi — cái bàn thật cũng để đó cho tới lúc xóc lại, và một
 * cái bát trống trơn suốt hai mươi lăm giây đọc ra là màn hình chưa tải xong. Đang xóc thì chấm
 * nhảy loạn: bot chưa nghĩ ra ba con ấy là gì, nên chẳng có gì để lộ.
 *
 * **Xóc xong là ba con nằm yên. Không quay nữa, không nắp, không dấu hỏi.**
 *
 * Hai bản trước đều sai ở đúng một chỗ, và sai nặng dần. Bản đầu úp lên mỗi con một cái nắp con
 * có chữ `?`: kéo cái bát ra để gặp ba cái nắp nữa, tức là mở một thứ để lộ ra ba thứ phải mở.
 * Bản sau bỏ nắp đi nhưng cho con chưa lật **quay tiếp** — mà mở bát ra thì xúc xắc đã nằm rồi,
 * không có cách nào nó còn quay, nên nó đọc ra là cái bàn bị treo.
 *
 * Cái đúng đơn giản hơn cả hai: ba con **luôn** được vẽ đúng mặt của nó, và thứ duy nhất giấu
 * chúng là cái bát nằm đè lên. Kéo bát chậm thì chúng lần lượt ló ra — đó là nặn, và nó thật, vì
 * cái đang bị che chỉ là đang bị che. Kéo nhanh, chạm một cái, hay không đụng vào thì cả ba ra
 * cùng lúc. Không ai phải đợi một cái đồng hồ nào.
 */
function drawTxDice() {
  const box = $('tx-dice');
  const past = (state.history || [])[0] || null;

  // Cắt theo cái bát trước khi vẽ. Ngoài vòng canh `dataset.at` bên dưới: khung có thể đổi kích
  // thước mà ván thì không đổi, và lúc ấy ba con vẫn phải vừa.
  const room = $('tx-bowl').getBoundingClientRect().height;
  if (room) box.style.setProperty('--die', `${txDieSize(room)}px`);


  const rolling = state.phase === 'rolling';
  const paid = state.phase === 'paid';
  const open = txLifted === txKey();

  // Chỉ dựng lại khi có gì đổi. Dựng lại giữa chừng là cướp mất cái bát khỏi ngón tay đang kéo —
  // và **không** phụ thuộc `txUp`: ba con ló ra dần trong lúc kéo là chuyện của cái bát trượt đi,
  // không phải chuyện ba con đổi hình.
  const at = `${txKey()}:${state.phase}:${squeezing ? 1 : 0}:${open ? 'mở' : 'úp'}`;
  if (box.dataset.at === at) return;
  box.dataset.at = at;
  box.replaceChildren();

  clearInterval(txTumbling);
  txTumbling = null;

  if (!paid && !rolling) {
    // Ván trước, mờ. Không có ván nào thì ba con trắng — vẫn là ba con xúc xắc, vẫn đọc ra là
    // đang chờ xóc.
    for (let i = 0; i < 3; i++) box.append(past ? pipDie(past[i], 'past') : pipDie(0, 'past'));
    return;
  }

  const dice = rolling ? [1, 1, 1] : (state.dice || [1, 1, 1]);
  const spun = [];

  dice.forEach((pips, i) => {
    const die = pipDie(pips, rolling ? 'tumbling' : '');
    box.append(die);
    if (rolling) spun.push(die);
    // Rơi xuống lần lượt, lúc cái bát vừa đi trong một nhịp. Hẹn giờ ở đây chứ không phải bằng
    // `animation-delay`: một animation bị hoãn thì giữ nguyên khung đầu, mà khung đầu của nó là
    // một con xúc xắc nhỏ xíu không ai đọc được cho tới lượt của nó.
    if (open) setTimeout(() => die.classList.add('landing'), i * TX_LAND_MS);
  });

  if (!spun.length) return;

  // Chấm nhảy loạn, và **chỉ trong lúc còn lắc**. Mặt đang hiện chẳng liên quan gì tới mặt sẽ ra
  // — bot chưa quyết, nên chẳng có gì để lộ.
  txTumbling = setInterval(() => {
    for (const die of spun) setPips(die, 1 + Math.floor(Math.random() * 6));
  }, 90);
}

/**
 * Cái tổng, to hết cỡ, ở ngay dưới ba con.
 *
 * Toàn bộ trò này là con số ấy. Trong lúc còn nặn nó hiện phần đã ngửa cộng lại và một dấu hỏi —
 * cái hồi hộp nằm đúng ở đó, và giấu luôn cả phần đã ngửa thì nặn từng con chẳng để làm gì.
 */
function drawTxSum() {
  const box = $('tx-sum');
  // Cửa đang mở thì cái tổng **không chiếm dòng nào cả**: ba con của ván trước được nói bằng một
  // cái nhãn dán ở góc bát (`txPastChip`), chứ không phải một hàng nằm dưới ba con. Một hàng ở đó
  // đẩy cả ba con lên sát mép trên, mà hai mươi lăm giây chờ là đúng lúc người ta nhìn cái bát
  // nhiều nhất.
  box.replaceChildren();
  box.hidden = state.phase !== 'rolling' && state.phase !== 'paid';
  if (box.hidden) return;

  const number = document.createElement('b');
  number.className = 'tx-total';

  if (state.phase === 'rolling') {
    number.textContent = '?';
    box.append(number);
    return;
  }

  const dice = state.dice || [];
  const part = [...txUp].reduce((sum, i) => sum + dice[i], 0);
  // "Xong" là **cái bát đã đi hẳn**, không phải "ba con đã ló ra". Kéo chậm thì có một quãng cả
  // ba con đã thò ra khỏi hình tròn mà cái bát vẫn còn nằm đó: lúc ấy cái tổng đọc được rồi, mà
  // cửa thắng thì chưa được sáng — sáng lên trong lúc cái bát còn trên bàn là mặt chiếu nói ra
  // kết quả trước cái bát.
  const all = !covered();

  // Chưa lật con nào thì **không có số nào cả**, chỉ một dấu hỏi. Một số 0 to tướng ngay dưới ba
  // con còn úp đọc ra là "tổng bằng không" — mà đúng vào lúc ấy thì con số là thứ duy nhất người
  // ta đang nhìn.
  number.textContent = all ? String(state.total) : txUp.size ? String(part) : '?';
  box.append(number);

  if (!all) {
    // Còn con nào chưa ló thì còn dấu hỏi. Ba con ló hết rồi thì thôi — một dấu hỏi đứng cạnh
    // một cái tổng đã đủ ba con là một dấu hỏi không hỏi gì cả.
    if (txUp.size && txUp.size < 3) {
      const more = document.createElement('span');
      more.className = 'tx-more';
      more.textContent = '+ ?';
      box.append(more);
    }
    box.append(txNeed());
    return;
  }

  const side = document.createElement('span');
  side.className = 'tx-side ' + (state.bao ? 'bao' : txReadOf(dice).side);
  side.textContent = state.bao
    ? `BÃO · ba con ${dice[0]}`
    : (state.doorNames || TX_NAMES)[txReadOf(dice).side].toUpperCase();
  box.append(side);

  // Chẵn hay lẻ, nói ra chứ không bắt nhìn số mà tự nghĩ. Bão thì không nói: bão không chẵn không
  // lẻ, nó ăn hết.
  if (!state.bao) {
    const parity = document.createElement('span');
    parity.className = 'tx-parity';
    parity.textContent = (state.doorNames || TX_NAMES)[state.total % 2 === 0 ? 'chan' : 'le'];
    box.append(parity);
  }
}

/**
 * Còn đúng một con úp: con ấy ra gì thì thành gì.
 *
 * Sáu con nhỏ, mỗi con một khả năng, nhuộm theo cửa nó sẽ ra — và viền vàng những khả năng **trả
 * tiền cho mình**. Đây là cả cái thú của nặn tài xỉu: hai con ngửa rồi thì trò chơi không còn là
 * may rủi nữa, nó là một danh sách sáu dòng và mình biết mình cần dòng nào.
 */
function txNeed() {
  const strip = document.createElement('span');
  strip.className = 'tx-need';
  const dice = state.dice || [];
  if (txUp.size !== 2 || dice.length !== 3) return strip;

  const hidden = [0, 1, 2].find((i) => !txUp.has(i));
  const mine = state.me ? myBets() : {};

  for (let pips = 1; pips <= 6; pips++) {
    const guess = dice.map((one, i) => (i === hidden ? pips : one));
    const read = txReadOf(guess);
    const paid = txWinsOf(guess).some((door) => mine[door]);

    const die = pipDie(pips, `mini ${read.side}` + (paid ? ' paid' : ''));
    die.title = `${read.total} · ${(state.doorNames || TX_NAMES)[read.side]}`;
    strip.append(die);
  }
  return strip;
}

/// Dòng dưới bát: đồng hồ, hay chuyện vừa xảy ra.
/**
 * Ván trước là ván nào, dán ở góc bát.
 *
 * Ba con mờ nằm trong bát mà không có dòng này thì hoặc người ta không nhìn thấy chúng, hoặc
 * nhìn thấy rồi tưởng là ván đang chạy — mà cái thứ hai còn tệ hơn. Ở **góc** chứ không phải
 * dưới ba con, vì một hàng nằm dưới ba con là ba con bị đẩy lên sát mép trên.
 */
function txPastChip() {
  const past = (state.history || [])[0] || null;
  if (!past || state.phase !== 'betting') return null;

  const read = txReadOf(past);
  const chip = document.createElement('div');
  chip.className = 'tx-past';

  const said = document.createElement('span');
  said.className = 'tx-past-note';
  said.textContent = 'ván trước';
  const many = document.createElement('b');
  many.className = 'tx-past-sum';
  many.textContent = String(read.total);
  const side = document.createElement('span');
  side.className = 'tx-side small ' + read.side;
  side.textContent = (state.doorNames || TX_NAMES)[read.side];

  chip.append(said, many, side);
  return chip;
}

function drawTxNote() {
  const bowl = $('tx-bowl');
  const note = $('tx-note');
  // Small and fast: a bát that swings across the screen reads as the screen moving rather than
  // as somebody's hand.
  bowl.classList.toggle('shaking', state.phase === 'rolling');
  note.replaceChildren();
  for (const gone of bowl.querySelectorAll('.corner')) gone.remove();
  for (const gone of bowl.querySelectorAll('.tx-past')) gone.remove();
  bowl.append(cornerChips());
  const past = txPastChip();
  if (past) bowl.append(past);

  const hidden = covered();

  if (hidden) {
    // Kéo chậm thì ba con ló ra dần, và dòng này đi theo. Không giục, không đếm ngược: cái bát
    // tự đi sau một nhịp nếu không ai đụng vào.
    note.textContent = txUp.size === 2 ? 'Còn một con nữa…' : 'Xóc xong rồi — kéo bát ra xem';
  } else if (state.phase === 'paid') {
    const mine = (state.paid || []).find((one) => one.userId === z.viewer.id);
    if (state.bao) {
      const said = document.createElement('b');
      said.className = 'tx-bao-note';
      said.textContent = 'Bão — Tài, Xỉu, Chẵn, Lẻ đều thua';
      note.append(said);
      if (mine && mine.change) {
        const money = document.createElement('span');
        money.textContent = ` · ${change(mine.change)} vàng`;
        note.append(money);
      }
    } else if (mine && mine.change) {
      const said = document.createElement('b');
      said.textContent = `${change(mine.change)} vàng`;
      note.append(said);
    } else {
      note.textContent = mine ? 'Hoà' : 'Ván này bạn không đặt';
    }
  } else if (state.phase === 'rolling') {
    note.textContent = 'Đang xóc…';
  } else if (state.bettingEndsAt) {
    const clock = document.createElement('span');
    clock.className = 'clock';
    const many = (state.seats || []).length;
    note.append(document.createTextNode(`Sòng tài xỉu · ${many} người · `), clock);
  } else {
    note.textContent = 'Chọn phần cược rồi chạm vào cửa';
  }

  // Ai đang ngồi và đặt bao nhiêu. Nửa cái thú của một cái sòng là nhìn tiền người khác đi đâu.
  // Trong khối đáy, đè lên phần chừa sẵn — chứ không phải một hàng riêng trong cột.
  for (const gone of $('tx-below').querySelectorAll('.punters')) gone.remove();
  $('tx-below').prepend(punterRow(hidden));
}

/**
 * Cái nắp bát.
 *
 * Che cả kết quả chứ không riêng ba con: cái ví ở ngay trên đầu, cửa thắng sáng ở ngay dưới, và
 * bất kỳ chỗ nào trong số đó cũng nói trước — người ta sẽ liếc cái ví chứ không thèm kéo nắp.
 */
function drawTxBat() {
  const bat = $('tx-bat');
  const showing = covered() && txLifted !== txKey();

  bat.hidden = !showing;
  if (!showing) { bat.className = ''; bat.style.transform = ''; return; }

  // Đo lại mỗi lần vẽ, không chỉ lần dựng cái bát: khung đổi kích thước, hay ba con vừa bị cắt
  // nhỏ lại, mà cái bát giữ nguyên cỡ cũ thì nó hụt — và hụt là hở góc.
  fitLid(bat, $('tx-dice'), $('tx-bowl'));
  if (bat.dataset.at === txKey()) return;

  bat.dataset.at = txKey();
  bat.className = '';
  bat.style.transform = '';

  const round = txKey();
  dragOff(bat, $('tx-dice'), () => {
    if (txLifted === round) return;
    txLifted = round;
    // Con nào chưa kịp ló ra thì rơi xuống nốt, và kêu nốt.
    for (let i = 0; i < 3 - txUp.size; i++) landedSound(i * (TX_LAND_MS / 1000));
    txUp = new Set([0, 1, 2]);
    // Vẽ lại lúc nó đã ra khỏi khung chứ không phải lúc còn đang bay: vẽ ngay thì cái bát biến
    // mất giữa chừng, và cái biến mất giữa chừng thì trông như lỗi chứ không như một cú kéo.
    setTimeout(render, 380);
  }, BAT_MS, txPeek);
}

/// Chiếu, cầu, hay luật.
function drawTxTabs() {
  const tabs = $('tx-tabs');
  tabs.replaceChildren();

  const many = (state.history || []).length;
  for (const [key, label] of [
    ['board', 'Bàn cược'],
    ['cau', many ? `Soi cầu · ${many}` : 'Soi cầu'],
    ['help', 'Luật'],
  ]) {
    const tab = document.createElement('button');
    tab.className = txTab === key ? 'on' : '';
    tab.textContent = label;
    tab.onclick = () => { txTab = key; render(); };
    tabs.append(tab);
  }

  $('tx-board').hidden = txTab !== 'board';
  $('tx-rule').hidden = txTab !== 'board';
  $('tx-chips').hidden = txTab !== 'board';
  $('tx-cau').hidden = txTab !== 'cau';
  $('tx-help').hidden = txTab !== 'help';
}

/**
 * Chiếu: năm cửa, cùng ba con xúc xắc ấy.
 *
 * Tài với xỉu là hai cửa lớn vì đó là trò chơi; chẵn, lẻ, bão là một hàng nhỏ dưới, vì chúng là
 * cùng ba con ấy đọc theo kiểu khác. Xỉu đứng trước tài, theo thứ tự của những con số — chiếu nào
 * để cửa nhỏ bên phải là chiếu có người đọc ngược đúng một lần.
 */
function drawTxBoard() {
  const board = $('tx-board');
  board.replaceChildren();

  const mine = state.me ? myBets() : {};
  const theirs = (state.me && state.me.theirs) || {};
  const names = state.doorNames || TX_NAMES;
  const pays = state.pays || { xiu: 1, tai: 1, chan: 1, le: 1, bao: 30 };
  const small = state.small || [4, 10];
  const big = state.big || [11, 17];
  // Không cửa nào sáng chừng nào cái nắp còn đó. Mặt chiếu biết đáp án trước cái bát là cùng một
  // chuyện lộ bài, chỉ đi đường khác.
  const won = covered() ? [] : (state.won || []);

  // Hai dòng một cửa, không phải ba: tên và luật đứng chung một dòng, tiền đặt xuống dòng dưới.
  // Ba dòng thì hàng cửa cao hơn cả cái bát, và cái bát là chỗ trò này thật sự diễn ra.
  // Ít chữ nhất mà vẫn đủ. Bốn cửa đều ăn một-ăn-một nên không cửa nào phải nói ra — cái đáng
  // nói là **cửa nào khác đi**, và chỉ có bão khác. Bảng trả tiền đầy đủ nằm ở tab Luật, còn ở
  // đây thì mỗi dòng chữ thừa là một dòng lấy mất chỗ của cái bát.
  const hint = {
    xiu: `${small[0]}–${small[1]}`,
    tai: `${big[0]}–${big[1]}`,
    chan: 'tổng chẵn',
    le: 'tổng lẻ',
    bao: `ăn ${pays.bao}`,
  };

  const rows = [
    ['tx-row big', ['xiu', 'tai']],
    ['tx-row small', ['chan', 'le', 'bao']],
  ];

  for (const [cls, doors] of rows) {
    const row = document.createElement('div');
    row.className = cls;

    for (const door of doors) {
      const tile = document.createElement('button');
      tile.className = 'tx-door'
        + (mine[door] ? ' has' : '')
        + (won.includes(door) ? ' won' : '');
      tile.dataset.door = door;

      const head = document.createElement('span');
      head.className = 'tx-head';
      const name = document.createElement('b');
      name.textContent = names[door] || door;
      const sub = document.createElement('em');
      sub.textContent = hint[door];
      head.append(name, sub);

      const on = document.createElement('span');
      on.className = 'tx-on';
      const ahead = (mine[door] || 0) - (theirs[door] || 0);
      const all = ((state.board || {})[door] || 0) + ahead;
      if (mine[door]) {
        const ours = document.createElement('u');
        ours.className = 'tx-mine';
        ours.textContent = gold(mine[door]);
        on.append(ours);
        if (all > mine[door]) on.append(document.createTextNode(` / ${gold(all)}`));
      } else if (all) {
        on.textContent = gold(all);
      }

      tile.append(head, on);

      const canBet = state.phase === 'betting' && !!state.me;
      tile.disabled = !canBet;
      if (canBet) {
        tile.onclick = () => {
          const left = state.gold - myStaked();
          if (chip > left) {
            say(left > 0 ? `Chỉ còn ${gold(left)} vàng để đặt` : 'Hết vàng để đặt rồi');
            return;
          }
          // Vẽ trước, gửi sau. Round-trip nhanh nhất cũng một phần mười giây, và một cái chiếu
          // đợi phản hồi là một cái chiếu không nghe thấy mình.
          stack.push({ face: door, amount: chip });
          say('');
          drawTaixiu();
          drawButtons();
          sendBets();
        };
      }

      row.append(tile);
    }
    board.append(row);
  }

  // Một dòng, và là dòng luật duy nhất phải đọc trước khi đặt. Ai chưa gặp bão bao giờ thì sẽ
  // gặp nó lần đầu bằng cách mất tiền ở một cửa mình tưởng đã thắng.
  const rule = $('tx-rule');
  rule.textContent = `Bốn cửa trên ăn 1 · bão (3 con giống nhau) chặn cả bốn`;
}

/**
 * Soi cầu: một con đường, mỗi cột một mạch.
 *
 * Không phải cái lưới sáu hàng của bầu cua, và cố tình. Bầu cua có sáu mặt độc lập nên cái đáng
 * nhìn là "mặt nào ra mấy lần" — sáu hàng, mỗi hàng một mặt. Tài xỉu chỉ có hai bên, nên cái đáng
 * nhìn là **mạch**: bệt mấy ván rồi, nhảy mấy lần rồi. Đó là con đường: cùng một bên thì rơi
 * xuống dưới, đổi bên thì sang cột mới. Đúng cái bảng mọi sòng tài xỉu đều treo.
 *
 * Xúc xắc không có trí nhớ và không có gì ở đây đoán được ván sau. Nhưng đọc nó là phân nửa việc
 * người ta làm trong lúc chờ, và một cái sòng giấu nó đi là một cái sòng coi người chơi là người
 * khác.
 */
function drawTxCau() {
  const box = $('tx-cau');
  box.replaceChildren();

  const past = [...(state.history || [])].reverse();     // cũ trước, để đường đi xuôi
  if (!past.length) {
    const none = document.createElement('div');
    none.className = 'cau-none';
    none.textContent = 'Chưa có ván nào. Xóc vài ván là có cầu để soi.';
    box.append(none);
    return;
  }

  const reads = past.map(txReadOf);
  const names = state.doorNames || TX_NAMES;

  // Đếm, và mạch đang chạy. Hai câu người soi cầu hỏi trước mọi câu khác.
  const many = { tai: 0, xiu: 0, bao: 0 };
  for (const one of reads) many[one.side]++;

  let run = 1;
  for (let i = reads.length - 1; i > 0; i--) {
    if (reads[i].side === reads[i - 1].side) run++; else break;
  }
  const last = reads[reads.length - 1];

  const head = document.createElement('div');
  head.className = 'cau-head';
  const tally = document.createElement('span');
  tally.className = 'tx-tally';
  for (const side of ['tai', 'xiu', 'bao']) {
    const one = document.createElement('i');
    one.className = 'tx-count ' + side;
    one.textContent = `${names[side]} ${many[side]}`;
    tally.append(one);
  }
  const streak = document.createElement('span');
  streak.className = 'cau-span';
  streak.textContent = run > 1 ? `bệt ${run} ${names[last.side]}` : `vừa nhảy sang ${names[last.side]}`;
  head.append(tally, streak);
  box.append(head);

  // Cột theo mạch, cao nhất sáu ô rồi gãy sang cột bên — y như bảng thật.
  const road = [];
  for (const one of reads) {
    const tail = road[road.length - 1];
    if (tail && tail[0].side === one.side && tail.length < 6) tail.push(one);
    else road.push([one]);
  }

  const grid = document.createElement('div');
  grid.className = 'tx-road';
  road.forEach((column, at) => {
    const col = document.createElement('div');
    col.className = 'tx-col';
    for (const one of column) {
      const bead = document.createElement('span');
      bead.className = 'tx-bead ' + one.side + (at === road.length - 1 ? ' now' : '');
      bead.textContent = String(one.total);
      col.append(bead);
    }
    grid.append(col);
  });
  box.append(grid);

  // Mới nhất bên **phải**, vì một con đường thì đi từ trái sang phải và cột mới mọc ở cuối. Nói
  // ra một lần ở đây, và cuộn sẵn tới đó — một bảng phải cuộn tay mới thấy ván vừa rồi là bảng
  // mở ra để không dùng.
  const foot = document.createElement('div');
  foot.className = 'cau-key';
  foot.textContent = 'Mỗi cột một mạch · ván mới nhất bên phải →';
  box.append(foot);
  // Cuộn sẵn tới ván mới nhất. Đặt hai lần: một lần ngay đây cho trường hợp khung đã có sẵn kích
  // thước, và một lần ở khung hình sau — vì lúc vừa `append` thì `scrollWidth` còn là số cũ, và
  // một bảng phải cuộn tay mới thấy ván vừa rồi là bảng mở ra để không dùng.
  grid.scrollLeft = grid.scrollWidth;
  requestAnimationFrame(() => { grid.scrollLeft = grid.scrollWidth; });
}

/// Luật, đủ và ngắn. Một bảng trả tiền và hai câu về bão.
function drawTxHelp() {
  const box = $('tx-help');
  box.replaceChildren();

  const names = state.doorNames || TX_NAMES;
  const pays = state.pays || { xiu: 1, tai: 1, chan: 1, le: 1, bao: 30 };
  const small = state.small || [4, 10];
  const big = state.big || [11, 17];

  const rows = [
    ['tai', `Tổng ${big[0]}–${big[1]}`],
    ['xiu', `Tổng ${small[0]}–${small[1]}`],
    ['chan', 'Tổng là số chẵn'],
    ['le', 'Tổng là số lẻ'],
    ['bao', 'Ba con giống hệt nhau'],
  ];

  for (const [door, what] of rows) {
    const row = document.createElement('div');
    row.className = 'tx-help-row';

    const name = document.createElement('b');
    name.className = 'tx-help-name ' + door;
    name.textContent = names[door];
    const said = document.createElement('span');
    said.className = 'tx-help-what';
    said.textContent = what;
    const pay = document.createElement('u');
    pay.className = 'tx-help-pay';
    pay.textContent = `1 ăn ${pays[door]}`;

    row.append(name, said, pay);
    box.append(row);
  }

  for (const line of [
    `Ba con giống nhau là bão. Bão thì ${names.tai}, ${names.xiu}, ${names.chan} và ${names.le} `
      + 'đều thua, dù tổng có rơi vào khoảng nào.',
    `Vì thế ${names.xiu} là ${small[0]}–${small[1]} chứ không phải 3–${small[1]}, và `
      + `${names.tai} là ${big[0]}–${big[1]} chứ không phải ${big[0]}–18: tổng 3 và tổng 18 thì `
      + 'chỉ có một cách ra, và cách ấy là bão.',
    'Đặt được nhiều cửa một lúc trên cùng ba con. Cửa nào ra thì ăn theo cửa ấy, cửa nào không '
      + 'ra thì mất phần đặt ở cửa ấy.',
  ]) {
    const note = document.createElement('div');
    note.className = 'step-note';
    note.textContent = line;
    box.append(note);
  }
}
