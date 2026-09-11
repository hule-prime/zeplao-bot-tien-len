#!/usr/bin/env node
// Một bản widget đã upload, thử bằng trình duyệt thật, đi trọn đường mà web đi.
//
//   node tools/widget-selftest.mjs <botId> <version>
//
// Vì sao có cái này: mỗi lần đẩy widget lên là một lần có nguy cơ **khung trắng**, và cái khung
// trắng thì không nói gì cả — không log, không lỗi, không một dòng nào ở đâu. Cách duy nhất
// người ta biết là có người mở game rồi nhắn "trắng bóc". Cả một dãy commit của kho này là
// những lần đi tìm nó bằng cách đoán: đường dẫn asset, upload qua mấy origin, kiểm từng file
// sau khi upload, thử lại cái bắt tay `ready`. Đoán được vài lần, rồi lần sau lại đoán.
//
// Cái mà mọi lần đoán ấy thiếu là **một phép thử chạy đúng cái trang đã upload, trong một trình
// duyệt, tới tận lúc nó vẽ ra chữ**. Kiểm từng file trả về 200 chưa đủ: bảy file nạp nối đuôi
// nhau, và một file 200 nhưng rỗng, hay một cái `SyntaxError` vì hai file khai trùng một cái
// tên, đều cho ra đúng một kết quả — khung trắng, im lặng.
//
// Nó kiểm bốn nấc, và nấc nào hỏng cũng nói ra được thành một câu:
//
//   1. Cả bảy file nạp được — nếu dây nạp đứt giữa chừng thì số script trên trang sẽ thiếu.
//   2. Không có ngoại lệ nào lúc nạp — một `SyntaxError` là cả trang không chạy một dòng.
//   3. Trang gọi `ready` về cho host — không có nó thì host chờ mãi và khung trắng vĩnh viễn.
//   4. Đưa `hello` + `state` vào thì nó **vẽ ra chữ thật**, không phải một cái khung rỗng.
//
// Mẹo làm được việc này mà không cần cái host thật: mở trang ở **tầng ngoài cùng**. Lúc ấy
// `parent === window`, nên `parent.postMessage` của `zeplao.js` rơi vào chính trang này, và một
// listener cài trước khi trang chạy sẽ nghe được y như host nghe. Nhúng vào iframe thì không
// làm được — trang từ chối bị nhúng từ mọi origin không phải của app.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [botId, version] = process.argv.slice(2);
if (!botId || !version) {
  console.error('cần: node tools/widget-selftest.mjs <botId> <version>');
  process.exit(2);
}

const HOST = process.env.ZEPLAO_WIDGET_HOST ?? 'https://kuku.vn';
const URL_ = `${HOST}/api/widgets/${botId}/${version}`;

/// Chỗ Chrome đứng. Đổi được bằng biến môi trường, vì đây là thứ khác nhau ở mỗi cái máy.
const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/// Một cái sảnh đủ để trang có thứ mà vẽ. Không lấy từ bot đang chạy: phép thử này nói về
/// **cái trang**, và một phép thử cần một con bot sống mới chạy được là một phép thử không ai
/// chạy trước khi upload.
const STATE = {
  phase: 'choosing', gameId: null, gold: 50_000, daily: 30_000, dailyGold: 30_000,
  adsEndsAt: null, adsLeft: 3, adsGold: 8_000, broke: false,
  stakes: [1_000, 5_000, 20_000], minStake: 1_000, maxStake: 50_000, botStake: 10_000,
  rooms: [], playing: [], table: [],
};

const nap = (ms) => new Promise((done) => setTimeout(done, ms));

const profile = mkdtempSync(join(tmpdir(), 'widget-selftest-'));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=400,620', 'about:blank',
], { stdio: 'ignore' });

let leaving = false;
const leave = (code, why) => {
  if (leaving) return;
  leaving = true;
  console[code ? 'error' : 'log'](why);
  try { chrome.kill(); } catch { /* đã đi rồi thì thôi */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* kệ */ }
  process.exit(code);
};

chrome.on('error', () => leave(2,
  `không mở được Chrome ở ${CHROME} — đặt biến CHROME trỏ tới chỗ khác`));

// Chờ cổng gỡ lỗi mở ra. Chrome mất khoảng một giây, và trên máy bận thì lâu hơn.
let target = null;
for (let tries = 0; tries < 40 && !target; tries++) {
  await nap(250);
  target = await fetch(`http://127.0.0.1:${port}/json`)
    .then((answer) => answer.json())
    .then((all) => all.find((one) => one.type === 'page'))
    .catch(() => null);
}
if (!target) leave(2, 'Chrome không mở cổng gỡ lỗi');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((done, fail) => { ws.onopen = done; ws.onerror = fail; })
  .catch(() => leave(2, 'không nối được vào Chrome'));

let no = 0;
const waiting = new Map();
const blew = [];
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    const it = message.params.exceptionDetails;
    blew.push(it.exception?.description ?? it.text);
  }
  if (message.id && waiting.has(message.id)) {
    waiting.get(message.id)(message);
    waiting.delete(message.id);
  }
};
const call = (method, params = {}) => new Promise((done) => {
  const mine = ++no;
  waiting.set(mine, done);
  ws.send(JSON.stringify({ id: mine, method, params }));
});
const inPage = async (code) => {
  const answer = await call('Runtime.evaluate',
    { expression: code, returnByValue: true, awaitPromise: true });
  return answer.result?.result?.value;
};

await call('Runtime.enable');
await call('Page.enable');

// Cái host, cài trước khi trang chạy một dòng nào.
await call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__calls = [];
    window.addEventListener('message', function (event) {
      var data = event.data;
      if (!data || data.zeplao !== 'call') return;
      window.__calls.push(data.method);
      if (data.method !== 'ready') return;
      window.postMessage({ zeplao: 'hello',
        viewer: { id: 'u1', displayName: 'Thọ', role: 'player' },
        theme: {}, room: { host: 'web', width: 390, height: 570 } }, '*');
      window.postMessage({ zeplao: 'state', state: ${JSON.stringify(STATE)} }, '*');
    });
  `,
});

await call('Page.navigate', { url: URL_ });
// Lâu hơn bảy giây của bản đầu: trang giờ tự thử lại tới ba lần mỗi file, mỗi lần có đồng hồ
// chống treo ba giây, nên một bộ đang chật vật vẫn có thể về đích sau hơn chục giây. Chờ ngắn
// hơn quãng ấy là tự mình dựng ra một cái đỏ giả.
await nap(20_000);

const scripts = (await inPage(
  `[...document.querySelectorAll('script')].map((s) => s.src.split('/').pop()).filter(Boolean)`,
)) ?? [];
const calls = (await inPage('window.__calls')) ?? [];
const drawn = (await inPage(
  `document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : ''`,
)) ?? '';

// Tiếng nổ của bên thứ ba không phải chuyện của bộ widget. Cloudflare cắm một cái beacon vào
// mọi trang qua CDN của họ và CSP của chính app chặn nó lại — nó kêu mỗi lần và không liên quan.
const ours = blew.filter((one) => !String(one).includes('cloudflareinsights'));

console.log(`widget v${version} · ${URL_}`);
console.log(`  script nạp: ${scripts.join(' ')}`);
console.log(`  gọi về host: ${calls.join(' ') || '(không gọi gì)'}`);
console.log(`  vẽ ra: ${drawn.slice(0, 90) || '(trắng)'}`);

const wrong = [];
// Đúng bảy cái tên, không phải bảy cái bất kỳ. Đếm số script thì đếm nhầm: CDN cắm thêm cái
// beacon của nó vào trang, nên một file của bộ rơi mất vẫn ra đủ bảy. Thiếu tên nào thì dây
// nạp đứt ở ngay trước tên ấy — và đứt thì im lặng, vì cái vòng nạp chỉ nối tiếp ở `onload`.
const BUNDLE = ['zeplao.js', 'faces.js', 'sound.js', 'pieces.js', 'board.js', 'taixiu.js',
  'tienlen.js'];
const short = BUNDLE.filter((name) => !scripts.some((one) => one.startsWith(name)));
if (short.length) wrong.push(`không nạp được: ${short.join(' ')} — dây nạp đứt ở đó`);
if (ours.length) wrong.push(`nổ lúc nạp: ${ours.join(' | ')}`);
if (!calls.includes('ready')) wrong.push('trang không gọi `ready` — host sẽ chờ mãi, khung trắng');
// Chữ thật, không phải cái vỏ. Vỏ tĩnh luôn có sẵn trong `index.html`, nên "có #app" không
// chứng minh được gì; thứ chứng minh là con số trong ví, thứ chỉ có sau khi `state` về tới.
if (!drawn.includes('50.000')) wrong.push('nhận state rồi vẫn không vẽ ra sảnh');

leave(wrong.length ? 1 : 0, wrong.length
  ? `KHUNG TRẮNG: ${wrong.join(' · ')}`
  : '  ✓ nạp đủ, bắt tay được, và vẽ ra sảnh thật');
