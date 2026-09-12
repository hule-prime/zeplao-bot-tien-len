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
import { writeFileSync, readFileSync } from 'node:fs';

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
//
// Hai nghìn rưỡi thì vừa đủ cho tới khi có thêm hai bàn cờ. Cái máy nghĩ cờ đốt CPU thật — perft
// tới độ sâu ba, rồi mấy ván máy-đấu-máy — và bộ test chạy trước bộ này, nên tiến trình vẫn còn
// nóng lúc cửa đặt mở ra. Chạy riêng thì bốn mươi mốt trên bốn mươi mốt, ba lần liền; chạy sau
// bộ kia thì thỉnh thoảng đỏ. **Cùng một cái bẫy, lần thứ hai**, nên lần này nới rộng hẳn ra
// thay vì nới vừa đủ.
process.env.TIENLEN_BETTING_MS = '4000';
// Cái bát tài xỉu chạy theo đồng hồ riêng của nó, nên phải rút ngắn cả ba chặng ở đây nữa. Nặn ở
// đó dài hơn bầu cua vì có hai chặng — mở nắp rồi lật ba con — nên khoảng hiện kết quả để rộng
// hơn một chút, đúng theo tỷ lệ thật.
process.env.TIENLEN_TX_ROLL_MS = '60';
process.env.TIENLEN_TX_SHOW_MS = '160';
process.env.TIENLEN_TX_BETTING_MS = '4000';
// Bàn cờ: máy nghĩ nhanh lại, và đồng hồ một nước ngắn lại cho vừa một cái test.
process.env.TIENLEN_BOARD_THINK_MS = '1';
process.env.TIENLEN_BOARD_TURN_MS = '2000';
process.env.TIENLEN_SCORES = LEDGER;

/**
 * Nhóm tay máy **tắt** cho gần hết bộ này, và bật lại cho đúng mấy cái test về nó.
 *
 * Không phải để tránh né. Mỗi cái test dưới đây dựng một cái bàn rồi canh **đúng** những ai ngồi
 * vào đó — và một nhóm hai mươi bốn con tự đi tìm bàn trống mà ngồi sẽ ngồi vào hết, làm mọi câu
 * "bàn này có hai người" thành sai. Đó là hành vi đúng của nhóm, chỉ là không phải cái đang được
 * canh ở đây.
 *
 * Bật được giữa chừng vì `regulars.mjs` đọc biến môi trường **lúc hỏi**, không phải lúc nạp.
 */
process.env.TIENLEN_HOUSE = '0';
process.env.TIENLEN_HOUSE_MS = '60';
process.env.TIENLEN_HOUSE_SPEED = '0.01';

const {
  run, chooseMove, shapeOf, nameOf, STARTING_GOLD, DAILY_GOLD, BOT_STAKE, ADS_GOLD, dayIn,
  FACES, boardWorth, staked, phomChoose, phomDiscard,
  TX_DOORS, TX_PAYS, txBoardWorth, txStaked, txWon,
  chess, xiangqi, BOT_STAKE: BOARD_BOT_STAKE,
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
    widgetVersion: 1,
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
        return answer({
          id: 'bot',
          username: 'tienlen',
          displayName: 'Tiến Lên',
          widgetVersion: app.widgetVersion,
        });

      case 'getWidget':
        return answer({ version: app.widgetVersion, url: null, files: 8, bytes: 1 });

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
        if (!session || !session.live) return answer({ error: 'session_not_found' }, 404);
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

  /**
   * Chờ một lúc rồi trả lời **có hay không**, thay vì đỏ.
   *
   * `until` là để canh: hết giờ thì nó đỏ, và nó kể ra đang thấy gì — đúng việc của nó. Nhưng có
   * những chuyện mà "chưa xảy ra" là một câu trả lời hợp lệ và có đường đi tiếp — chia phải một
   * ván tới trắng chẳng hạn — và ở đó, đỏ sau hai mươi lăm giây là sai cả về kết luận lẫn về giá
   * phải trả để biết.
   */
  app.maybe = async (what, ms = 2000) => {
    for (let waited = 0; waited < ms; waited += 10) {
      if (what()) return true;
      await nap(10);
    }
    return !!what();
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
/**
 * Đợi bàn chia xong một ván **đánh được**, và trả về cái ví của từng người lúc ấy.
 *
 * Trả về cái ví, vì cái ván này có thể **không phải ván đầu**: chỗ này đốt qua mọi ván tới trắng,
 * mà một ván tới trắng **có tiền thật đi qua** — `settlement` trừ mỗi người thua
 * `blancheWorth × cược`. Rồi ván mới bắt đầu, `startGame` đặt `game.paidTo` và `game.paid` về
 * rỗng, **còn cái ví thì giữ nguyên**.
 *
 * Nên `vốn + quà` không phải là cái mốc. Cái mốc là **cái ví ngay trước ván đang tính**, và chỉ
 * chỗ này biết nó. Cùng lý do ấy, nó nói luôn **đã phải chia mấy ván**: có những cái test nói về
 * *ván đầu của một cái bàn* — luật 3 bích chẳng hạn — và với chúng, "ván thứ hai" không phải là
 * một ván hơi khác, nó là mất tiền đề. Hằng đẳng thức mà bot giữ là `ví = mốc + change`: `settle` đặt
 * `one.change = already + moving` và `row.gold += moving` trong cùng một hàm không có `await`
 * nào, nên hai vế không bao giờ lệch — miễn là lấy đúng mốc.
 *
 * Cùng họ với một cái đã sửa trong file này rồi: bản trước canh `change` bằng đúng một cược nên
 * đỏ mỗi khi bài chia ra có tứ quý, và lời ghi lại lúc ấy là *"không phải chập chờn, là canh
 * nhầm chỗ"*. Lần ấy sửa vế phải; đây là vế trái.
 */
async function dealt(app, who) {
  for (let tries = 0; tries < 20; tries++) {
    await app.until(() => who.every((id) => ['playing', 'over'].includes(app.mine(id).phase)),
      'the table to deal');
    if (who.every((id) => app.mine(id).phase === 'playing')) {
      return {
        purse: Object.fromEntries(who.map((id) => [id, app.mine(id).gold])),
        hands: tries + 1,
      };
    }

    // Tới trắng: ván xong trước khi ai kịp đánh. Xin ván khác.
    for (const id of who) app.does(id, { rematch: true });
    await nap(60);
  }
  assert.fail('the table kept dealing tới trắng');
}

/**
 * Xin chia lại, và đợi tới khi có một ván **đánh được**. Trả về ai vừa về nhất ở ván trước nó.
 *
 * Một ván chia lại cũng có thể là **tới trắng**, y như ván đầu. Lúc ấy nó xong trước khi ai kịp
 * đánh, `phase` nhảy thẳng sang `over`, và một vòng chờ `playing` sẽ đứng đó **tới hết giờ** —
 * hai mươi lăm giây, rồi đỏ, và cái đỏ ấy không nói gì về thứ nó sinh ra để canh.
 *
 * Nó **không cần phân biệt** "chưa chia lại" với "chia rồi và tới trắng luôn": nhìn từ ngoài cả
 * hai đều là `over`, và cả hai đều dẫn tới cùng một việc phải làm. Nên nó chỉ chờ ngắn rồi thử
 * lại, thay vì đi tìm một tín hiệu để tách hai thứ không cần tách.
 *
 * Và nó trả về người về nhất, vì **đốt một ván là đổi người dẫn ván sau**. Giữ sẵn cái tên từ
 * trước khi xin chia lại là giữ một cái tên đã cũ đúng vào lúc nó vừa đổi.
 */
async function redealt(app, who) {
  let won = null;

  for (let tries = 0; tries < 20; tries++) {
    const seen = app.mine(who[0]) ?? {};

    // Chỉ đọc người về nhất khi bàn **đang ở `over`**. Giữa chừng một ván thì `ranking` là một
    // danh sách dở, và một cái tên đọc ra từ danh sách dở là một cái tên sai — mà nó sai một
    // cách im lặng, vì nó vẫn là một cái tên có thật.
    if (seen.phase === 'over') {
      won = (seen.ranking ?? [])[0]?.id
        ?? (seen.paid ?? []).find((one) => one.place === 'Nhất')?.userId
        ?? null;
    }

    // Ván mới đã chia rồi — có thể nó đáp xuống trong lúc vòng trước đang chờ.
    const at = app.pushes.length;
    if (!who.every((id) => (app.mine(id) ?? {}).phase === 'playing')) {
      for (const id of who) app.does(id, { rematch: true });
      await app.maybe(() => who.every((id) => (app.mine(id) ?? {}).phase === 'playing'), 3000);
    }
    if (!who.every((id) => (app.mine(id) ?? {}).phase === 'playing')) continue;

    /**
     * Cái push **đầu tiên** của ván mới, không phải cái mới nhất.
     *
     * Máy nghĩ **một mili giây** trong bộ test (`TIENLEN_THINK_MS=1`). Nên nếu người được dẫn là
     * một con máy thì tới lúc đọc `app.mine()`, nó đã đánh xong và lượt đã trôi qua — và câu
     * "ghế về nhất ván trước có được đi đầu không" trả lời sai, một cách hoàn toàn ngẫu nhiên
     * theo việc cái push nào kịp về trước.
     *
     * *Ai được dẫn* là một sự thật chỉ đúng ở **đúng một khung hình**, nên phải đọc đúng khung
     * hình ấy. `app.pushes` giữ cả dãy, nên nó có sẵn ở đó.
     */
    const first = app.pushes.slice(at)
      .find((one) => one.to === who[0] && one.state.phase === 'playing')?.state
      ?? app.mine(who[0]);

    return { won, first };
  }
  assert.fail('bàn chia tới trắng mãi, hai mươi ván liền');
}

/**
 * Đánh cho tới khi bàn xong.
 *
 * `tries` đưa vào được, vì ngân sách bốn trăm vòng là ngân sách của một cái bàn **toàn máy đồ
 * đạc nghĩ một mili giây**. Một cái bàn có tay máy thì mỗi ghế nghĩ như người — ngắn lại cho vừa
 * một cái test, nhưng vẫn là một quãng thật — nên bốn trăm vòng hết trước khi ván hết, và cái đỏ
 * nó cho ra là "the table never finished", một câu nói về cái đồng hồ chứ không về cái bàn.
 */
async function playOut(app, who, tries = 400) {
  for (let move = 0; move < tries; move++) {
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
    const purse = dealt.gold;          // cái mốc, đo lúc chia chứ không giả định
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
    assert.equal(over.gold, purse + paid.change, 'and the ledger says the same');
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

test('phát tiền cho cả sòng: cả sổ được chia, và người phát lên bảng công đức', async () => {
  // Ba người trong sổ, một người phát. Đây là đường tiền duy nhất trong cả cái bot này đi từ ví
  // người này sang ví người khác **mà không qua một cái bàn nào**, nên nó được kiểm ở đây theo
  // đúng cách một ván bài được kiểm: đếm từng cái ví trước và sau.
  ledger({
    u1: { name: 'Thọ', gold: 500_000, games: 2, first: 1, last: 0, claimed: dayIn(), ads: 0 },
    u2: { name: 'Lan Anh', gold: 1_000, games: 1, first: 0, last: 1, claimed: dayIn(), ads: 0 },
    u3: { name: 'Minh', gold: 3_000, games: 0, first: 0, last: 0, claimed: dayIn(), ads: 0 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    app.asks('u2');
    await app.until(() => app.mine('u1') && app.mine('u2'), 'hai màn hình');

    const lobby = app.mine('u1');
    assert.equal(lobby.meritMin, 100_000, 'cái sàn tới từ bot chứ không phải từ trang');
    assert.equal(lobby.meritPer, 100, 'và tỷ lệ quy đổi cũng vậy — trang không giữ bản sao');
    assert.deepEqual(lobby.merit, [], 'chưa ai phát thì bảng công đức trống');
    assert.deepEqual(lobby.alms, []);

    app.does('u1', { give: 100_000 });
    await app.until(() => app.mine('u1').gold === 400_000, 'số vàng rời khỏi ví người phát');
    await app.until(() => app.mine('u2').gold === 51_000, 'phần của người nhận');

    const after = app.mine('u1');
    assert.equal(after.meritMine, 1_000, 'một trăm nghìn là một nghìn công đức');
    assert.deepEqual(after.merit.map((one) => [one.name, one.merit]), [['Thọ', 1_000]]);
    assert.equal(after.says, 'Đã phát 100.000 vàng cho 2 người · +1.000 công đức.',
      'và người phát được nói lại đúng con số vừa cho đi');

    // Lịch sử, đủ để ai cũng đối chiếu được với cái bảng ở trên.
    assert.equal(after.alms.length, 1);
    const [gift] = after.alms;
    assert.equal(gift.name, 'Thọ');
    assert.equal(gift.gold, 100_000);
    assert.equal(gift.many, 2, 'cả sổ trừ chính mình');
    assert.ok(Date.now() - gift.at < 25_000, 'và có mốc thời gian thật');

    // Người nhận được nói riêng, bằng con số của chính họ chứ không phải một dòng chung.
    assert.equal(app.mine('u2').says, 'Thọ vừa phát cho cả sòng — bạn được 50.000 vàng.');

    // Và cả phòng được biết, vì một cái bảng công đức không ai thấy ai lên là một cái bảng
    // không ai lên.
    //
    // **Chờ, không phải kiểm ngay.** Dòng cho phòng đi sau khi mọi màn hình đã được đẩy — nên
    // cái ví đổi số xong không có nghĩa là tin nhắn đã tới nơi, nó chỉ có nghĩa là chưa tới
    // lượt nó. Kiểm ngay tại đó là một cái test xanh trên máy rảnh và đỏ trên máy bận, mà đỏ
    // ngẫu nhiên thì lần nào cũng bị đọc thành "chạy lại phát nữa xem".
    await app.until(
      () => app.said.some((one) => one.text.includes('Thọ vừa phát 100.000 vàng cho 2 người')),
      `dòng cho phòng, thấy: ${app.said.map((one) => one.text).join(' | ')}`);

    // Người thứ ba chưa mở màn hình nào vẫn có phần — cái sổ mới là chỗ chia, không phải cái
    // danh sách ai đang online.
    app.asks('u3');
    await app.until(() => app.mine('u3'), 'màn hình của người thứ ba');
    assert.equal(app.mine('u3').gold, 53_000);
  }, { c1: ['u1', 'u2', 'u3'] });
});

test('phát hai lần thì cộng dồn, và sổ vẫn không đẻ ra đồng nào', async () => {
  ledger({
    u1: { name: 'Thọ', gold: 1_000_000, games: 1, first: 1, last: 0, claimed: dayIn(), ads: 0 },
    u2: { name: 'Lan Anh', gold: 0, games: 1, first: 0, last: 1, claimed: dayIn(), ads: 0 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    app.asks('u2');
    await app.until(() => app.mine('u1') && app.mine('u2'), 'hai màn hình');

    app.does('u1', { give: 100_000 });
    await app.until(() => app.mine('u2').gold === 100_000, 'lần phát thứ nhất');
    app.does('u1', { give: 250_000 });
    await app.until(() => app.mine('u2').gold === 350_000, 'lần phát thứ hai');

    const after = app.mine('u1');
    assert.equal(after.gold, 650_000);
    assert.equal(after.meritMine, 3_500, 'công đức cộng dồn, không phải lấy lần cuối');
    assert.equal(after.alms.length, 2, 'hai dòng lịch sử');
    assert.equal(after.alms[0].gold, 250_000, 'mới nhất lên đầu');
    assert.equal(after.gold + app.mine('u2').gold, 1_000_000,
      'cả sổ trước và sau vẫn đúng bằng nhau');
  });
});

test('không phát được thì nói vì sao, và không đồng nào nhúc nhích', async () => {
  ledger({
    u1: { name: 'Thọ', gold: 120_000, games: 1, first: 1, last: 0, claimed: dayIn(), ads: 0 },
    u2: { name: 'Lan Anh', gold: 5_000, games: 1, first: 0, last: 1, claimed: dayIn(), ads: 0 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'một màn hình');

    // Ba lời từ chối, ba lý do khác nhau. Con số đi vào đây tới từ một trang ai cũng sửa được,
    // nên cả ba đều được kiểm lại ở phía bot chứ không chỉ ở chỗ cái nút sáng hay tối.
    // Chờ **một lần đẩy nữa** rồi mới đọc, chứ không chờ tới khi câu ấy hiện ra. Hai lời từ
    // chối ở đây trùng chữ nhau, nên đọc thẳng cái says là đọc lại được đúng cái push của lần
    // trước và cái test xanh mà chẳng kiểm gì cả.
    const to = (userId) => app.pushes.filter((one) => one.to === userId).length;
    const refused = async (action, saying) => {
      const before = to('u1');
      app.does('u1', action);
      await app.until(() => to('u1') > before, `một lần đẩy nữa sau ${JSON.stringify(action)}`);
      assert.ok((app.mine('u1').says ?? '').includes(saying),
        `chờ lời từ chối "${saying}", thấy "${app.mine('u1').says}"`);
      assert.equal(app.mine('u1').gold, 120_000, 'ví không được động tới');
      assert.equal(app.mine('u1').meritMine, 0, 'và không ai được công đức vì một lần bị từ chối');
    };

    await refused({ give: 50_000 }, 'Phát ít nhất 100.000 vàng');
    await refused({ give: 500_000 }, 'Bạn chỉ có 120.000 vàng');
    await refused({ give: 'nhiều' }, 'Phát ít nhất 100.000 vàng');
    await refused({ give: -100_000 }, 'Phát ít nhất 100.000 vàng');
  });
});

test('máy không có tên trong sổ, nên không có phần trong món quà', async () => {
  // Cái bẫy mà tính năng này mới dựng ra: từ trước tới nay không ai duyệt **cả sổ** một lượt,
  // nên một cái ghế máy lỡ được ghi vào sổ cũng chẳng ai thấy. Bây giờ thì thấy — nó ăn mất một
  // phần quà, và vàng ấy đi vào một cái ví không có người nào ngồi sau.
  ledger({
    u1: { name: 'Thọ', gold: 500_000, games: 0, first: 0, last: 0, claimed: dayIn(), ads: 0 },
    u2: { name: 'Lan Anh', gold: 0, games: 0, first: 0, last: 0, claimed: dayIn(), ads: 0 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'một màn hình');

    // Một bàn với ba cái máy, chơi hết, trả tiền xong — tức là đã đi qua đúng chỗ ghi sổ.
    app.does('u1', { solo: 4 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'một ván');
    await playOut(app, ['u1']);
    app.does('u1', { leave: true });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'choosing', 'về sảnh');

    const purse = app.mine('u1').gold;
    app.does('u1', { give: 100_000 });
    await app.until(() => app.mine('u1').gold === purse - 100_000, 'món quà rời ví');

    const [gift] = app.mine('u1').alms;
    assert.equal(gift.many, 1, 'chỉ một người thật trong sổ, ba cái máy không tính');
    assert.equal(gift.gold, 100_000);
  });
});

test('một mình trong sổ thì không có ai để phát cho', async () => {
  ledger({
    u1: { name: 'Thọ', gold: 300_000, games: 1, first: 1, last: 0, claimed: dayIn(), ads: 0 },
  });
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'một màn hình');

    app.does('u1', { give: 100_000 });
    await app.until(() => (app.mine('u1').says ?? '').includes('Chưa có ai khác trong sổ'),
      'lời từ chối');
    assert.equal(app.mine('u1').gold, 300_000, 'và tiền ở nguyên trong ví');
  }, { c1: ['u1'] });
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
    // Mốc là cái ví lúc ván này được chia, không phải vốn + quà: `dealt` có thể đã đốt qua một
    // ván tới trắng, và một ván tới trắng lấy tiền thật.
    const { purse } = await dealt(app, ['u1', 'u2', 'u3']);

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
    // Tiền **về nhất** là con số tất định; `change` thì không, vì ván có thể có chặt — và một
    // cú chặt tứ quý ở mức cược này là tám nghìn. Cái test từng canh `change` bằng đúng một
    // cược, nên nó đỏ mỗi khi bài chia ra có tứ quý: không phải chập chờn, là canh nhầm chỗ.
    assert.equal(paid.placing, 1000, 'a stake, off whoever comes last');
    assert.equal(won.gold, purse[first] + paid.change,
      'and the purse already says so, chặt và thối tính cả vào');

    // And now they can put it down. This is not forfeiting.
    app.does(first, { leave: true });
    await app.until(() => app.mine(first).phase === 'choosing', 'back to the lobby');
    assert.equal(app.mine(first).gold, purse[first] + 1000,
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

test('a widget-only deploy opens a fresh session instead of the pinned old bundle', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'the first screen');
    const first = app.opened.u1;

    app.asks('u1');
    await nap(250);
    assert.equal(app.opened.u1, first, 'same bundle, same room: reuse the live session');

    app.widgetVersion += 1;
    app.asks('u1');
    await app.until(() => app.opened.u1 !== first, 'a fresh screen for the new bundle');
    assert.equal(app.sessions.get(first).live, false, 'the old pinned session was closed');
  }, { c1: ['u1'] });
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

/**
 * Đặt cược cho mấy người **trong cùng một ván**, và làm lại nếu cửa đóng mất giữa chừng.
 *
 * Cái test muốn nói là "hai người cùng đặt lên một cú xóc". Viết thẳng — gửi hai lệnh rồi chờ cả
 * hai thấy tiền trên bàn — thì **không nói được điều ấy**: hai cái state đọc ra là hai cái state
 * độc lập, nên có lúc cái của u1 còn là ván cũ mà cái của u2 đã sang ván mới, và phép chờ vẫn
 * xanh. Rồi cú xóc chỉ trả cho một người, và test đỏ ở một dòng cách đó mười dòng.
 *
 * Đây là lần thứ tư cùng một họ lỗi trong file này: một phép chờ chạy đua với một cái đồng hồ
 * thật. Ba lần trước chữa bằng nới con số và xếp lại thứ tự — cả hai đều là mua thêm chỗ thở.
 * Lần này bỏ hẳn cuộc đua: **hỏi thẳng số ván**, và nếu ván trôi mất thì đặt lại ở ván sau.
 */
async function stakeTogether(app, table, sum) {
  for (let go = 0; go < 8; go++) {
    await app.until(() => table.every(([id]) => (app.mine(id) ?? {}).phase === 'betting'),
      'cửa đặt mở cho mọi người');

    const round = app.mine(table[0][0]).round;
    for (const [id, bets] of table) app.does(id, { bets, at: ++clocks[id] });

    // Chờ tới khi hoặc mọi người đã có đủ tiền trên bàn, hoặc ván đã trôi qua — cái nào tới
    // trước cũng được, vì cả hai đều là câu trả lời.
    await app.until(() => table.every(([id, bets]) => {
      const now = app.mine(id) ?? {};
      return now.round !== round || (now.me && sum(now.me.bets ?? {}) === sum(bets));
    }), 'chip xuống bàn');

    if (table.every(([id]) => (app.mine(id) ?? {}).round === round)) return round;
  }
  assert.fail('không đặt nổi cược của cả hai người trong cùng một ván');
  return 0;
}

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
    await stakeTogether(app, [['u1', { cua: 1000 }], ['u2', { ga: 5000 }]], staked);

    const bets = { u1: { ...app.mine('u1').me.bets }, u2: { ...app.mine('u2').me.bets } };
    assert.equal(staked(bets.u1), 1000);
    assert.equal(staked(bets.u2), 5000);

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

// ---- tài xỉu ---------------------------------------------------------------------------------

test('one tài xỉu table for the whole world, and no other kind of it', async () => {
  // Bầu cua có hai lối vào: cái sòng chung, và một cái bát riêng để xóc một mình. Tài xỉu chỉ có
  // một, và đó là một quyết định chứ không phải một thứ chưa viết. Ba con dưới cái bát mà không
  // có ai khác ở bàn là một con số hiện lên mỗi nửa phút; nửa đáng chơi của trò này là hai chục
  // người cùng đặt lên đúng cái bát ấy.
  ledger();
  await withBot(async (app) => {
    for (const [id, room] of [['u1', 'c1'], ['u2', 'c2']]) {
      app.asks(id, room);
      await app.until(() => app.mine(id), `a screen for ${id}`);
      await claim(app, id);
    }

    app.does('u1', { taixiu: true });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'taixiu', 'the tài xỉu table');
    assert.equal(app.mine('u1').world, true, 'and it says which one it is');
    assert.equal(app.mine('u1').solo, false, 'there is no bowl of your own here');
    await app.until(() => (app.mine('u1') ?? {}).bettingEndsAt, 'a clock, with nobody else there');
    assert.deepEqual(app.mine('u1').doors, TX_DOORS, 'and it says what the doors are');
    assert.deepEqual(app.mine('u1').pays, TX_PAYS, 'and what each of them pays');

    // Somebody in a completely different group walks in on the same table.
    app.does('u2', { taixiu: true });
    await app.until(() => (app.mine('u2') ?? {}).kind === 'taixiu', 'u2 at the same bát');
    assert.equal(app.mine('u1').gameId, app.mine('u2').gameId, 'one table, not two');
    await app.until(() => (app.mine('u1').seats ?? []).length === 2, 'both of them in the chairs');

    // Nothing on anybody's list to join: the one table is not a table anybody opened.
    assert.deepEqual((app.mine('u1').rooms ?? []), [],
      'the world table turned up on the list of tables to join');

    const purse = { u1: app.mine('u1').gold, u2: app.mine('u2').gold };
    await stakeTogether(app,
      [['u1', { tai: 1000, chan: 1000 }], ['u2', { xiu: 5000 }]], txStaked);

    const bets = { u1: { ...app.mine('u1').me.bets }, u2: { ...app.mine('u2').me.bets } };
    assert.equal(txStaked(bets.u1), 2000);
    assert.equal(txStaked(bets.u2), 5000);

    // Nobody presses anything. The clock throws it.
    await app.until(() => (app.mine('u1') ?? {}).phase === 'paid', 'the clock to throw');

    const over = app.mine('u1');
    assert.equal(over.dice.length, 3);
    assert.ok(over.dice.every((one) => one >= 1 && one <= 6), `${over.dice} is not three dice`);
    assert.equal(over.total, over.dice[0] + over.dice[1] + over.dice[2],
      'the total is worked out by the bot, not left for the page to add up');
    assert.deepEqual(over.won, txWon(over.dice), 'and so is which doors it paid');

    for (const id of ['u1', 'u2']) {
      const owed = txBoardWorth(bets[id], over.dice);
      assert.equal(app.mine(id).gold, purse[id] + owed, `${id}'s purse`);
    }

    // And it comes round again on its own.
    await app.until(() => (app.mine('u1') ?? {}).phase === 'betting', 'the next window');
    assert.equal(app.mine('u1').me.staked, 0);
    assert.ok(app.mine('u1').bettingEndsAt, 'with a clock on it');
  }, { c1: ['u1'], c2: ['u2'] });
});

test('bão pays the storm and takes everything else, all the way to the purse', async () => {
  // Cái luật duy nhất của trò này mà người ta quên đúng một lần, kiểm ở chỗ nó thật sự tính
  // tiền: không phải trong một hàm thuần mà trong cái ví, sau khi đã đi qua bot và quay lại.
  //
  // Xúc xắc thì không đặt hàng được, nên đây là ván nào cũng kiểm — đặt cả năm cửa, và số tiền
  // dịch chuyển phải đúng bằng cái luật nói, dù ván ấy có là bão hay không.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');

    app.does('u1', { taixiu: true });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'taixiu', 'the table');

    const all = { tai: 1000, xiu: 1000, chan: 1000, le: 1000, bao: 1000 };
    let storms = 0;

    for (let round = 0; round < 6; round++) {
      await app.until(() => (app.mine('u1') ?? {}).phase === 'betting', 'a window to bet in');
      const purse = app.mine('u1').gold;

      app.does('u1', { bets: { ...all }, at: ++clocks.u1 });
      await app.until(() => app.mine('u1').me.staked === 5000, 'all five doors');

      await app.until(() => (app.mine('u1') ?? {}).phase === 'paid', 'the throw');
      const over = app.mine('u1');
      const moved = app.mine('u1').gold - purse;

      if (over.bao) {
        storms++;
        assert.deepEqual(over.won, ['bao'], `${over.dice} was a bão and paid something else`);
        // Bão trả 30, bốn cửa kia mất 1.000 mỗi cửa.
        assert.equal(moved, 1000 * TX_PAYS.bao - 4000, `bão ${over.dice}`);
      } else {
        // Một câu nói lớn nhỏ và một câu nói chẵn lẻ trên cùng một cái tổng: bao giờ cũng đúng
        // hai cửa ăn và ba cửa thua.
        assert.equal(over.won.length, 2, `${over.dice} paid ${over.won}`);
        assert.equal(moved, -1000, `${over.dice} (tổng ${over.total})`);
      }
      assert.equal(moved, txBoardWorth(all, over.dice), 'the purse and the rule disagree');
    }
    // Không đòi phải ra bão trong sáu ván — một trên ba mươi sáu thì đó là may rủi, và một cái
    // test đỏ ngẫu nhiên còn tệ hơn không có test.
    if (storms) console.log(`  (bão ra ${storms} lần trong sáu ván)`);
  });
});

test('a tài xỉu board cannot be staked on a bầu cua door, or the other way round', async () => {
  // Cả hai cái bát nhận cùng một lệnh `bets`, và cả hai đều nhận nó từ một trang ai cũng sửa
  // được. Cửa của bàn nào chỉ là cửa của bàn ấy: một bàn tài xỉu nhận được `cua` là một bàn đang
  // tin vào một trang không phải trang con bot này gửi đi.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    const purse = app.mine('u1').gold;

    app.does('u1', { taixiu: true });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'taixiu', 'the table');
    await app.until(() => (app.mine('u1') ?? {}).phase === 'betting', 'a window to bet in');

    const nonsense = [
      { cua: 1000 },                         // a door from the other bowl
      { bau: 1000, tai: 1000 },              // one real door and one from next door
      { tai: -5000 },                        // a stake that pays you to place it
      { bao: 1e12 },                         // more than anybody has
      { tai: 'nhiều' },
      { taixiu: 1000 },                      // the name of the game is not a door
    ];
    for (const bad of nonsense) app.does('u1', { bets: bad, at: ++clocks.u1 });

    await nap(300);
    assert.equal(app.mine('u1').me.staked, 0,
      `one of ${JSON.stringify(nonsense)} got onto the board`);

    // And the same in reverse: a bầu cua bowl does not take tài.
    app.does('u1', { leave: true });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'choosing', 'back at the lobby');
    app.does('u1', { baucua: 'solo' });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'baucua', 'a bowl of their own');
    app.does('u1', { bets: { tai: 1000 }, at: ++clocks.u1 });
    await nap(200);
    assert.equal(app.mine('u1').me.staked, 0, 'a bầu cua bowl took a tài xỉu door');
    assert.equal(app.mine('u1').gold, purse, 'and nothing moved anywhere');
  });
});

test('the tài xỉu bát cannot be hurried along by whoever is standing at it', async () => {
  // Không có nút xóc, và không ai được xóc. Cái bàn này là của cả thế giới và chạy theo đồng hồ
  // của nó: một cái nút giục nó đi là một người quyết thay cho tất cả những người còn lại.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');

    app.does('u1', { taixiu: true });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'taixiu', 'the table');
    await app.until(() => (app.mine('u1') ?? {}).phase === 'betting', 'a window to bet in');
    app.does('u1', { bets: { tai: 1000 }, at: ++clocks.u1 });
    await app.until(() => app.mine('u1').me.staked === 1000, 'a chip down');

    // The button a bầu cua bowl of your own has. Here it is nothing at all.
    app.does('u1', { roll: true });
    await nap(200);
    assert.equal(app.mine('u1').phase, 'betting', 'somebody threw the world table');
    assert.equal(app.mine('u1').dice, null);
  });
});

test('money left on the tài xỉu board is still money on the board', async () => {
  // Same as the bầu cua bowl and for the same reason: the last person can walk out with chips
  // down, and a stake that is never settled is a stake taken.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    const purse = app.mine('u1').gold;

    app.does('u1', { taixiu: true });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'taixiu', 'the table');
    await app.until(() => (app.mine('u1') ?? {}).phase === 'betting', 'a window to bet in');
    app.does('u1', { bets: { bao: 1000 }, at: ++clocks.u1 });
    await app.until(() => app.mine('u1').me.staked === 1000, 'a chip down');

    app.does('u1', { leave: true });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'choosing', 'back at the lobby');

    await app.until(() => app.mine('u1').gold !== purse, 'the throw to settle');
    const moved = app.mine('u1').gold - purse;
    assert.ok([-1000, 1000 * TX_PAYS.bao].includes(moved),
      `settled for ${moved}, which is not what a thousand on bão is worth`);
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

    // Cái test này nói về **ván đầu của một cái bàn**, nên cái ván nó nhìn phải đúng là ván đầu.
    //
    // Chia phải tới trắng thì `dealt` đốt ván ấy đi và trả về ván thứ hai — ở đó `opensWith` là
    // `null` một cách hoàn toàn đúng luật, và cái đỏ sinh ra từ đó không nói gì về thứ nó canh.
    // Nới câu hỏi ra cho vừa cái bàn hỏng là bỏ mất chính thứ nó sinh ra để bắt, nên cách khác:
    // bỏ bàn ấy đi, mở bàn khác, cho tới khi có một ván đầu thật.
    for (let tries = 1; ; tries++) {
      app.does('u1', { open: 2, stake: 1000 });
      await app.until(() => (app.mine('u1') ?? {}).phase === 'lobby', 'a table for two');
      await app.until(() => (app.mine('u2').rooms ?? []).length === 1, 'the table on u2\'s list');
      app.does('u2', { join: app.mine('u2').rooms[0].id });

      if ((await dealt(app, ['u1', 'u2'])).hands === 1) break;

      assert.ok(tries < 10, 'mười bàn liền chia tới trắng ngay ván đầu');
      for (const id of ['u1', 'u2']) app.does(id, { leave: true });
      await app.until(() => ['choosing', 'over'].includes(app.mine('u1').phase), 'về sảnh');
      app.does('u1', { leave: true });
      await app.until(() => app.mine('u1').phase === 'choosing', 'về sảnh hẳn');
    }

    const first = app.mine('u1');
    assert.notEqual(first.opensWith, null, 'ván đầu thì có lá bắt buộc');
    const lowest = Math.min(...['u1', 'u2'].flatMap((id) => app.mine(id).me.hand));
    assert.equal(first.opensWith, lowest, 'và nó là lá thấp nhất đang chia ra');

    await playOut(app, ['u1', 'u2']);

    // Ván chia lại có thể là tới trắng, y như ván đầu — nên xin cho tới khi có ván đánh được,
    // và hỏi lại ai vừa về nhất, vì đốt một ván là đổi người dẫn ván sau.
    const { won, first: again } = await redealt(app, ['u1', 'u2']);
    assert.equal(again.opensWith, null, 'ván sau không bắt lá nào cả');
    assert.equal(again.seats[again.turn].id, won,
      `người về nhất ván trước được dẫn — đợi ${won}, được ${again.seats[again.turn]?.id}`);
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
    const purse = dealt.gold;          // cái mốc, đo lúc chia chứ không giả định
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
    assert.equal(over.gold, purse + paid.change);
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

    // Y như bên tiến lên: ván chia lại có thể ù ngay, và lúc ấy chờ `playing` là chờ mãi.
    const { won, first: again } = await redealt(app, ['u1', 'u2']);
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
    const { won, first: again } = await redealt(app, ['u1']);
    assert.equal(again.opensWith, null, 'ván sau không bắt 3 bích');
    assert.equal(again.seats[again.turn].id, won,
      `ghế về nhất ván trước phải là ghế đi đầu, kể cả khi đó là máy — `
      + `đợi ${won}, được ${again.seats[again.turn]?.id}`);

    // Và khi người chơi *không* về nhất thì họ không được đi đầu.
    if (won !== 'u1') {
      assert.notEqual(again.seats[again.turn].id, 'u1',
        'về sau máy mà vẫn được đánh đầu');
    }
  }, { c1: ['u1'] });
});

// ---- cờ vua và cờ tướng -------------------------------------------------------------------------
//
// **Ở cuối file, và đó là một quyết định.**
//
// Mấy cái test này cho cái máy nghĩ cờ chạy thật, và nó đốt CPU — không nhiều, nhưng đủ. Mấy trò
// xúc xắc phía trên thì chạy theo **đồng hồ thật**: cửa đặt mở hai mươi lăm giây ở đời thật và
// bốn giây trong test, và nếu tiến trình đang bận thì lệnh đặt cược tới nơi sau khi cửa đã đóng.
// Lúc ấy test đỏ vì cái đồng hồ trong test, không phải vì cái sòng.
//
// Đó là lần thứ ba cùng một cái bẫy trong file này. Hai lần trước chữa bằng cách nới con số ra;
// lần này chữa bằng cách **xếp lại thứ tự** — cái gì đốt CPU thì chạy sau cái gì đo thời gian.
// Nới con số là mua thêm chỗ thở; xếp lại thứ tự là bỏ hẳn chỗ hai bên đụng nhau.

/// Nước đầu tiên trong danh sách bot gửi về. Cái test không cần đánh hay — nó cần đánh **đúng**.
const aMove = (app, id) => (app.mine(id).me.moves || [])[0];

test('a board table against the machine deals, moves, and pays', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    const purse = app.mine('u1').gold;

    app.does('u1', { chess: 'solo' });
    await app.until(() => (app.mine('u1') ?? {}).kind === 'chess', 'a chess board');

    const table = app.mine('u1');
    assert.equal(table.phase, 'playing');
    assert.equal(table.solo, true);
    assert.equal(table.board.length, 64, 'sixty-four squares');
    assert.equal(table.seats.length, 2, 'two seats, always');
    assert.ok(table.seats.some((one) => one.bot), 'and one of them is the machine');
    // Hai bên phải là hai màu khác nhau, và rút thăm — không phải bao giờ cũng người mở cầm
    // trắng, vì đi trước là một lợi thế đo được và nó đi thẳng vào sổ vàng.
    assert.notEqual(table.seats[0].side, table.seats[1].side, 'the two seats hold two colours');

    // Chờ tới lượt mình — có thể máy cầm trắng và đi trước.
    await app.until(() => (app.mine('u1').me?.moves ?? []).length > 0, 'a turn of my own');
    const mine = app.mine('u1');
    assert.equal(mine.turn, mine.me.seat, 'the move list only goes to whoever is on the move');
    assert.equal(mine.me.side, mine.seats[mine.me.seat].side);

    const before = [...mine.board];
    const move = aMove(app, 'u1');
    app.does('u1', { move });
    await app.until(() => app.mine('u1').board[move.to] !== before[move.to], 'the piece to move');

    // Và máy trả lời, không cần ai giục.
    await app.until(() => (app.mine('u1').me?.moves ?? []).length > 0
      && app.mine('u1').last && app.mine('u1').turn === app.mine('u1').me.seat,
    'the machine to answer');
    assert.equal(app.mine('u1').gold, purse, 'nothing moves in the purse until the game ends');
  });
});

test('two people at one board, in two different groups', async () => {
  ledger();
  await withBot(async (app) => {
    for (const [id, room] of [['u1', 'c1'], ['u2', 'c2']]) {
      app.asks(id, room);
      await app.until(() => app.mine(id), `a screen for ${id}`);
      await claim(app, id);
    }
    const purse = { u1: app.mine('u1').gold, u2: app.mine('u2').gold };

    app.does('u1', { xiangqi: 'open', stake: 5000 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'lobby', 'a board waiting');
    assert.equal(app.mine('u1').kind, 'xiangqi');
    assert.equal(app.mine('u1').size, 2, 'a board is always for two');

    await app.until(() => (app.mine('u2').rooms ?? []).length === 1, "the board on u2's list");
    assert.equal(app.mine('u2').rooms[0].kind, 'xiangqi');
    app.does('u2', { join: app.mine('u2').rooms[0].id });

    // Đủ hai người là bàn tự bày quân — không ai phải bấm gì.
    await app.until(() => (app.mine('u1') ?? {}).phase === 'playing', 'the board to set itself up');
    assert.equal(app.mine('u1').board.length, 90, 'nine by ten');
    assert.equal(app.mine('u1').gameId, app.mine('u2').gameId, 'one board, not two');

    // Bên nào đi thì bên ấy có danh sách nước; bên kia không có nước nào.
    const first = ['u1', 'u2'].find((id) => (app.mine(id).me?.moves ?? []).length > 0);
    const other = first === 'u1' ? 'u2' : 'u1';
    assert.ok(first, 'somebody is on the move');
    assert.deepEqual(app.mine(other).me.moves, [], 'and only one of them is');

    // Người chưa tới lượt đi thử một nước của người kia: phải bị từ chối và được nói ra.
    app.does(other, { move: app.mine(first).me.moves[0] });
    await app.until(() => !!app.mine(other).says, 'a refusal in words');
    assert.match(app.mine(other).says, /lượt/, 'and it says what is wrong');

    const before = [...app.mine(first).board];
    const move = app.mine(first).me.moves[0];
    app.does(first, { move });
    await app.until(() => app.mine(first).board[move.to] !== before[move.to], 'the piece to move');
    await app.until(() => (app.mine(other).me?.moves ?? []).length > 0, 'the turn to come round');

    // Rời bàn giữa ván là xin thua, và tiền đi ngay.
    app.does(other, { leave: true });
    await app.until(() => (app.mine(first) ?? {}).phase === 'over', 'the game to end');
    assert.equal(app.mine(first).over.over, 'resign');
    assert.equal(app.mine(first).gold, purse[first] + 5000, 'the one still sitting there is paid');
    assert.equal(app.mine(other).gold, purse[other] - 5000, 'and the one who left pays');
  }, { c1: ['u1'], c2: ['u2'] });
});

test('nothing a widget can send moves a piece the rules will not move', async () => {
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { chess: 'solo' });
    await app.until(() => (app.mine('u1').me?.moves ?? []).length > 0, 'a turn of my own');

    const table = app.mine('u1');
    const before = [...table.board];

    // Một quân của **đối phương**, tìm theo màu thật chứ không đoán theo ô: bên nào cầm quân gì
    // là rút thăm, nên một ô viết cứng có ngày là quân của chính mình và nước ấy hợp lệ.
    const theirs = before.findIndex((piece) => piece !== 0 && (piece & 8) !== table.me.side);
    assert.notEqual(theirs, -1, 'the other side has pieces');

    const nonsense = [
      { from: 0, to: 63 },                   // xe từ góc này sang góc kia, xuyên qua tất cả
      { from: -1, to: 5 },
      { from: 'e2', to: 'e4' },              // ô gọi bằng tên, không phải bằng số
      { from: 12, to: 12 },                  // đứng yên
      { from: theirs, to: theirs + 8 },      // quân của đối phương
      { from: 4, to: 6, promo: 5 },          // nhập thành khi đường chưa trống
      {},
    ];
    for (const bad of nonsense) app.does('u1', { move: bad });

    await nap(400);
    assert.deepEqual([...app.mine('u1').board], before,
      `one of ${JSON.stringify(nonsense)} moved a piece`);
    assert.ok(app.mine('u1').says, 'and a refused move says so rather than sitting there silent');
  });
});

test('a board hurried along by nobody still finishes', async () => {
  // Hết giờ thì máy đi hộ một nước — cùng lối với phỏm. Một cái bàn đứng im không phân biệt được
  // với một người đang nghĩ, mà bên kia thì đang đợi.
  ledger();
  await withBot(async (app) => {
    app.asks('u1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { chess: 'solo' });
    await app.until(() => (app.mine('u1').me?.moves ?? []).length > 0, 'a turn of my own');

    const was = app.mine('u1').last;
    // Không ai bấm gì cả. Đồng hồ một nước là hai giây trong test này.
    await app.until(() => app.mine('u1').last && app.mine('u1').last !== was,
      'the clock to move a piece');
    assert.ok(app.mine('u1').board, 'and the board is still a board');
  });
});


// ---- nhóm tay máy, cả đường dây ---------------------------------------------------------------
//
// Máy có ví, ngồi vào bàn chế độ người, cược thật. Cả mục này chạy con bot **thật** với nhóm bật
// lên, vì không một câu nào dưới đây trả lời được từ một hàm thuần: chúng là về việc ai ngồi
// xuống được, ai được trả tiền, ai được mở phiên, và ai có mặt trên bảng vàng.

/// Bật nhóm cho một cái test, rồi trả lại như cũ dù test đỏ hay xanh.
async function withHouse(many, run, { still = false } = {}) {
  const keys = ['TIENLEN_HOUSE', 'TIENLEN_HOUSE_COUNT', 'TIENLEN_HOUSE_AWAKE',
    'TIENLEN_HOUSE_TABLES', 'TIENLEN_HOUSE_WAITING'];
  const was = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  process.env.TIENLEN_HOUSE = '1';
  process.env.TIENLEN_HOUSE_COUNT = String(many);
  process.env.TIENLEN_HOUSE_AWAKE = String(many);
  // **Đóng băng tại chỗ**: nhóm có dòng trong sổ, có ví, nhưng không mở bàn nào cả. Cho những
  // câu hỏi không nói gì về việc chơi — một cái test đo hai lần cái ví của nhóm mà ở giữa có một
  // ván vừa tính tiền là một cái test đỏ ngẫu nhiên, và một cái đỏ ngẫu nhiên còn tệ hơn không
  // có test.
  if (still) {
    process.env.TIENLEN_HOUSE_TABLES = '0';
    process.env.TIENLEN_HOUSE_WAITING = '0';
  }

  try {
    return await run();
  } finally {
    process.env.TIENLEN_HOUSE = '0';
    for (const key of keys.slice(1)) {
      if (was[key] === undefined) delete process.env[key];
      else process.env[key] = was[key];
    }
  }
}

/// Đợi cho tới khi nhóm đã có dòng trong **sổ trên đĩa**.
///
/// `saveScores` hoãn hai giây trước khi ghi — cố ý, để mười cái bàn xong cùng lúc ghi một lần —
/// nên một cái test đọc file ngay sau khi bot khởi động sẽ đọc phải cuốn sổ trước lúc gieo.
const seeded = (app) =>
  app.until(() => Object.keys(ledgerRows()).some(isHouseId), 'nhóm được gieo vào sổ');

/// Sổ vàng, đọc thẳng từ đĩa. Bảng vàng chỉ trả về hai mươi hàng đầu, mà cái phải cộng lại là
/// **cả sổ** — một phép tổng trên hai mươi hàng đầu là một phép tổng không bắt được gì.
function ledgerRows() {
  return JSON.parse(readFileSync(LEDGER, 'utf8')).people;
}

/// Tổng vàng **cả sổ** — người thật và tay máy cộng lại.
///
/// Đọc từ đĩa chứ không từ bảng vàng: bảng chỉ trả hai mươi hàng đầu và lọc bỏ ai chưa đánh ván
/// nào, nên một phép tổng trên nó là một phép tổng không bắt được gì. Con số này chỉ được đổi
/// bởi ba cái vòi đã biết — vốn đầu, quà ngày, quảng cáo — và bởi hai cái bát. Một ván bài, dù
/// có tay máy ngồi hay không, **không được đổi nó một đồng nào**.
function totalGold() {
  return Object.values(ledgerRows()).reduce((sum, row) => sum + row.gold, 0);
}

const isHouseId = (id) => String(id).startsWith('house:');

test('tay máy ngồi vào bàn người thật mở, và ván ấy tính tiền như một bàn người', async () => {
  // Đây là cả điểm của nhóm: một người mở bàn bốn ghế ở một nhóm chat vắng vẫn có người ngồi
  // xuống cùng. Trước nhóm này thì cái bàn ấy đứng đó tới lúc bị quét.
  ledger();
  await withHouse(6, () => withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');

    // Mốc lấy **sau khi nhóm đã được gieo xuống sổ**, không phải trước. `saveScores` hoãn hai
    // giây — cố ý, để mười cái bàn xong cùng lúc ghi một lần — nên một phép tổng đọc sớm hơn thế
    // là một phép tổng trên cuốn sổ trước lúc gieo, và cái nó bắt được là chính món tiền gieo
    // chứ không phải một đồng nào bị in ra.
    await seeded(app);
    const before = totalGold();

    app.does('u1', { open: 4, stake: 1000 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'lobby', 'a table for four');

    // Nhóm tự tìm thấy nó và ngồi vào. Không ai bảo chúng cả — chúng đọc đúng cái danh sách bàn
    // mở mà một người nhìn thấy trên màn hình của họ.
    await app.until(() => (app.mine('u1').seats ?? []).length === 4, 'nhóm lấp đầy bàn');

    const seats = app.mine('u1').seats;
    assert.equal(seats.filter((one) => one.bot).length, 0,
      'không một cái ghế nào là máy đồ đạc — đây là bàn chế độ người');
    assert.equal(seats.filter((one) => isHouseId(one.id)).length, 3, 'ba tay máy');

    await app.until(() => (app.mine('u1') ?? {}).phase !== 'lobby', 'bàn tự chia');
    await playOut(app, ['u1'], 4_000);
    await app.until(() => (app.mine('u1') ?? {}).phase === 'over', 'ván xong');

    // **Bàn bốn người, không phải bàn một người đấu nhà cái.** Đây là chỗ nghĩa của một cái bàn
    // thật sự đổi khi tay máy ngồi vào: nếu chúng là `bot: true` thì `settlement` sẽ coi đây là
    // bàn một người và trả ở mức cố định `BOT_STAKE`, bỏ qua mức cược của phòng.
    const over = app.mine('u1');
    assert.equal(over.paid.length, 4, 'cả bốn người đều được trả, không ai là đồ đạc');
    assert.equal(over.stake, 1000);

    // Và tiền chỉ **chạy quanh bàn**, không sinh ra từ đâu.
    const moved = over.paid.reduce((sum, one) => sum + one.change, 0);
    assert.equal(moved, 0, `cái bàn làm ra ${moved} vàng từ không khí`);

    /**
     * Rồi cả cuốn sổ, sau khi ván **đã được ghi xuống**.
     *
     * Hai chuyện phải đợi, và cả hai đều là thiết kế chứ không phải chậm trễ:
     *
     * - **Người về nhất được trả ngay lúc về nhất**, còn người thua trả khi họ về. Nên giữa
     *   chừng một ván, cuốn sổ *đúng là* lệch — và đo đúng lúc ấy thì đọc ra thành "vàng sinh ra
     *   từ không khí". Cột `games` chỉ nhích lên khi cả ván đã tính xong, nên nó là cái mốc nói
     *   "ván này đã đóng sổ".
     * - `saveScores` hoãn hai giây, nên cái file còn đi sau cái ví trong bộ nhớ thêm một quãng.
     *
     * Và nhóm bị **đóng băng** ở cái test này (`still`) — không mở bàn nào khác — vì một ván
     * khác đang chạy ở đâu đó cũng lệch y như thế, và lúc ấy phép tổng trên cả cuốn sổ không trả
     * lời được câu nào.
     */
    await app.until(() => (ledgerRows().u1?.games ?? 0) > 0, 'ván được ghi xuống sổ');
    assert.equal(totalGold(), before,
      'cả cuốn sổ không đổi một đồng nào ngoài số đã chạy quanh bàn');
  }, { c1: ['u1'] }), { still: true });
});

test('tay máy không bao giờ được mở một phiên, và app không hề biết chúng tồn tại', async () => {
  // Chúng không có widget, không có màn hình, không có phiên. Mọi vòng đẩy trạng thái duyệt
  // `screens` nên chúng vốn đã bị bỏ qua — cái test này canh chiều ngược lại: không có chỗ nào
  // **xin** app mở phiên cho một cái id mà app chưa từng nghe tới.
  ledger();
  await withHouse(6, () => withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { open: 4, stake: 1000 });
    await app.until(() => (app.mine('u1').seats ?? []).length === 4, 'nhóm lấp đầy bàn');

    const asked = [...app.sessions.values()].flatMap((one) => one.userIds ?? []);
    assert.deepEqual(asked.filter(isHouseId), [], 'đã xin app mở phiên cho một tay máy');
    assert.deepEqual(app.pushes.filter((one) => isHouseId(one.to)), [],
      'đã đẩy trạng thái riêng cho một tay máy');
  }, { c1: ['u1'] }));
});

test('tay máy không lấy quà ngày và không xem quảng cáo — nhóm không có vòi nào riêng', async () => {
  // Đây là chỗ dễ in tiền nhất trong cả việc này, và nó im lặng: hai mươi bốn con nhân ba mươi
  // nghìn là bảy trăm hai mươi nghìn vàng **mới** mỗi ngày, chảy thẳng vào tay ai đánh thắng
  // chúng. Về cấu trúc thì đã không xảy ra được — hai đường ấy chỉ với tới qua `onWidgetAction`,
  // mà hàm ấy cần một màn hình — nhưng "không với tới được" là thứ một lần refactor làm mất.
  ledger();
  await withHouse(6, () => withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { open: 4, stake: 1000 });
    await app.until(() => (app.mine('u1').seats ?? []).length === 4, 'nhóm lấp đầy bàn');
    await app.until(() => (app.mine('u1') ?? {}).phase !== 'lobby', 'bàn tự chia');

    await seeded(app);
    for (const [id, row] of Object.entries(ledgerRows())) {
      if (!isHouseId(id)) continue;
      assert.equal(row.claimed, '', `${row.name} đã lấy quà ngày`);
      assert.equal(row.ads, 0, `${row.name} đã xem quảng cáo`);
      assert.equal(row.gave, 0, `${row.name} đã phát công đức`);
    }
  }, { c1: ['u1'] }), { still: true });
});

test('công đức chia cho người, không chia cho máy', async () => {
  // `giveAll` chia cho **cả sổ trừ chính mình**, nên hai mươi bốn dòng tay máy là hai mươi bốn
  // suất ăn vào mỗi món quà của mỗi người thật. Không phải chuyện trung thực — chuyện máy vào
  // chơi đã nói ra rồi — mà là chuyện kinh tế: công đức là đường duy nhất vàng đi từ ví người
  // này sang ví người khác mà không qua một ván nào, và để một phần chảy vào pot của nhà là vàng
  // người chơi rò sang nhà, không được lại gì.
  //
  // Sàn công đức là một trăm nghìn, mà vốn đầu cộng quà ngày mới được tám mươi — nên người phát
  // phải được dựng sẵn một cái ví đủ, không thì thứ cái test này bắt được chỉ là lời từ chối.
  ledger({ u1: { gold: 500_000 } });
  await withHouse(6, () => withBot(async (app) => {
    for (const [id, room] of [['u1', 'c1'], ['u2', 'c2']]) {
      app.asks(id, room);
      await app.until(() => app.mine(id), `a screen for ${id}`);
      await claim(app, id);
    }
    await seeded(app);

    const houseBefore = Object.entries(ledgerRows())
      .filter(([id]) => isHouseId(id))
      .reduce((sum, [, row]) => sum + row.gold, 0);
    assert.ok(houseBefore > 0, 'nhóm phải đã được gieo trước khi hỏi câu này');

    const had = app.mine('u2').gold;
    app.does('u1', { give: 100_000 });
    await app.until(() => app.mine('u2').gold > had, 'u2 nhận được phần của mình');

    // Đợi món quà **xuống tới đĩa** rồi mới đọc. `saveScores` hoãn hai giây, nên đọc ngay là đọc
    // cuốn sổ trước lúc phát — và cái đỏ nó cho ra nói về cái đồng hồ, không về món quà.
    await app.until(() => ledgerRows().u1?.gave === 100_000, 'món quà xuống tới sổ');

    const rows = ledgerRows();
    const houseAfter = Object.entries(rows)
      .filter(([id]) => isHouseId(id))
      .reduce((sum, [, row]) => sum + row.gold, 0);
    assert.equal(houseAfter, houseBefore, 'một phần món quà đã chảy vào pot của nhà');
  }, { c1: ['u1'], c2: ['u2'] }), { still: true });
});

test('bảng vàng biết hàng nào là máy, dù không vẽ nó ra', async () => {
  // Cái dấu "máy" cạnh tên **đã bỏ** — chủ sòng quyết thế, và chuyện máy vào chơi đã nói ra công
  // khai từ trước nên nó không phải chỗ duy nhất để nói.
  //
  // Nhưng cái cờ vẫn đi kèm mỗi hàng, và cái test này vẫn canh nó, vì cột ấy là thứ trả lời được
  // câu "nhà đang lãi hay lỗ" mà không phải đi tra từng id — và vào cái ngày ai đó muốn vẽ nó ra
  // lần nữa thì thứ phải làm là một dòng ở trang, không phải một vòng đi sửa lại cả đường dây.
  ledger();
  await withHouse(6, () => withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { open: 4, stake: 1000 });
    await app.until(() => (app.mine('u1').seats ?? []).length === 4, 'nhóm lấp đầy bàn');
    await app.until(() => (app.mine('u1') ?? {}).phase !== 'lobby', 'bàn tự chia');
    await playOut(app, ['u1'], 4_000);

    app.does('u1', { leave: true });
    await app.until(() => app.mine('u1').phase === 'choosing', 'về sảnh');
    // Bảng vàng đi kèm mọi lần đẩy màn hình sảnh, không phải sau một cái nút — nên chỉ cần về
    // tới sảnh là nó có ở đó.
    await app.until(() => Array.isArray(app.mine('u1').table)
      && app.mine('u1').table.length > 0, 'bảng vàng');

    const rows = app.mine('u1').table;
    assert.ok(rows.some((one) => isHouseId(one.id)), 'nhóm đã đánh mà không có mặt trên bảng');
    for (const one of rows) {
      assert.equal(one.house, isHouseId(one.id),
        `hàng "${one.name}" gắn nhãn sai: house=${one.house}`);
    }
  }, { c1: ['u1'] }));
});

test('tắt nhóm bằng một biến là tắt sạch — không dòng nào vào sổ, không ai ngồi xuống', async () => {
  // Một thứ chạy tự động, đụng vào ví người thật, và chỉ tắt được bằng một lần deploy là một thứ
  // không tắt được vào lúc ba giờ sáng — mà ba giờ sáng là lúc người ta cần tắt nó.
  ledger();
  await withBot(async (app) => {
    app.asks('u1', 'c1');
    await app.until(() => app.mine('u1'), 'a screen');
    await claim(app, 'u1');
    app.does('u1', { open: 4, stake: 1000 });
    await app.until(() => (app.mine('u1') ?? {}).phase === 'lobby', 'a table');

    await nap(600);
    assert.equal(app.mine('u1').seats.length, 1, 'có con nào ngồi xuống trong lúc nhóm đang tắt');
    assert.deepEqual(Object.keys(ledgerRows()).filter(isHouseId), [],
      'có dòng tay máy trong sổ trong lúc nhóm đang tắt');
  }, { c1: ['u1'] });
});
