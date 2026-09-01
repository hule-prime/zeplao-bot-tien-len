// The bot played end to end against a stand-in for the app.
//
// The rules have their own suite and it deals a thousand hands. This is the other half: the
// part that talks. Sessions, who may act on which screen, which push goes to whom, a table in
// one group filling up with somebody from another — none of it is reachable from a pure
// function, and all of it is where a card game goes wrong in the way that matters.
//
// The stand-in answers the methods this bot calls, writes down everything it was sent, and
// **enforces the one rule the whole session design turns on**: a session may only be opened for
// somebody who is in its conversation. Without that here, a test would happily prove that
// people in different groups can play together while production refused it.
//
// Set before the module is loaded, and loaded by hand for that reason: an `import` at the top
// of a file runs before any statement in it, so a static import would read the pauses from the
// environment as it was — nine hundred milliseconds a move and ten seconds an advertisement,
// which is right in a chat and is minutes of a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';

const LEDGER = '/tmp/tienlen-flow-scores.json';
process.env.TIENLEN_THINK_MS = '1';
process.env.TIENLEN_PHOM_THINK_MS = '1';
process.env.TIENLEN_ADS_MS = '150';
process.env.TIENLEN_ROLL_MS = '60';
process.env.TIENLEN_SHOW_MS = '120';
// Cửa đặt của sòng thế giới, ngắn lại cho vừa một cái test.
//
// Bảy trăm mili giây thì vừa đủ cho tới khi bộ test có thêm mấy nghìn ván máy-đấu-máy chạy
// trước nó: lúc máy bận, hai lệnh đặt cược mất hơn bảy trăm mili giây để tới nơi và cửa đã
// đóng — test đỏ vì cái đồng hồ trong test, không phải vì cái sòng. Một cái test đỏ ngẫu nhiên
// còn tệ hơn không có test, vì lần đỏ nào cũng bị đọc thành "chạy lại phát nữa xem".
process.env.TIENLEN_BETTING_MS = '2500';
process.env.TIENLEN_SCORES = LEDGER;

const {
  run, chooseMove, shapeOf, nameOf, STARTING_GOLD, DAILY_GOLD, BOT_STAKE, ADS_GOLD, dayIn,
  FACES, boardWorth, staked, phomChoose, phomDiscard,
} = await import('./tienlenbot.mjs');

const nap = (ms) => new Promise((done) => setTimeout(done, ms));

/// Everything the app would be, for as long as a game takes.
function standIn(rooms = { c1: ['u1', 'u2'] }) {
  const app = {
    updates: [],
    next: 1,
    pushes: [],
    sessions: new Map(),
    said: [],
    rooms,
    refused: [],        // every showSession the conversation rule turned away
    sessionNo: 0,
  };

  const server = createServer(async (request, reply) => {
    const [path] = request.url.slice(1).split('?');
    let body = '';
    for await (const chunk of request) body += chunk;
    const sent = body ? JSON.parse(body) : {};

    const answer = (value, status = 200) => {
      reply.writeHead(status, { 'Content-Type': 'application/json' });
      reply.end(JSON.stringify(value));
    };

    switch (path) {
      case 'getMe':
        return answer({ id: 'bot', username: 'tienlen', displayName: 'Tiến Lên' });

      case 'getUpdates': {
        // Answered from `offset`, the way the real one is: everything after that id, and the
        // id is also the acknowledgement. Nothing is thrown away — which is the whole point,
        // because a bot that starts again from nought is handed all of it back.
        //
        // A short poll rather than a long one. The bot is written for a server that holds the
        // request open; a stand-in that did the same would make every assertion here wait.
        const from = Number(new URL(request.url, 'http://x').searchParams.get('offset')) || 0;
        const taking = app.updates.filter((one) => one.id > from);
        if (!taking.length) await nap(10);
        return answer(taking);
      }

      case 'createSession': {
        const id = `s${++app.sessionNo}`;
        app.sessions.set(id, { id, conversationId: sent.conversationId, live: true });
        return answer({ id });
      }

      case 'showSession': {
        const session = app.sessions.get(sent.sessionId);
        // The rule the whole design is built round, enforced here so the design is actually
        // tested against it.
        if (sent.to && !(app.rooms[session.conversationId] ?? []).includes(sent.to)) {
          app.refused.push({ sessionId: sent.sessionId, to: sent.to });
          return answer({ error: 'not_in_conversation' }, 400);
        }
        return answer({ id: sent.sessionId });
      }

      case 'pushState':
        app.pushes.push({ sessionId: sent.sessionId, to: sent.to ?? null, state: sent.state });
        return answer({ sent: 1 });

      case 'endSession': {
        const session = app.sessions.get(sent.sessionId);
        if (session) session.live = false;
        return answer({ id: sent.sessionId });
      }

      case 'getConversations':
        return answer(app.rooms ? Object.keys(app.rooms).map((id) => ({ id, type: 'group' })) : []);

      case 'sendMessage':
        app.said.push(sent);
        return answer({ id: `m${app.said.length}` });

      default:
        // setCommands, setMe, endSessions, editMessage, deleteMessage, answerCallback. None of
        // them tell this bot anything it acts on.
        return answer({ ended: 0 });
    }
  });

  server.listen(0, '127.0.0.1');
  app.ready = once(server, 'listening').then(() => {
    app.api = `http://127.0.0.1:${server.address().port}`;
  });
  app.close = () => new Promise((done) => server.close(done));

  /// The last thing this person was sent by name — which, for anybody at a table, is the one
  /// that has their hand in it.
  app.mine = (userId) => {
    for (let i = app.pushes.length - 1; i >= 0; i--) {
      if (app.pushes[i].to === userId) return app.pushes[i].state;
    }
    return null;
  };

  app.say = (update) => { app.updates.push({ id: ++app.next, ...update }); };

  /// Everything the app was ever told, kept — the ring the real server keeps per bot.
  app.replayable = () => app.updates.length;

  app.asks = (userId, conversationId = 'c1') => app.say({
    kind: 'message',
    message: {
      conversationId,
      conversationType: 'group',
      from: { userId, displayName: NAMES[userId] },
      command: 'tienlen',
    },
  });

  /// A widget action, from the screen this person has open.
  app.does = (userId, action) => {
    const session = [...app.sessions.keys()].reverse().find((id) => app.opened[userId] === id);
    app.say({
      kind: 'widget_action',
      widgetAction: {
        sessionId: session,
        conversationId: app.sessions.get(session).conversationId,
        from: { userId, displayName: NAMES[userId] },
        role: 'player',
        action,
      },
    });
  };

  /// Which session belongs to whom, read off the pushes rather than guessed: a push addressed
  /// to somebody is the bot saying which screen is theirs.
  app.opened = new Proxy({}, {
    get: (_, userId) => {
      for (let i = app.pushes.length - 1; i >= 0; i--) {
        if (app.pushes[i].to === userId) return app.pushes[i].sessionId;
      }
      return null;
    },
  });

  /// Waits for the bot to have got somewhere rather than for a length of time.
  /// Chờ tới khi điều kiện đúng, hoặc bỏ cuộc và nói rõ đang chờ cái gì.
  ///
  /// Hai lăm giây chứ không phải tám. Bộ test bây giờ có cả phép đo máy-đấu-máy nặng CPU chạy
  /// trước nó, và một tiến trình đang bận thì cái đồng hồ trong test chạy chậm theo — mấy lần
  /// đỏ ngẫu nhiên vừa rồi đều là *bàn vẫn chạy đúng, chỉ là chậm*. Test chậm thì chấp nhận
  /// được; test đỏ ngẫu nhiên thì không, vì lần đỏ nào cũng bị đọc thành "chạy lại xem".
  app.until = async (what, why) => {
    for (let waited = 0; waited < 25000; waited += 10) {
      if (what()) return;
      await nap(10);
    }

    // Hết giờ thì nói ra đang thấy gì.
    //
    // "gave up waiting: the table to deal itself" một mình nó không nói được gì cả, và một dòng
    // như thế mỗi vài lần chạy thì lần nào cũng bị đọc thành "chắc lại chập chờn" — đó là cách
    // một lỗi thật sống sót qua hai chục lần chạy. Nên nó kể ra: ai đang ở đâu, đã nhận bao
    // nhiêu push, và cái push cuối cùng nói gì.
    // `app.opened` là Proxy nên `Object.keys` trả về rỗng — lấy danh sách người từ chính các
    // phòng đã dựng.
    const people = [...new Set(Object.values(app.rooms ?? {}).flat())];
    const seen = people.map((id) => {
      const mine = app.mine(id) ?? {};
      const to = app.pushes.filter((one) => one.to === id).length;
      return `${id}: pha=${mine.phase ?? '(chưa có state)'} bàn=${mine.gameId ?? '-'}`
        + ` ghế=${(mine.seats ?? []).length} lượt=${mine.turn ?? '-'}`
        + ` phiên=${app.opened[id]} còn sống=${(app.sessions.get(app.opened[id]) ?? {}).live}`
        + ` push riêng=${to}`;
    });
    const last = app.pushes.slice(-5).map((one) =>
      `${one.sessionId}${one.to ? `→${one.to}` : ' (chung)'} pha=${one.state.phase}`
      + ` ghế=${(one.state.seats ?? []).length}`);
    assert.fail(`gave up waiting: ${why}\n  ${seen.join('\n  ')}\n`
      + `  phiên: ${[...app.sessions.values()].map((one) =>
        `${one.id}@${one.conversationId}${one.live ? '' : ' (đã đóng)'}`).join(' ')}\n`
      + `  update đã gửi: ${app.updates.length}\n`
      + `  push cuối:\n    ${last.join('\n    ')}\n`
      + `  tổng push: ${app.pushes.length} · bị từ chối: ${app.refused.length}`);
  };

  return app;
}

const NAMES = { u1: 'Thọ', u2: 'Lan Anh', u3: 'Minh', u9: 'Người lạ' };

/// A board is sent whole and stamped, so a send overtaken by a later one is ignored. Each
/// stand-in person keeps their own count.
const clocks = { u1: 0, u2: 0, u3: 0, u9: 0 };

/// The ledger this run starts from. Written before the bot is started, because it is read once
/// on the way up.
function ledger(people = {}) {
  // Rows are stamped as having had their starting purse unless a test says otherwise, so a
  // crafted balance stays the balance it was crafted to be.
  for (const row of Object.values(people)) {
    if (row.started === undefined) row.started = true;
  }
  // `offset` too, and explicitly. It is how far through the updates the last run got, and a
  // leftover from the test before would make this bot ignore everything this one says.
  writeFileSync(LEDGER, JSON.stringify({ people, offset: 0 }));
}

async function withBot(work, rooms) {
  const app = standIn(rooms);
  await app.ready;

  const stopping = new AbortController();
  const running = run('a1b2c3d4e5f6:test', { signal: stopping.signal, api: app.api });

  try {
    await work(app);
  } finally {
    stopping.abort();
    await running.catch(() => {});
    await app.close();
  }
}

/// Takes the day's gold, the way somebody opening the game does.
async function claim(app, userId) {
  if (!app.mine(userId).daily) return;
  const had = app.mine(userId).gold;
  app.does(userId, { daily: true });
  await app.until(() => app.mine(userId).gold > had, `the day's gold for ${userId}`);
}

/// Answers for whichever of these people is on the move. False when none of them is.
async function oneMove(app, who) {
  const turn = who.find((id) => {
    const seen = app.mine(id);
    return seen && seen.phase === 'playing' && seen.me
      && seen.me.hand.length && seen.turn === seen.me.seat;
  });
  if (!turn) { await nap(15); return false; }

  const now = app.mine(turn);
  const cards = chooseMove(now.me.hand, now.pile ? shapeOf(now.pile.cards) : null, {
    lowest: 13,
    mustInclude: now.opensWith ?? null,
  });

  // Everything a move could change. Not just whose turn it is: passing last in a round leaves
  // the turn where it was and clears the table instead, which is winning the round.
  const was = JSON.stringify([now.turn, now.pile, now.me.hand.length, now.phase]);
  app.does(turn, cards ? { play: cards } : { pass: true });

  // Chờ có hạn, và hết hạn thì **thử lại** chứ không đỏ.
  //
  // Nước đi được tính từ cái state đọc được lúc ấy, mà giữa lúc đọc và lúc gửi thì bàn có thể đã
  // nhích: lá bắt buộc của nước mở ván biến mất khỏi state một nhịp trước khi bot thôi bắt buộc
  // nó, và nước gửi lên bị từ chối. Không có gì đổi, nên cái chờ ngồi trọn hai lăm giây rồi mới
  // đỏ — mà đỏ vì cái test đọc hụt một nhịp, không phải vì cái bàn hỏng. Vòng ngoài `playOut`
  // vẫn có trần bốn trăm nước, nên một cái bàn treo thật thì vẫn đỏ.
  for (let waited = 0; waited < 3000; waited += 10) {
    const after = app.mine(turn);
    if (JSON.stringify([after.turn, after.pile, after.me.hand.length, after.phase]) !== was) {
      return true;
    }
    await nap(10);
  }
  return false;
}

/// Plays a table out, answering for all of these people until none of them is at it any more.
/**
 * Chờ bàn chia xong — và chia lại nếu ván vừa rồi tới trắng.
 *
 * Đây là con ma làm bộ test đỏ ngẫu nhiên khoảng một lần trong tám, suốt cả buổi. Không phải
 * lỗi: một tay bài tới trắng thì ván **kết thúc ngay khi chia**, nên `phase` nhảy thẳng sang
 * `over` và cái chờ `playing` ngồi tới hết giờ. Ở bàn hai người, mười ba lá mỗi tay, chuyện ấy
 * xảy ra đủ thường xuyên để gặp.
 *
 * Cái máy đo ở chỗ chờ là thứ chỉ ra được — nó in `pha=over` ngay dòng đầu.
 */
async function dealt(app, who) {
  for (let tries = 0; tries < 20; tries++) {
    await app.until(() => who.every((id) => ['playing', 'over'].includes(app.mine(id).phase)),
      'the table to deal');
    if (who.every((id) => app.mine(id).phase === 'playing')) return;

    // Tới trắng: ván xong trước khi ai kịp đánh. Xin ván khác.
    for (const id of who) app.does(id, { rematch: true });
    await nap(60);
  }
  assert.fail('the table kept dealing tới trắng');
}

async function playOut(app, who) {
  for (let move = 0; move < 400; move++) {
    // Somebody who went back to the lobby is not waiting for anything, so "over" is not the
    // only way to be finished with a table.
    const stillAt = who.filter((id) => (app.mine(id) ?? {}).phase === 'playing');
    if (!stillAt.length) return;
    await oneMove(app, who);
  }
  assert.fail('the table never finished');
}

// ---- the ordinary thing ------------------------------------------------------------------------

test('a table against three machines is dealt, played, placed and paid', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');

    const lobby = app.mine('u1');
    assert.equal(lobby.phase, 'choosing');
    assert.equal(lobby.gold, STARTING_GOLD, 'a purse to start with');
    assert.equal(lobby.daily, DAILY_GOLD, 'and the day\'s gold on top of it, to be taken');

    app.does('u1', { daily: true });
    await app.until(() => app.mine('u1').gold === STARTING_GOLD + DAILY_GOLD, 'the day\'s gold');
    assert.equal(app.mine('u1').daily, 0, 'and is not there to be taken twice');

    app.does('u1', { solo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a hand');

    const dealt = app.mine('u1');
    assert.equal(dealt.seats.length, 4);
    assert.equal(dealt.seats.filter((one) => one.bot).length, 3);
    assert.equal(dealt.me.hand.length, 13);
    assert.equal(dealt.stake, BOT_STAKE, 'the house\'s stake, not a room\'s');

    await playOut(app, ['u1']);

    const over = app.mine('u1');
    assert.equal(over.ranking.length, 4, 'everybody gets a place');
    assert.equal(over.ranking[0].place, 'Nhất');
    assert.equal(over.ranking[3].place, 'Bét');

    assert.equal(over.paid.length, 1, 'the machines are furniture and are not paid');
    const paid = over.paid[0];
    assert.equal(paid.userId, 'u1');
    assert.ok([BOT_STAKE, BOT_STAKE / 2, -BOT_STAKE / 2, -BOT_STAKE].includes(paid.change),
      `paid ${paid.change}`);
    assert.equal(over.gold, STARTING_GOLD + DAILY_GOLD + paid.change,
      'and the ledger says the same');
  });
});

test('nothing sent to the room ever carries a hand', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { solo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a hand');

    // Let the machines answer each other, so there are plenty of pushes to look through.
    await nap(300);

    for (const push of app.pushes) {
      if (push.to === null) {
        assert.equal(push.state.me, undefined, 'a push to everybody carried somebody\'s hand');
        for (const seat of push.state.seats ?? []) {
          assert.ok(typeof seat.cards === 'number' || seat.cards === null,
            'a seat in the table everybody sees should carry a count, not cards');
        }
      } else {
        assert.equal(push.to, 'u1', 'a hand went to somebody who is not at the table');
      }
    }

    assert.ok(app.pushes.some((push) => push.to === 'u1' && push.state.me?.hand.length),
      'and one of them did carry a hand, or this test proves nothing');
  });
});

// ---- the world -----------------------------------------------------------------------------------

test('two people in different groups sit at the same table', async () => {
  // The point of one session per person. A session belongs to a conversation and cannot be
  // opened for anybody outside it — the stand-in enforces that above — so a table with a
  // session of its own could only ever be played by the room it was opened in.
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen in c1');
    await claim(app, 'u1');
    app.asks('u2', 'c2');
    await app.until(() => app.mine('u2'), 'a screen in c2');
    await claim(app, 'u2');

    assert.notEqual(app.opened.u1, app.opened.u2, 'two screens, not one shared table');
    assert.equal(app.sessions.get(app.opened.u1).conversationId, 'c1');
    assert.equal(app.sessions.get(app.opened.u2).conversationId, 'c2');

    app.does('u1', { open: 2, stake: 1000 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'lobby', 'a table for two');

    assert.equal(app.said.length, 1, 'one line, in the room it was opened from');
    assert.equal(app.said[0].conversationId, 'c1');

    // And somebody in a different group finds it, because the list is everybody's.
    await app.until(() => (app.mine('u2').rooms ?? []).length === 1, 'the table on u2\'s list');
    const there = app.mine('u2').rooms[0];
    assert.equal(there.stake, 1000);
    assert.deepEqual(there.names, ['Thọ']);

    app.does('u2', { join: there.id });
    await dealt(app, ['u1', 'u2']);

    const started = app.mine('u2');
    assert.deepEqual(started.seats.map((one) => one.name).sort(), ['Lan Anh', 'Thọ']);
    assert.ok(started.seats.every((one) => !one.bot), 'no machine at a table two people filled');
    assert.equal(started.me.hand.length, 13);

    assert.deepEqual(app.refused, [],
      'nothing was ever shown to somebody outside its own conversation');

    // Each of them was sent their own thirteen, and they are not the same thirteen.
    const hands = ['u1', 'u2'].map((id) => app.mine(id).me.hand);
    assert.equal(hands[0].filter((card) => hands[1].includes(card)).length, 0,
      'the same card was dealt to both of them');

    await playOut(app, ['u1', 'u2']);

    const over = app.mine('u1');
    assert.equal(over.paid.length, 2);
    // A stake for coming first. `change` on top of that carries thối — whatever the loser was
    // still holding — so the part that is about the placing is read on its own.
    assert.deepEqual(over.paid.map((one) => one.placing).sort((a, b) => a - b), [-1000, 1000],
      'a stake, one way');
    assert.equal(over.paid.reduce((sum, one) => sum + one.change, 0), 0,
      'what one of them won is what the other lost, thối and all');
  }, { c1: ['u1'], c2: ['u2'] });
});

test('a stake has to be in hand before sitting down, and again for a rematch', async () => {
  ledger({ u2: { name: 'Lan Anh', gold: 400, games: 1, first: 0, last: 1, day: dayIn(), ads: 0 } });
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'u1');
    await claim(app, 'u1');
    app.asks('u2', 'c2');
    await app.until(() => app.mine('u2'), 'u2');
    assert.equal(app.mine('u2').gold, 400, 'no bonus twice in a day');

    app.does('u1', { open: 2, stake: 1000 });
    await app.until(() => (app.mine('u2').rooms ?? []).length === 1, 'the table');

    app.does('u2', { join: app.mine('u2').rooms[0].id });
    await app.until(() => !!app.mine('u2').says, 'a refusal');

    assert.match(app.mine('u2').says, /1\.000/);
    assert.equal(app.mine('u2').phase, 'choosing', 'and they are still where they were');
    assert.equal(app.mine('u1').seats.length, 1, 'and the seat is still free');
  }, { c1: ['u1'], c2: ['u2'] });
});

// ---- the advertisement -----------------------------------------------------------------------------

test('the advertisement pays after ten seconds, and the ten seconds are counted here', async () => {
  // The page draws the clock; this decides whether it ran. A countdown a widget runs is a
  // countdown a widget can skip, because a widget is a file anybody can edit.
  ledger({ u1: { name: 'Thọ', gold: 0, games: 4, first: 0, last: 4, day: dayIn(), ads: 0 } });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');

    assert.equal(app.mine('u1').gold, 0);
    assert.equal(app.mine('u1').broke, true, 'and it says so, which is what shows the button');

    app.does('u1', { ads: 'start' });
    await app.until(() => !!app.mine('u1').adsEndsAt, 'the advertisement to start');

    // Straight away, the way an edited page would ask.
    app.does('u1', { ads: 'claim' });
    await nap(120);
    assert.equal(app.mine('u1').gold, 0, 'claiming early pays nothing');

    await nap(200);
    app.does('u1', { ads: 'claim' });
    await app.until(() => app.mine('u1').gold === ADS_GOLD, 'the gold');

    assert.equal(app.mine('u1').adsEndsAt, null, 'and the advertisement is over');
    assert.equal(app.mine('u1').broke, false, 'and there is a table to sit at again');
  });
});

test('an advertisement is there at any balance, and only the daily count stops it', async () => {
  // It used to be refused to anybody who could still afford a table, which made the `+` beside
  // the purse a button that worked or did nothing depending on a number.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');

    const rich = app.mine('u1');
    assert.equal(rich.broke, false, 'plenty of gold');
    assert.ok(rich.adsLeft > 0);

    app.does('u1', { ads: 'start' });
    await app.until(() => !!app.mine('u1').adsEndsAt, 'the advertisement to start anyway');

    await nap(250);
    app.does('u1', { ads: 'claim' });
    await app.until(() => app.mine('u1').gold === rich.gold + ADS_GOLD, 'the gold');
    assert.equal(app.mine('u1').adsLeft, rich.adsLeft - 1, 'and one fewer left today');
  });
});

test('and it stops when the day\'s are used up', async () => {
  ledger({
    u1: {
      name: 'Thọ', gold: 40_000, games: 3, first: 2, last: 0,
      claimed: dayIn(), adsDay: dayIn(), ads: 1000,
    },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    assert.equal(app.mine('u1').adsLeft, 0, 'which is what takes the + away');

    app.does('u1', { ads: 'start' });
    await nap(200);
    assert.equal(app.mine('u1').adsEndsAt, null);
  });
});

// ---- whose screen is whose ---------------------------------------------------------------------------

test('somebody who is only watching cannot play a card', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { solo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a hand');

    const playing = app.mine('u1');

    // The whole of the attack: a stranger, the cards they can see if they open the widget from
    // the room's list of live sessions, and a session the server will happily call them a
    // player of — because every session here has exactly one player.
    app.say({
      kind: 'widget_action',
      widgetAction: {
        sessionId: app.opened.u1,
        conversationId: 'c1',
        from: { userId: 'u9', displayName: 'Người lạ' },
        role: 'player',
        action: { play: playing.me.hand.slice(0, 1) },
      },
    });
    await nap(150);

    assert.equal(app.mine('u1').me.hand.length, playing.me.hand.length,
      'somebody else\'s screen moved a hand');
  });
});

test('the leaderboard is the world, counted in gold', async () => {
  ledger({
    u1: { name: 'Thọ', gold: 40_000, games: 9, first: 5, last: 1, day: dayIn(), ads: 0 },
    u2: { name: 'Lan Anh', gold: 90_000, games: 3, first: 3, last: 0, day: dayIn(), ads: 0 },
    u3: { name: 'Minh', gold: 0, games: 0, first: 0, last: 0, day: dayIn(), ads: 0 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');

    const board = app.mine('u1').table;
    assert.deepEqual(board.map((one) => one.name), ['Lan Anh', 'Thọ'],
      'most gold first, and nobody who has not played');
    assert.equal(board[0].gold, 90_000);
    assert.equal(app.mine('u1').worldTable, undefined, 'there is only the world now');
  });
});

test('one person is one purse, whichever group they walk into', async () => {
  // Said in as many words. A ledger keyed by anything but the person — the room, the screen,
  // the session — would give somebody a different pile of gold in every group they are in, and
  // the one they were looking at would always be the one that was wrong.
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen in c1');
    await claim(app, 'u1');
    const first = app.opened.u1;

    // A hand against the machines, so the gold has actually moved.
    app.does('u1', { solo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a hand');
    await playOut(app, ['u1']);
    const after = app.mine('u1').gold;
    assert.notEqual(after, STARTING_GOLD + DAILY_GOLD,
      'the table should have paid or charged something');

    // The same person, saying the bot's name in a completely different group.
    app.asks('u1', 'c2');
    await app.until(() => app.opened.u1 !== first, 'a screen in c2');

    assert.equal(app.mine('u1').gold, after, 'the purse followed the person, not the room');
    assert.equal(app.sessions.get(app.opened.u1).conversationId, 'c2');
    assert.equal(app.sessions.get(first).live, false,
      'and the screen they left behind is closed rather than left open in the old room');

    // The day is not given twice for walking into a second group either — which the equality
    // above already proves, since a second day's gold would have moved the number.
    assert.equal(app.mine('u1').gold, after);
  }, { c1: ['u1'], c2: ['u1'] });
});

test('and the table they were at comes with them', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { solo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a hand');

    const hand = app.mine('u1').me.hand.length;
    app.asks('u1', 'c2');
    await app.until(() => app.mine('u1').phase === 'playing'
      && app.sessions.get(app.opened.u1).conversationId === 'c2', 'the table, in the new room');

    assert.equal(app.mine('u1').me.hand.length, hand,
      'walking into another group should not cost somebody the hand they were holding');
  }, { c1: ['u1'], c2: ['u1'] });
});

test('coming first is paid at once, and leaving after it is not walking out', async () => {
  // The complaint this is for: somebody who went out first had to sit through however long the
  // other two took, and the only button on the screen forfeited the hand they had just won.
  ledger();
  await withBot(async (app) => {
    for (const [id, room] of [['u1', 'c1'], ['u2', 'c2'], ['u3', 'c3']]) {
      app.asks(id, room);
      await app.until(() => app.mine(id), `a screen for ${id}`);
      await claim(app, id);
    }

    app.does('u1', { open: 3, stake: 1000 });
    await app.until(() => (app.mine('u2').rooms ?? []).length === 1, 'the table on the list');
    const table = app.mine('u2').rooms[0].id;

    app.does('u2', { join: table });
    await app.until(() => (app.mine('u2') ?? {}).phase === 'lobby', 'u2 seated');
    app.does('u3', { join: table });
    await dealt(app, ['u1', 'u2', 'u3']);

    // Play until somebody is out of cards with the table still going. At three seats that is
    // the first two people to finish, so it always happens.
    let first = null;
    for (let move = 0; move < 400 && !first; move++) {
      first = ['u1', 'u2', 'u3'].find((id) => {
        const seen = app.mine(id);
        return seen.phase === 'playing' && seen.me && seen.me.hand.length === 0;
      });
      if (!first) await oneMove(app, ['u1', 'u2', 'u3']);
    }
    assert.ok(first, 'somebody should have gone out before the table finished');

    const won = app.mine(first);
    const paid = (won.paid ?? []).find((one) => one.userId === first);
    assert.ok(paid, 'paid at the moment of going out, not at the end of the table');
    assert.equal(paid.place, 'Nhất');
    assert.equal(paid.change, 1000, 'a stake, off whoever comes last');
    assert.equal(won.gold, STARTING_GOLD + DAILY_GOLD + 1000, 'and the purse already says so');

    // And now they can put it down. This is not forfeiting.
    app.does(first, { leave: true });
    await app.until(() => app.mine(first).phase === 'choosing', 'back to the lobby');
    assert.equal(app.mine(first).gold, STARTING_GOLD + DAILY_GOLD + 1000,
      'and are not charged for leaving');

    // The other two play it out, and the place stands.
    const rest = ['u1', 'u2', 'u3'].filter((id) => id !== first);
    await playOut(app, rest);

    const over = app.mine(rest[0]);
    assert.equal(over.phase, 'over');
    assert.equal(over.ranking[0].id, first, 'whoever went out first is still first');
    // The placing money on its own: `change` also carries whatever thối the other two were
    // still holding, which is theirs to lose and first place's to collect.
    assert.equal(over.paid.find((one) => one.userId === first).placing, 1000);
    assert.equal(over.seats.find((one) => one.id === first).gone, false,
      'and is not drawn as somebody who walked out');

    // Nobody was paid twice, and the gold still adds to nothing.
    const moved = over.paid.reduce((sum, one) => sum + one.change, 0);
    assert.equal(moved, 0, `the table made ${moved} gold out of nothing`);
  }, { c1: ['u1'], c2: ['u2'], c3: ['u3'] });
});

test('the day\'s gold is taken rather than given, and only once a day', async () => {
  // Gold that arrives on the way in is gold nobody remembers arriving. It waits on the first
  // screen with a button on it, and the button is the point.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');

    assert.equal(app.mine('u1').gold, STARTING_GOLD, 'opening the widget pays nothing extra');
    assert.equal(app.mine('u1').daily, DAILY_GOLD, 'the day\'s gold is waiting to be taken');

    app.does('u1', { daily: true });
    await app.until(() => app.mine('u1').gold === STARTING_GOLD + DAILY_GOLD, 'the gold');
    assert.equal(app.mine('u1').daily, 0);

    // Pressed again, the way a button pressed twice before the first push lands is pressed.
    app.does('u1', { daily: true });
    app.does('u1', { daily: true });
    await nap(200);
    assert.equal(app.mine('u1').gold, STARTING_GOLD + DAILY_GOLD,
      'and not once more for pressing again');

    // And it is still gone after walking into another group, because it belongs to the person.
    app.asks('u1', 'c2');
    await app.until(() => app.sessions.get(app.opened.u1).conversationId === 'c2', 'a screen in c2');
    assert.equal(app.mine('u1').daily, 0);
    assert.equal(app.mine('u1').gold, STARTING_GOLD + DAILY_GOLD);
  }, { c1: ['u1'], c2: ['u1'] });
});

test('somebody who took it yesterday is offered it again today', async () => {
  ledger({
    u1: { name: 'Thọ', gold: 300, games: 2, first: 0, last: 2, claimed: '2020-01-01', adsDay: '', ads: 0 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');

    assert.equal(app.mine('u1').daily, DAILY_GOLD);
    // And it is the better of the two offers, so the advertisement waits its turn.
    assert.equal(app.mine('u1').broke, true, 'three hundred is not a table');

    app.does('u1', { daily: true });
    await app.until(() => app.mine('u1').gold === 300 + DAILY_GOLD, 'the gold');
    assert.equal(app.mine('u1').broke, false);
  });
});

test('a row written before the reward was a button still works', async () => {
  // The old shape had one field doing two jobs: the day the gold was given, and the day the
  // advertisements were counted from. Rows in the file predate the split.
  ledger({
    u1: { name: 'Thọ', gold: 5000, games: 3, first: 1, last: 1, day: dayIn(), ads: 4 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');

    assert.equal(app.mine('u1').gold, 5000, 'and nobody is paid twice by the migration');
    assert.equal(app.mine('u1').daily, 0, 'today\'s was already taken under the old name');
    assert.equal(app.mine('u1').adsLeft, 996, 'and the four they had watched still count');
  });
});

test('a restart carries on rather than replaying everything anybody ever said', async () => {
  // What this is for, exactly as it happened on the first deploy anybody was using: seven
  // `opening for thuongd` in a row and four `answerCallback answered 404`. `offset` is both the
  // question and the acknowledgement and there is no other one, so a bot starting again from
  // nought is handed the whole ring back — every `/tienlen` said that hour replayed, every
  // button pressed answered long after its id had expired. From the room's side that is a
  // widget opening itself on your screen because somebody deployed.
  ledger();
  const app = standIn();
  await app.ready;

  const first = new AbortController();
  const running = run('a1b2c3d4e5f6:test', { signal: first.signal, api: app.api });

  app.asks('u1');
  await app.until(() => app.mine('u1'), 'a screen');
  app.does('u1', { daily: true });
  await app.until(() => app.mine('u1').gold === STARTING_GOLD + DAILY_GOLD, 'the day\'s gold');

  const said = app.replayable();
  assert.ok(said >= 2, 'the ring should be holding what was said');
  const sessionsMade = app.sessions.size;
  const pushesBefore = app.pushes.length;

  first.abort();
  await running.catch(() => {});

  // Up again, on the same ledger, with everything still sitting in the ring.
  const second = new AbortController();
  const again = run('a1b2c3d4e5f6:test', { signal: second.signal, api: app.api });
  try {
    await nap(400);
    assert.equal(app.replayable(), said, 'nothing new was said in between');
    assert.equal(app.sessions.size, sessionsMade,
      'and nothing was opened again — a deploy should not put a widget on somebody\'s screen');

    // The one thing that should have happened is the sweep of sessions left by the dead run.
    assert.ok(app.pushes.length >= pushesBefore);

    // And it still works: a new thing said is still heard.
    app.asks('u1');
    await app.until(() => app.sessions.size > sessionsMade, 'a screen when actually asked for');
  } finally {
    second.abort();
    await again.catch(() => {});
    await app.close();
  }
});

test('it says hello once, and not again because somebody deployed', async () => {
  // `bot_added` sits in the ring like everything else, so anything that replays the ring says
  // hello again — which for a while was every deploy, in every room this bot was in. Being
  // greeted by a program you added last week because somebody pushed a fix is worse than never
  // being greeted at all.
  ledger();
  await withBot(async (app) => {
    app.say({
      kind: 'bot_added',
      membership: { conversationId: 'c9', title: 'Nhóm mới', by: { userId: 'u1' } },
    });
    await app.until(() => app.said.length === 1, 'a hello');
    assert.match(app.said[0].text, /Chào cả nhà/);
    assert.equal(app.said[0].conversationId, 'c9');

    // The same update again, which is what a replay is.
    app.say({
      kind: 'bot_added',
      membership: { conversationId: 'c9', title: 'Nhóm mới', by: { userId: 'u1' } },
    });
    await nap(250);
    assert.equal(app.said.length, 1, 'it said hello twice');

    // Taken out and put back is really arriving, so that one counts.
    app.say({ kind: 'bot_removed', membership: { conversationId: 'c9' } });
    await nap(150);
    app.say({
      kind: 'bot_added',
      membership: { conversationId: 'c9', title: 'Nhóm mới', by: { userId: 'u1' } },
    });
    await app.until(() => app.said.length === 2, 'a hello on being put back');
  }, {});
});

test('and never to a room it was already in when it started', async () => {
  // The rooms it joined before anybody wrote down that it had said hello. Losing the ledger
  // must not mean greeting four rooms full of people all over again.
  ledger();
  await withBot(async (app) => {
    app.say({
      kind: 'bot_added',
      membership: { conversationId: 'c1', title: 'Nhóm cũ', by: { userId: 'u1' } },
    });
    await nap(300);
    assert.equal(app.said.length, 0,
      'c1 is a room it is already in, so there is no hello owed');
  }, { c1: ['u1'] });
});

test('somebody who was already playing is given the same start, once', async () => {
  // Asked for in as many words: the people who were here before there was a starting purse get
  // it too. Once — the mark is what makes running this on every load safe, and a bot restarts
  // more often than anybody thinks.
  ledger({
    u1: { name: 'Thọ', gold: 3000, games: 4, first: 0, last: 4, claimed: dayIn(), adsDay: dayIn(), ads: 0, started: false },
    u2: { name: 'Lan Anh', gold: 11000, games: 1, first: 1, last: 0, claimed: dayIn(), adsDay: dayIn(), ads: 0, started: false },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    assert.equal(app.mine('u1').gold, 3000 + STARTING_GOLD);

    // Everybody, not only whoever happened to open it — the top-up runs on the way up.
    const board = app.mine('u1').table;
    assert.equal(board.find((one) => one.name === 'Lan Anh').gold, 11000 + STARTING_GOLD);

    // And nothing owed on the second look.
    const had = app.mine('u1').gold;
    app.asks('u1');
    await nap(250);
    assert.equal(app.mine('u1').gold, had, 'given twice');
  });
});

test('and a row that already had one is left alone', async () => {
  ledger({ u1: { name: 'Thọ', gold: 500, games: 2, first: 0, last: 2, claimed: dayIn(), adsDay: dayIn(), ads: 0 } });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    assert.equal(app.mine('u1').gold, 500);
  });
});

// ---- bầu cua tôm cá ------------------------------------------------------------------------

/// Waits for the throw to come round to a board anybody can bet on again.
const betting = (app, id) => app.until(
  () => (app.mine(id) ?? {}).phase === 'betting', `${id} a board to bet on`);

test('one sòng for the whole world, already throwing when anybody walks in', async () => {
  // Not a table anybody opens. It exists, it keeps going, and walking in is walking in on a
  // game already running — two people in two groups at the same bowl.
  ledger();
  await withBot(async (app) => {
    for (const [id, room] of [['u1', 'c1'], ['u2', 'c2']]) {
      app.asks(id, room);
      await app.until(() => app.mine(id), `a screen for ${id}`);
      await claim(app, id);
    }

    app.does('u1', { baucua: 'world' });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'baucua', 'the sòng');
    assert.equal(app.mine('u1').world, true, 'and it says which one it is');
    // Chờ chứ không đoán. Cái push đầu tiên ra khỏi bot trước khi vòng xóc kịp mở cửa đặt, nên
    // đọc ngay lúc ấy thì thỉnh thoảng thấy một cái bàn chưa có đồng hồ — và một cái test đỏ
    // ngẫu nhiên là một cái test không ai đọc nữa.
    await app.until(() => (app.mine('u1') ?? {}).bettingEndsAt, 'a clock, with nobody else there');

    // Nobody opened anything, so there is nothing on anybody's list to join.
    assert.deepEqual(app.mine('u2').rooms ?? [], []);

    app.does('u2', { baucua: 'world' });
    await app.until(() => (app.mine('u2') ?? {}).kind === 'baucua', 'u2 at the same bowl');
    assert.equal(app.mine('u1').gameId, app.mine('u2').gameId, 'one sòng, not two');
    await app.until(() => (app.mine('u1').seats ?? []).length === 2, 'both of them in the chairs');

    const purse = { u1: app.mine('u1').gold, u2: app.mine('u2').gold };
    app.does('u1', { bets: { cua: 1000 }, at: ++clocks.u1 });
    app.does('u2', { bets: { ga: 5000 }, at: ++clocks.u2 });
    await app.until(() => app.mine('u1').me.staked === 1000 && app.mine('u2').me.staked === 5000,
      'the board to fill up');

    const bets = { u1: { ...app.mine('u1').me.bets }, u2: { ...app.mine('u2').me.bets } };

    // Nobody presses anything. The clock throws it.
    await app.until(() => (app.mine('u1') ?? {}).phase === 'paid', 'the clock to throw');

    const over = app.mine('u1');
    assert.equal(over.dice.length, 3);
    for (const id of ['u1', 'u2']) {
      const owed = boardWorth(bets[id], over.dice);
      assert.equal(app.mine(id).gold, purse[id] + owed, `${id}'s purse`);
    }

    // And it comes round again on its own.
    await app.until(() => (app.mine('u1') ?? {}).phase === 'betting', 'the next window');
    assert.equal(app.mine('u1').me.staked, 0);
    assert.ok(app.mine('u1').bettingEndsAt, 'with a clock on it');
  }, { c1: ['u1'], c2: ['u2'] });
});

test('it throws with an empty board rather than waiting to be started', async () => {
  // Somebody walking in should find a game going, not a bowl sitting still waiting for them.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    const purse = app.mine('u1').gold;

    app.does('u1', { baucua: 'world' });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'baucua', 'the sòng');

    await app.until(() => (app.mine('u1') ?? {}).phase === 'paid', 'a throw with nothing on it');
    assert.equal(app.mine('u1').dice.length, 3);
    assert.deepEqual(app.mine('u1').paid, [], 'and nobody was paid for it');
    assert.equal(app.mine('u1').gold, purse, 'and nothing moved');
  });
});

test('money left on the board is still money on the board', async () => {
  // Somebody who bets and then closes the widget has still bet. The dice do not care who is
  // watching, and the chair going back is not the chips coming back.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    const purse = app.mine('u1').gold;

    app.does('u1', { baucua: 'world' });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'baucua', 'the sòng');
    app.does('u1', { bets: { ca: 1000 }, at: ++clocks.u1 });
    await app.until(() => app.mine('u1').me.staked === 1000, 'a chip down');
    const bets = { ...app.mine('u1').me.bets };

    app.does('u1', { leave: true });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'choosing', 'back at the lobby');

    // The throw happens anyway and settles what was left on it.
    await app.until(() => app.mine('u1').gold !== purse, 'the throw to settle');
    const moved = app.mine('u1').gold - purse;
    // Whatever came up, a thousand on one face is worth one of exactly four things.
    assert.ok([-1000, 1000, 2000, 3000].includes(moved),
      `settled for ${moved}, which is not what a thousand on one face is worth`);
    assert.equal(staked(bets), 1000);
  });
});

test('a stake bigger than the purse is refused, and the last chip can be taken back', async () => {
  ledger({ u1: { name: 'Thọ', gold: 6000, games: 1, first: 0, last: 1, claimed: dayIn(), adsDay: dayIn(), ads: 0 } });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    app.does('u1', { baucua: 'solo' });
    await betting(app, 'u1');

    app.does('u1', { bets: { ca: 5000 }, at: ++clocks.u1 });
    await app.until(() => app.mine('u1').me.staked === 5000, 'the first chip');

    // Six thousand in the purse and a board asking for ten.
    app.does('u1', { bets: { ca: 5000, nai: 5000 }, at: ++clocks.u1 });
    await app.until(() => !!app.mine('u1').says, 'a refusal');
    assert.match(app.mine('u1').says, /6\.000/);
    assert.equal(app.mine('u1').me.staked, 5000, 'and the board it had is the board it keeps');

    app.does('u1', { bets: { ca: 5000, nai: 1000 }, at: ++clocks.u1 });
    await app.until(() => app.mine('u1').me.staked === 6000, 'the rest of it');

    // Taking a chip back is a smaller board, and a board is all the bot is ever told.
    app.does('u1', { bets: { ca: 5000 }, at: ++clocks.u1 });
    await app.until(() => app.mine('u1').me.staked === 5000, 'the last chip back');
    assert.equal(app.mine('u1').me.bets.nai, undefined, 'and off the face it was on');

    // A board stamped older than one already taken is ignored rather than undoing it.
    const stale = clocks.u1 - 2;
    app.does('u1', { bets: { ca: 1000, ga: 20000 }, at: stale });
    await nap(250);
    assert.equal(app.mine('u1').me.staked, 5000, 'a send that arrived late undid a later one');
  });
});

test('nothing a widget can send bets on a face that is not there', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { baucua: 'solo' });
    await betting(app, 'u1');

    const nonsense = [
      { rong: 1000 },                        // a face nobody drew
      { cua: -5000 },                        // a stake that pays you to place it
      { cua: 1e12 },                         // more than anybody has
      { cua: 'lots' },
      { cua: 1000, rong: 1000 },             // one good face and one invented one
    ];
    for (const bad of nonsense) app.does('u1', { bets: bad, at: ++clocks.u1 });

    await nap(300);
    assert.equal(app.mine('u1').me.staked, 0,
      `one of ${JSON.stringify(nonsense)} got onto the board`);
    assert.equal(app.mine('u1').gold, STARTING_GOLD + DAILY_GOLD, 'and nothing moved');
  });
});

test('a throw with nothing on the board does not happen', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { baucua: 'solo' });
    await betting(app, 'u1');

    app.does('u1', { roll: true });
    await nap(300);
    assert.equal(app.mine('u1').phase, 'betting', 'the bowl should not have moved');
    assert.equal(app.mine('u1').dice, null);
  });
});

test('the three of spades opens the first hand of a table and nothing after it', async () => {
  // Cái lỗi luật: ván nào cũng đi tìm 3 bích, kể cả ván đấu lại. Đúng phải là người về nhất
  // ván trước được dẫn — ai chơi tiến lên cũng biết, mà bot thì không.
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen in c1');
    await claim(app, 'u1');
    app.asks('u2', 'c2');
    await app.until(() => app.mine('u2'), 'a screen in c2');
    await claim(app, 'u2');

    app.does('u1', { open: 2, stake: 1000 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'lobby', 'a table for two');

    await app.until(() => (app.mine('u2').rooms ?? []).length === 1, 'the table on u2\'s list');
    app.does('u2', { join: app.mine('u2').rooms[0].id });
    await dealt(app, ['u1', 'u2']);

    const first = app.mine('u1');
    assert.notEqual(first.opensWith, null, 'ván đầu thì có lá bắt buộc');
    const lowest = Math.min(...['u1', 'u2'].flatMap((id) => app.mine(id).me.hand));
    assert.equal(first.opensWith, lowest, 'và nó là lá thấp nhất đang chia ra');

    await playOut(app, ['u1', 'u2']);

    const over = app.mine('u1');
    const won = over.paid.find((one) => one.place === 'Nhất').userId;

    app.does('u1', { rematch: true });
    app.does('u2', { rematch: true });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'dealt again');

    const again = app.mine('u1');
    assert.equal(again.opensWith, null, 'ván sau không bắt lá nào cả');
    assert.equal(again.seats[again.turn].id, won, 'người về nhất ván trước được dẫn');
  }, { c1: ['u1'], c2: ['u2'] });
});

// ---- phỏm, cả đường dây --------------------------------------------------------------------

/// Một lượt phỏm: lấy một lá rồi đánh một lá. Lấy gì và đánh gì thì hỏi đúng cái máy của bot.
async function onePhomTurn(app, who) {
  const turn = who.find((id) => {
    const seen = app.mine(id);
    return seen && seen.phase === 'playing' && seen.me && seen.turn === seen.me.seat;
  });
  if (!turn) { await nap(15); return false; }

  const now = app.mine(turn);
  const was = JSON.stringify([now.turn, now.step, now.me.hand.length, now.phase]);

  if (now.step === 'take') {
    app.does(turn, now.me.canEat && phomChoose(now.me.hand, now.table,
      { locked: now.me.locked ?? [] })
      ? { eat: true } : { draw: true });
  } else {
    // Kèm bộ đã ăn: chúng bị khoá, và đánh một lá trong đó thì bot từ chối — bàn đứng im, và
    // cái chờ ngồi trọn hai lăm giây.
    app.does(turn, { throw: phomDiscard(now.me.hand, { locked: now.me.locked ?? [] }) });
  }

  await app.until(() => {
    const after = app.mine(turn);
    return JSON.stringify([after.turn, after.step, after.me.hand.length, after.phase]) !== was;
  }, `the phỏm table to move from ${now.step}`);
  return true;
}

async function playPhom(app, who) {
  for (let move = 0; move < 400; move++) {
    const stillAt = who.filter((id) => (app.mine(id) ?? {}).phase === 'playing');
    if (!stillAt.length) return;
    await onePhomTurn(app, who);
  }
  assert.fail('the phỏm table never finished');
}

test('a phỏm table is dealt, played, counted and paid', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');

    app.does('u1', { phomSolo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a phỏm table');

    const dealt = app.mine('u1');
    assert.equal(dealt.kind, 'phom');
    assert.equal(dealt.seats.length, 4);
    assert.equal(dealt.me.hand.length, 10, 'người mở bàn cầm cái, mười lá');
    assert.equal(dealt.step, 'throw', 'cầm cái thì đi bằng cách đánh ra một lá');
    assert.equal(dealt.stock, 52 - 10 - 9 * 3);
    assert.ok(dealt.seats.slice(1).every((one) => one.cards === 9));
    assert.ok(dealt.seats.slice(1).every((one) => one.bot), 'ghế trống là máy');

    // Số điểm rác được tính ở bot, không phải ở trang.
    assert.equal(typeof dealt.me.points, 'number');
    assert.ok(Array.isArray(dealt.me.melds));

    await playPhom(app, ['u1']);

    const over = app.mine('u1');
    assert.equal(over.phase, 'over');
    assert.equal(over.paid.length, 1, 'chỉ người mới được trả tiền, máy là đồ đạc');
    assert.equal(over.ranking.length, 4, 'nhưng ai cũng có hạng');
    assert.equal(new Set(over.ranking.map((one) => one.place)).size, 4,
      'bốn ghế phải là bốn hạng khác nhau');
    assert.ok(over.seats.every((one) => Array.isArray(one.melds) || one.melds === null));

    // Vàng đổi đúng bằng cái nó nói là đã đổi.
    const paid = over.paid[0];
    assert.equal(over.gold, STARTING_GOLD + DAILY_GOLD + paid.change);
  }, { c1: ['u1'] });
});

test('two people in different groups play phỏm at the same table', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen in c1');
    await claim(app, 'u1');
    app.asks('u2', 'c2');
    await app.until(() => app.mine('u2'), 'a screen in c2');
    await claim(app, 'u2');

    app.does('u1', { phom: 2, stake: 1000 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'lobby', 'a phỏm table for two');

    await app.until(() => (app.mine('u2').rooms ?? []).length === 1, 'the table on u2\'s list');
    const there = app.mine('u2').rooms[0];
    assert.equal(there.kind, 'phom', 'danh sách phải nói rõ là bàn phỏm');

    app.does('u2', { join: there.id });
    await dealt(app, ['u1', 'u2']);

    // Không ai nhận được bài của ai.
    const hands = ['u1', 'u2'].map((id) => app.mine(id).me.hand);
    assert.equal(hands[0].filter((card) => hands[1].includes(card)).length, 0,
      'the same card was dealt to both of them');
    assert.deepEqual(app.refused, [],
      'nothing was ever shown to somebody outside its own conversation');

    await playPhom(app, ['u1', 'u2']);

    const over = app.mine('u1');
    assert.equal(over.phase, 'over');
    assert.equal(over.paid.length, 2);
    assert.equal(over.paid.reduce((sum, one) => sum + one.change, 0), 0,
      'bàn phỏm làm ra vàng từ hư không');
  }, { c1: ['u1'], c2: ['u2'] });
});

test('nothing sent to a phỏm room ever carries a hand', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { phomSolo: 3 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a phỏm table');

    // Bàn đang đợi *người* đánh lá đầu — cái cầm cái là mình. Đi vài lượt cho ba cái máy chạy
    // theo, rồi mới có đủ push để soi.
    for (let i = 0; i < 8; i++) await onePhomTurn(app, ['u1']);
    await nap(200);

    let looked = 0;
    for (const push of app.pushes) {
      if (push.to !== null) continue;
      if (push.state.kind !== 'phom') continue;
      looked++;
      assert.equal(push.state.me, undefined, 'push chung mang theo bài riêng');
      for (const seat of push.state.seats ?? []) {
        assert.ok(typeof seat.cards === 'number' || seat.cards === null, 'ghế phải mang số lá');
        assert.ok(!('hand' in seat), 'một tay bài lọt vào bàn ai cũng thấy');
        // Lá đã ăn thì công khai — nó được đánh ra giữa bàn rồi.
        assert.ok(Array.isArray(seat.eaten));
      }
      // Nọc là một con số, không phải một xấp bài.
      assert.equal(typeof push.state.stock, 'number');
      assert.ok(!Array.isArray(push.state.stock), 'cả cái nọc bị đẩy ra ngoài');
    }
    assert.ok(looked > 2, `chỉ soi được ${looked} push`);
  }, { c1: ['u1'] });
});

test('a phỏm rematch is opened by whoever won, not by whoever opened the table', async () => {
  // Lỗi: người mở bàn cầm cái mãi. Ván nào cũng họ thêm một lá và đánh trước, cả buổi.
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen in c1');
    await claim(app, 'u1');
    app.asks('u2', 'c2');
    await app.until(() => app.mine('u2'), 'a screen in c2');
    await claim(app, 'u2');

    app.does('u1', { phom: 2, stake: 1000 });
    await app.until(() => (app.mine('u2').rooms ?? []).length === 1, 'the table on the list');
    app.does('u2', { join: app.mine('u2').rooms[0].id });
    await dealt(app, ['u1', 'u2']);

    // Ván đầu: người mở bàn cầm cái.
    const first = app.mine('u1');
    assert.equal(first.seats[first.turn].id, 'u1', 'ván đầu thì người mở bàn đi trước');
    assert.equal(first.me.hand.length, 10, 'và cầm mười lá');

    await playPhom(app, ['u1', 'u2']);
    const over = app.mine('u1');
    const won = over.paid.find((one) => one.place === 'Nhất').userId;

    app.does('u1', { rematch: true });
    app.does('u2', { rematch: true });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'dealt again');

    const again = app.mine('u1');
    assert.equal(again.seats[again.turn].id, won, 'ván sau thì người về nhất cầm cái');
    assert.equal(again.seats.find((one) => one.id === won).cards, 10,
      'và người ấy là người cầm mười lá');
  }, { c1: ['u1'], c2: ['u2'] });
});

test('losing to the machines does not hand you the lead again', async () => {
  // Đúng ca người chơi báo về: đấu với máy, về ba, bấm "ván nữa" — và vẫn được đánh đầu. Danh
  // sách về đích đã lọc bỏ máy, nên ở bàn một người ba máy nó chỉ còn đúng một cái tên, và cái
  // tên ấy thành "người về nhất" dù vừa về bét.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');

    app.does('u1', { solo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'a table of machines');
    await playOut(app, ['u1']);

    const over = app.mine('u1');
    assert.equal(over.phase, 'over');
    assert.equal(over.ranking.length, 4);
    const won = over.ranking[0].id;

    app.does('u1', { rematch: true });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'dealt again');

    const again = app.mine('u1');
    assert.equal(again.opensWith, null, 'ván sau không bắt 3 bích');
    assert.equal(again.seats[again.turn].id, won,
      'ghế về nhất ván trước phải là ghế đi đầu, kể cả khi đó là máy');

    // Và khi người chơi *không* về nhất thì họ không được đi đầu.
    if (won !== 'u1') {
      assert.notEqual(again.seats[again.turn].id, 'u1',
        'về sau máy mà vẫn được đánh đầu');
    }
  }, { c1: ['u1'] });
});
