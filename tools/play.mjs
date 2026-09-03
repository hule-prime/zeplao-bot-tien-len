#!/usr/bin/env node
// The bot and its widget, playable in a browser on this machine.
//
//   node tools/play.mjs [port]        # then open http://localhost:8787
//
// There is no Cúc Cu here. This process is both halves: the bot, unmodified, and a stand-in
// for the app that answers the twelve methods it calls. The widget is served exactly as it
// would be from the bundle, except that `zeplao.js` — which the platform writes in at upload —
// is served from here instead, and reaches this process rather than a phone.
//
// What it is for: seeing a change to the table without a token, a group, or a phone. What it
// is not: a test of the platform. Sessions here are a Map, and the real one enforces things
// this does not.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const widget = join(here, '..', 'bots', 'tienlenbot', 'widget');
const PORT = Number(process.argv[2] ?? 8787);

/**
 * Sổ vàng, ở một chỗ cái máy này ghi được.
 *
 * Mặc định của bot là `/app/data/scores.json` — đường dẫn **bên trong container** cái unit file
 * chạy. Trên máy người viết thì `/app` không tạo được, nên mọi lần ghi đều hỏng và cả cuốn sổ
 * sống trong RAM: mỗi lần khởi động lại là mất sạch vàng, mất cả hai bảng cầu. Nhìn ra thì nó
 * không giống một cái lỗi — nó giống "sao vào sòng mà không thấy ván trước", và người ta đi tìm
 * ở chỗ vẽ.
 *
 * Đặt trước khi `import` con bot, và phải là trước: `SCORES` là một `const` ở thân module, đọc
 * `process.env` đúng một lần lúc nạp file.
 */
process.env.TIENLEN_SCORES ??= join(here, '..', 'data', 'play-scores.json');

const { run } = await import(join(here, '..', 'bots', 'tienlenbot', 'tienlenbot.mjs'));

// ---- the stand-in ---------------------------------------------------------------------------

const updates = [];
let updateNo = 0;

/// Which table each person has open, set by `showSession` the way the app sets it. A push is
/// only delivered to somebody looking at the session it belongs to — without this, opening a
/// second player draws the first player's table over theirs.
const viewing = new Map();
const watchers = new Map();       // userId -> Set of SSE replies
const people = new Map();         // userId -> displayName

/// Who is in which group. Two people, two groups — because the point of a table now is that it
/// is not in one, and a preview with everybody in the same room would prove nothing.
///
/// Enforced below on `showSession`, the way the real server enforces it. Without that here, a
/// preview would happily show two people in different groups playing while production refused
/// it at the first request.
const ROOMS = { c1: ['u1'], c2: ['u2'] };
const roomOf = (userId) =>
  Object.keys(ROOMS).find((room) => ROOMS[room].includes(userId)) ?? 'c1';

/// The last thing each session pushed, kept the way the real platform keeps it.
///
/// Not an optimisation. A bot pushes the table *before* it asks for the frame to be opened —
/// there is no point opening a frame onto nothing — so without somewhere to remember that
/// push, the first one lands before anybody is listening and a board that nothing else happens
/// to sits empty for ever. The real server answers this from `StateFor`, and prefers a
/// person's own state over the shared one, which is what makes a hand survive reopening.
const shared = new Map();                    // sessionId -> state
const privately = new Map();                 // `${sessionId}|${userId}` -> state

const stateFor = (sessionId, userId) =>
  privately.get(`${sessionId}|${userId}`) ?? shared.get(sessionId) ?? null;

function showTo(userId, sessionId) {
  viewing.set(userId, sessionId);
  const state = stateFor(sessionId, userId);
  if (!state) return;
  for (const stream of watchers.get(userId) ?? []) {
    stream.write(`data: ${JSON.stringify(state)}\n\n`);
  }
}

const nap = (ms) => new Promise((done) => setTimeout(done, ms));

function deliver(sessionId, to, state) {
  for (const [userId, streams] of watchers) {
    if (viewing.get(userId) !== sessionId) continue;
    if (to !== null && to !== userId) continue;
    for (const stream of streams) stream.write(`data: ${JSON.stringify(state)}\n\n`);
  }
}

const app = createServer(async (request, reply) => {
  const [path] = request.url.slice(1).split('?');
  let body = '';
  for await (const chunk of request) body += chunk;
  const sent = body ? JSON.parse(body) : {};
  const answer = (value) => {
    reply.writeHead(200, { 'Content-Type': 'application/json' });
    reply.end(JSON.stringify(value));
  };

  switch (path) {
    case 'getMe':
      return answer({ id: 'bot', username: 'tienlen', displayName: 'Tiến Lên' });

    case 'getUpdates': {
      const taking = updates.splice(0);
      if (!taking.length) await nap(20);
      return answer(taking);
    }

    case 'createSession': {
      const id = `s${sessions.size + 1}`;
      sessions.set(id, { id, conversationId: sent.conversationId, live: true });
      return answer({ id });
    }

    case 'setSessionPlayers': {
      const session = sessions.get(sent.sessionId);
      if (session) session.players = sent.userIds ?? [];
      return answer({ id: sent.sessionId });
    }

    case 'showSession': {
      const session = sessions.get(sent.sessionId);
      if (sent.to && !(ROOMS[session?.conversationId] ?? []).includes(sent.to)) {
        reply.writeHead(400, { 'Content-Type': 'application/json' });
        return reply.end(JSON.stringify({ error: 'not_in_conversation' }));
      }
      if (sent.to) showTo(sent.to, sent.sessionId);
      else for (const userId of watchers.keys()) showTo(userId, sent.sessionId);
      return answer({ id: sent.sessionId });
    }

    case 'pushState': {
      if (sent.to) privately.set(`${sent.sessionId}|${sent.to}`, sent.state);
      else shared.set(sent.sessionId, sent.state);
      deliver(sent.sessionId, sent.to ?? null, sent.state);
      return answer({ sent: 1 });
    }

    case 'endSession': {
      const session = sessions.get(sent.sessionId);
      if (session) session.live = false;
      for (const [userId, open] of viewing) if (open === sent.sessionId) viewing.delete(userId);
      return answer({ id: sent.sessionId });
    }

    case 'sendMessage':
      // The room, on the console. There is no thread here to put a line in.
      console.log(`  ${sent.conversationId}: ${sent.text}`);
      return answer({ id: `m${Math.random().toString(36).slice(2, 8)}` });

    default:
      return answer({ ended: 0 });
  }
});

const sessions = new Map();
app.listen(0, '127.0.0.1');
await new Promise((done) => app.once('listening', done));
const api = `http://127.0.0.1:${app.address().port}`;

run('local:play', { api }).catch((problem) => console.error(String(problem)));

// ---- the browser ------------------------------------------------------------------------------

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

/// What the platform writes into every bundle, wearing this process instead of a phone.
///
/// The same seven functions and the same shapes. `send` posts an action and `onState` is an
/// event stream, which is what the real one is too — a socket rather than a poll.
const SHIM = `
(function () {
  var listeners = [];
  var where = new URLSearchParams(location.search);
  var id = where.get('user') || 'u1';
  var name = where.get('name') || (id === 'u1' ? 'Thọ' : 'Lan Anh');

  window.Zeplao = {
    viewer: { id: id, displayName: name, role: 'player' },
    theme: {},
    ready: function () {},
    send: function (action) {
      fetch('/send?user=' + encodeURIComponent(id), {
        method: 'POST',
        body: JSON.stringify(action),
      });
    },
    onState: function (f) { listeners.push(f); },
    setSize: function () {},
    close: function () {
      document.body.innerHTML =
        '<p style="padding:24px;color:#9dbcac;font:13px sans-serif">' +
        'Đã đóng bàn. Tải lại trang để mở bàn mới.</p>';
    },
  };

  // For driving the page from a harness with no bot behind it — a made-up table, to look at a
  // moment that is otherwise a matter of the deal. Only here; the file the platform writes into
  // a real bundle has nothing of the sort, and nothing in the widget looks for it.
  window.__push = function (state) {
    window.__last = state;
    listeners.forEach(function (f) { try { f(state); } catch (e) { console.error(e); } });
  };

  var stream = new EventSource('/events?user=' + encodeURIComponent(id)
    + '&name=' + encodeURIComponent(name));
  stream.onmessage = function (event) {
    var state = JSON.parse(event.data);
    window.__last = state;
    listeners.forEach(function (f) { try { f(state); } catch (e) { console.error(e); } });
  };
})();
`;

/// Two frames at the size a phone gives a widget, so what is on the screen is what is on a
/// phone. Two, and in two different groups, because a table being open to the whole world
/// rather than to one room is the thing most worth being able to see.
const HOME = `<!doctype html><meta charset="utf-8">
<title>tienlenbot — thử tại chỗ</title>
<style>
  body { margin:0; padding:16px; background:#141816; color:#cfe0d6;
         font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; }
  section { display:flex; flex-direction:column; gap:6px; }
  h2 { margin:0; font-size:12px; font-weight:650; color:#8fb3a1; letter-spacing:.3px; }
  /* The bar the app draws above every widget, and the reason it draws it: a page can draw a
     convincing sign-in screen, so something outside it has to say whose page this is. */
  .frame { width:390px; border-radius:14px; overflow:hidden; background:#072318;
           box-shadow:0 10px 30px rgba(0,0,0,.55); }
  .bar { height:34px; display:flex; align-items:center; gap:8px; padding:0 10px;
         background:#0d2c20; color:#cfe0d6; font-size:12px; font-weight:600; }
  .bar .dot { width:16px; height:16px; border-radius:50%; background:#e9c46a; }
  .bar .x { margin-left:auto; opacity:.5; }
  /* The height the widget asks for with z.setSize. The real frame clamps that to something
     that always leaves its own title bar showing; here it is just the number — so it has to be
     kept the same number, or this stand-in is showing a frame no phone would give. */
  iframe { display:block; width:390px; height:570px; border:0; }
  aside { max-width:280px; color:#7f9a8c; font-size:12px; }
  code { color:#e9c46a; }
</style>
<section>
  <h2>Thọ · nhóm A</h2>
  <div class="frame">
    <div class="bar"><span class="dot"></span>Tiến Lên<span class="x">✕</span></div>
    <iframe src="/widget?user=u1&name=Th%E1%BB%8D"></iframe>
  </div>
</section>
<section>
  <h2>Lan Anh · nhóm B</h2>
  <div class="frame">
    <div class="bar"><span class="dot"></span>Tiến Lên<span class="x">✕</span></div>
    <iframe src="/widget?user=u2&name=Lan%20Anh"></iframe>
  </div>
</section>
<aside>
  <p>Hai người ở <b>hai nhóm chat khác nhau</b>. Server giả ở đây từ chối mở phiên cho người
     ngoài phòng, đúng như server thật — nên nếu hai khung chơi được với nhau thì đó là thật.</p>
  <p><b>Đấu với máy:</b> bấm <code>Chơi ngay</code> ở khung trái.</p>
  <p><b>Bàn thế giới:</b> khung trái <code>Mở bàn</code>, rồi khung phải mở tab
     <code>Bàn</code> — bàn của nhóm A hiện ở nhóm B. Bấm <code>Vào</code>. Bàn 2 người tự chia
     bài; 3–4 người thì <code>Thêm máy</code> hoặc <code>Bắt đầu</code>.</p>
  <p><b>Vàng:</b> vào lần đầu được 50.000, mỗi ngày bấm nhận thêm 30.000. Hết vàng thì hiện nút xem quảng cáo.</p>
  <p>Mỗi khung chỉ nhận bài của chính nó — mở tab Network mà xem.</p>
</aside>
`;

const web = createServer(async (request, reply) => {
  const url = new URL(request.url, 'http://localhost');
  const send = (type, text) => {
    reply.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    reply.end(text);
  };

  if (url.pathname === '/') return send('text/html', HOME);
  if (url.pathname === '/zeplao.js') return send('text/javascript', SHIM);

  if (url.pathname === '/send') {
    const userId = url.searchParams.get('user');
    let body = '';
    for await (const chunk of request) body += chunk;
    updates.push({
      id: ++updateNo,
      kind: 'widget_action',
      widgetAction: {
        sessionId: viewing.get(userId),
        conversationId: roomOf(userId),
        from: { userId, displayName: people.get(userId) ?? userId },
        // Filled in by the server from the connection, which is what makes it worth believing.
        role: 'player',
        action: JSON.parse(body || '{}'),
      },
    });
    return send('application/json', '{}');
  }

  if (url.pathname === '/events') {
    const userId = url.searchParams.get('user') ?? 'u1';
    people.set(userId, url.searchParams.get('name') ?? userId);

    reply.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.write(': open\n\n');

    if (!watchers.has(userId)) watchers.set(userId, new Set());
    watchers.get(userId).add(reply);
    request.on('close', () => watchers.get(userId)?.delete(reply));

    // Reloading the page is opening the widget again, and the table is where it was.
    const open = viewing.get(userId);
    if (open) {
      const state = stateFor(open, userId);
      if (state) reply.write(`data: ${JSON.stringify(state)}\n\n`);
    }

    // Asking for a table is what opening the widget means here. In the app somebody says the
    // bot's name in a room; there is no room, so arriving is the asking.
    updates.push({
      id: ++updateNo,
      kind: 'message',
      message: {
        conversationId: roomOf(userId),
        conversationType: 'group',
        from: { userId, displayName: people.get(userId) },
        command: 'tienlen',
        text: '/tienlen',
      },
    });
    return;
  }

  const name = url.pathname === '/widget' ? 'index.html' : url.pathname.slice(1);
  if (/[^\w.-]/.test(name)) { reply.writeHead(404); return reply.end(); }

  try {
    const file = await readFile(join(widget, name));
    return send(TYPES[extname(name)] ?? 'application/octet-stream', file);
  } catch {
    reply.writeHead(404);
    reply.end('not here');
  }
});

web.listen(PORT, () => {
  console.log(`\n  tienlenbot, playable: http://localhost:${PORT}`);
  console.log(`  sổ vàng và cầu: ${process.env.TIENLEN_SCORES}\n`);
});
