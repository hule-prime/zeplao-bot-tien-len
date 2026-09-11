#!/usr/bin/env node
// Cái vòng nạp của trang, thử bằng cách **cố tình làm hỏng file**.
//
//   node tools/loader-test.mjs
//
// `widget-selftest.mjs` hỏi "bản vừa upload có chạy không". Cái này hỏi câu khó hơn: **khi một
// file không tới nơi thì chuyện gì xảy ra**. Câu trả lời cũ là "khung trắng, im lặng, vĩnh
// viễn", vì bảy file nạp nối đuôi nhau và cái dây ấy chỉ nối tiếp ở `onload`.
//
// Năm cảnh, và cả năm đều đã xảy ra thật ở đâu đó:
//
//   1. Một file 404 ở URL gốc rồi lành khi khoá cache đổi — đúng hình dạng của một edge CDN
//      đang giữ bản hỏng. File widget được phục vụ kèm `immutable` và hạn một năm, nên một
//      phản hồi hỏng chộp đúng lúc là một phản hồi hỏng nằm lại rất lâu.
//   2. Một file **không thiết yếu** chết hẳn: bàn phải vẫn mở được, chỉ xấu đi.
//   3. Một file **sống còn** chết hẳn: phải hiện ra chữ, không được để trắng.
//   4. Một file trả **200 với thân rỗng** — kiểu hỏng mà `onerror` không bao giờ kêu.
//   5. Một file **không bao giờ trả lời**. Kiểu này còn im hơn nữa: không `onload`, không
//      `onerror`, dây nạp đứng chờ vô hạn. Bắt được lần đầu ở chính bước tự kiểm của deploy.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const widget = join(here, '..', 'bots', 'tienlenbot', 'widget');
const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const nap = (ms) => new Promise((done) => setTimeout(done, ms));

/// Cái nền tảng viết vào lúc upload, dựng lại ở đây đủ để trang bắt tay được. Không phải bản
/// thật — bản thật không nằm trong kho — nhưng đúng cái giao kèo: nghe `message`, và gửi `call`
/// ngược lên cho cha.
const SHIM = `
(function () {
  var listeners = [];
  var viewer = { id: 'u1', displayName: 'Thọ', role: 'player' };
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.zeplao === 'state') listeners.forEach(function (f) { f(data.state); });
  });
  function send(call) { call.zeplao = 'call'; parent.postMessage(call, '*'); }
  window.Zeplao = {
    get viewer() { return viewer; },
    get theme() { return {}; },
    get room() { return { host: 'web', width: 390, height: 570 }; },
    ready: function () { send({ method: 'ready' }); },
    send: function (action) { send({ method: 'send', action: action }); },
    onState: function (f) { if (typeof f === 'function') listeners.push(f); },
    onRoom: function () {},
    setSize: function (w, h) { send({ method: 'resize', width: w, height: h }); },
    close: function () { send({ method: 'close' }); },
  };
}());
`;

const STATE = {
  phase: 'choosing', gameId: null, gold: 50_000, daily: 30_000, dailyGold: 30_000,
  adsEndsAt: null, adsLeft: 3, adsGold: 8_000, broke: false,
  stakes: [1_000, 5_000, 20_000], minStake: 1_000, maxStake: 50_000, botStake: 10_000,
  rooms: [], playing: [], table: [],
};

const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript' };

/// Phục vụ bộ widget, với đúng một chỗ hỏng đặt sẵn.
///
/// `always` sai nghĩa là chỉ hỏng khi xin đúng URL gốc — tức là thứ tự lành được bằng một khoá
/// cache khác, đúng như một bản hỏng nằm trong cache.
function serve({ breaks = '', empty = false, always = false, hang = false } = {}) {
  return createServer((request, reply) => {
    const [path, query] = request.url.split('?');
    const name = (path === '/widget' || path === '/') ? 'index.html'
      : path.replace(/^\/widget\//, '');

    if (name === breaks && (always || !query)) {
      // Không trả lời gì cả, và cũng không đóng kết nối: đúng thứ làm dây nạp đứng im.
      if (hang) return;
      if (empty) {
        reply.writeHead(200, { 'Content-Type': 'text/javascript' });
        reply.end('');
      } else {
        reply.writeHead(404);
        reply.end();
      }
      return;
    }

    let body = null;
    try {
      body = name === 'zeplao.js' ? Buffer.from(SHIM) : readFileSync(join(widget, name));
    } catch { /* không có thì trả 404 bên dưới */ }

    if (!body) { reply.writeHead(404); reply.end(); return; }
    reply.writeHead(200, { 'Content-Type': TYPES[name.split('.').pop()] ?? 'text/plain' });
    reply.end(body);
  });
}

// ---- một cái trình duyệt, dùng cho cả năm cảnh --------------------------------------------------

const profile = mkdtempSync(join(tmpdir(), 'loader-test-'));
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let leaving = false;
const leave = (code, why) => {
  if (leaving) return;
  leaving = true;
  console[code ? 'error' : 'log'](why);
  try { chrome.kill(); } catch { /* đi rồi thì thôi */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* kệ */ }
  process.exit(code);
};
chrome.on('error', () => leave(2, `không mở được Chrome ở ${CHROME} — đặt biến CHROME`));

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
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
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
const inPage = async (code) => (await call('Runtime.evaluate',
  { expression: code, returnByValue: true })).result?.result?.value;

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
      if (data.method === 'ready') {
        window.postMessage({ zeplao: 'state', state: ${JSON.stringify(STATE)} }, '*');
      }
    });
  `,
});

async function scene(what, fault, expect) {
  const server = serve(fault);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const at = `http://127.0.0.1:${server.address().port}/widget`;

  await call('Page.navigate', { url: 'about:blank' });
  await call('Page.navigate', { url: at });
  // Đủ lâu cho ba lần thử lại cộng đồng hồ chống treo của trang.
  await nap(16_000);

  const calls = (await inPage('window.__calls')) ?? [];
  const drawn = (await inPage(
    `document.body ? document.body.innerText.replace(/\\s+/g, ' ').trim() : ''`)) ?? '';
  // `closeAllConnections` trước, rồi mới đóng.
  //
  // `server.close()` chờ mọi kết nối đóng lại — mà cảnh "treo" thì có đúng một kết nối **không
  // bao giờ đóng**, nên nó ngồi đợi mãi. Cái bộ thử viết ra để bắt lỗi treo mà tự nó treo, ở
  // đúng cái cảnh ấy.
  server.closeAllConnections();
  await new Promise((done) => server.close(done));

  const ok = expect(calls, drawn);
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) console.log(`      gọi về: ${calls.join(' ') || '(không)'}\n      màn hình: ${drawn.slice(0, 90) || '(trắng)'}`);
  return ok;
}

/// Bàn mở ra được: có bắt tay, và có con số trong ví trên màn hình.
const opened = (calls, drawn) => calls.includes('ready') && drawn.includes('50.000');
/// Nói ra được: không mở được thì ít nhất phải có chữ, và phải có tên file hỏng trong đó.
const said = (name) => (calls, drawn) => !calls.includes('ready') && drawn.includes(name);

console.log('vòng nạp của trang, với một file hỏng đặt sẵn:');
const all = [
  await scene('file 404 ở URL gốc thì thử lại bằng khoá cache khác và lành',
    { breaks: 'board.js' }, opened),
  await scene('file không thiết yếu chết hẳn thì bàn vẫn mở',
    { breaks: 'sound.js', always: true }, opened),
  await scene('file sống còn chết hẳn thì hiện chữ, không để trắng',
    { breaks: 'tienlen.js', always: true }, said('tienlen.js')),
  await scene('file trả 200 rỗng — thứ onerror không bao giờ kêu — cũng phải bắt được',
    { breaks: 'tienlen.js', empty: true }, opened),
  await scene('file không bao giờ trả lời thì bỏ lại, xin bằng khoá khác, và bàn vẫn mở',
    { breaks: 'board.js', hang: true }, opened),
];

leave(all.every(Boolean) ? 0 : 1,
  all.every(Boolean) ? '  cả năm cảnh đều không dẫn tới một cái khung trắng im lặng'
    : 'CÓ CẢNH DẪN TỚI KHUNG TRẮNG');
