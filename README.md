# tienlenbot

A bot for [Cúc Cu](https://kuku.vn) with two games in it: **tiến lên miền nam** and **bầu cua
tôm cá**, played in a group chat for one purse of gold.

Live as **`@tienlenbot`** on `kuku.vn`, running as its own service beside `@carobot`. It is not
published yet, so only its owner can add it to a conversation — see
[docs/operations.md](docs/operations.md#chưa-công-khai). Say
`@tienlen` or `/tienlen` in a room and a table opens in a floating frame in the conversation.

**Tiến lên**

- **Đấu với máy** — sit down straight away at a table of two, three or four, the empty seats
  filled by machines.
- **Tạo bàn** — open a table for two, three or four at a stake of your choosing. It goes on the
  world list, so somebody in a completely different group finds it and takes a seat; a full
  table deals itself.

**Bầu cua tôm cá**

- **Sòng thế giới** — one bowl for everybody, always throwing. Nobody opens it and nobody
  starts it: walk in, and when the twenty-five second window is open, put chips down. Whoever
  else is in it can be in any group.
- **Chơi một mình** — a private bowl where you throw when you like.

A stake on a face comes back with as much again for every die showing it, and goes if none of
them do. Nothing is taken from anybody's purse until the dice land. The bowl is covered when it
stops: drag the plate off to see how it went — and until you do, nothing gives it away, not the
purse and not the mat. **Soi cầu** is the last thirty throws, six rows and a column a throw,
newest on the left.

Every hand is played for gold. Turning up is worth 10.000 a day, a table against the machines
pays 2.000 for coming first and takes 2.000 off whoever comes last, and a table between people
is played for whatever the room was opened at. The board is the world's, counted in gold.

Written against the widget half of the bot platform: the rules and the deck live in the bot,
and the page in the frame draws what it is told. `bots/carobot` in the Cúc Cu repository is the
same shape for a game of caro, and this is what that shape looks like when the state is secret.

## Two things worth reading first

### A session belongs to a person, not to a table

This is the load-bearing decision in the file.

A widget session belongs to a conversation, and `showSession` refuses to open one for somebody
who is not in that conversation — rightly, or any bot could put a strange room's screen in front
of anybody. So a table with a session of its own is a table **only its own room can ever play
at**, and "find a table anywhere" is impossible.

Here a session belongs to a *person*, in that person's own room, and follows them: the lobby,
then whichever table they sat down at, then the lobby again. A table is pushed into as many
sessions as there are people at it, and those people can be in four different groups. Nothing
crosses a room; only the picture of the table travels.

It also removes `setSessionPlayers` entirely — a session has exactly one player, its owner —
which means `role` on an incoming action says nothing, and every check is against the seat this
bot dealt rather than against what the frame reports.

Carobot solves the same problem the other way, by mirroring one board's state into another
board's session. That works and is more machinery: five places have to agree, and the widget
needs a whole spectating mode.

### Nobody is ever sent anybody else's hand

`pushState` without `to` goes to everybody watching and carries how many cards each seat is
holding; `pushState` with `to` goes to one person and carries theirs. A bot that sent every hand to everybody would look identical from
the outside and be cheatable by anybody who opened the network tab — so there is a test that
reads the source and fails if a hand ever appears in the push that goes to the room.

The private push is a **complete state**, not a patch. The server remembers the last thing each
person was sent and prefers their own over the shared one when they open the widget late, so a
private push carrying only a hand would show somebody a hand and an empty table.

## The shell

The frame is about 390 by 640 on a phone and never the whole screen, so what is on it is
decided rather than laid out and hoped for:

| | |
| --- | --- |
| Top | Who is looking and **what is in the purse** — on every screen, from the first frame. The gold is what the whole game is played for, and hunting for it is not a thing anybody should have to do. A `+` appears there when there is no table left to sit at, so the way back is reachable from wherever they are |
| Middle | One of four: choosing, the list of tables, the board, or a table |
| Choosing | **One question at a time.** Two ways in, then how many seats, then what for — each screen three or four things to read. Laying the whole of it out at once was eleven buttons on the first thing anybody ever sees |
| Bottom | Where to go, at the thumb — and in a game, what to do, because in a game there is one thing on this frame and it is the game |

A few things that are the way they are on purpose:

- The purse is **written into elements that are already there** rather than replaced. A bar that
  arrives a beat late jogs the whole page down as it lands, and the chip that floats off the
  number is measured against that number.
- The menu centres itself with `justify-content: safe center`. Plain `center` on a scrolling box
  puts the overflow *above* the scroll origin where it cannot be reached — the line saying
  somebody had just been given ten thousand was cut off the top with no way to scroll to it.
- A waiting room says whose table it is, what it costs, and how many seats are left, and the
  person who cannot start it is **told** rather than given a dark button. A disabled button
  saying "waiting" is a thing people tap at until they give up.
- `tools/css-check.mjs` exists because a search-and-replace quietly ate the whole advertisement
  screen's styling and the only thing that noticed was a screenshot.

## The gold

| | |
| --- | --- |
| Starting purse | **20.000**, once, the first time somebody opens it. Enough to sit down at anything on the list and lose a couple of hands without being sent to an advertisement |
| Turning up | **+10.000** a day, **taken by pressing for it** rather than credited on the way in. The day turns over at midnight in Vietnam, not in UTC |
| A table against the machines | Fixed **4.000** a stake, whatever the table was opened at. Nhất +4.000, nhì +2.000, ba −2.000, bét −4.000 |
| A table between people | Whatever the room was opened at — **1.000** to 1.000.000, and never more than the opener has. Three presets for the common answers, and a field for anything else |
| More gold | A ten second advertisement, worth **4.000**, behind the `+` beside the purse at any balance. The daily cap is a thousand, which is a guard against a counting bug rather than a ration — ten seconds a time is the ration |
| The board | Gold, the world's, everybody |

**One person is one purse.** The ledger is keyed by the person and by nothing else — not the
room, not the screen, not the session. Somebody in five groups has one pile of gold and one
place on the board, and walking into another group carries the table they were sitting at with
them.

**It adds to nothing.** `payouts` gives first a stake off last and, at a full table, second half
a one off third; the middle of an odd table breaks even. The ladder is a *share of one stake*,
so raising what a table costs raises everything about it at once. Gold moves between the people at the
table and none is made, which is the only shape that stays sane when the same four people play
all evening.

**The machines are furniture.** At a table with two people and two machines, whoever of the two
*people* went out first has won a stake off the other — whatever the machines did in between.
And a table with only one person at it is played against the house at the fixed stake, whatever
stake the room carries: otherwise a table opened at fifty thousand and filled with machines
prints gold.

**A place is paid the moment it is taken**, not when the table empties. Going out *is* the win —
the place is fixed and the gold is decided the instant the last card leaves somebody's hand, so
they are paid there and can put the table down and go. Making somebody who came first sit
through however long the other three take is the game holding on to a player it has finished
with, and the only button on that screen used to be one that forfeited the hand they had just
won.

**Leaving with cards still in hand is coming last**, and is charged for. Leaving with none is
not leaving at all. The two are different buttons saying different things — `Bỏ ván` and
`Về sảnh` — because they cost different amounts.

**The stake is taken before sitting down**, not after losing. Otherwise one stake's worth of
gold plays four tables at once and loses all four. Nobody goes into debt.

**An advertisement pays exactly one hand against the machines**, and that is not a coincidence:
it exists to get somebody who has run out back to a table, and one that leaves them still short
of the cheapest thing on the screen has not done its job.

**The ten seconds of the advertisement are counted by the bot.** The page draws the clock; a
claim that arrives early is refused. A countdown a widget runs is a countdown a widget can skip,
because a widget is a file anybody can edit.

## Layout

| | |
| --- | --- |
| `bots/tienlenbot/tienlenbot.mjs` | The whole bot. One file, no dependencies, three Node built-ins and `fetch` |
| `bots/tienlenbot/widget/` | The page in the frame — `index.html`, `style.css`, `tienlen.js`, `faces.js` |
| `bots/tienlenbot/tienlenbot.test.mjs` | The rules, played out over a few hundred dealt hands |
| `bots/tienlenbot/tienlenbot.flow.test.mjs` | The bot, end to end against a stand-in for the app |
| `tools/play.mjs` | The bot and its widget, playable in a browser with no token and no phone |
| `tools/css-check.mjs` | Every id and class the page draws, checked against the stylesheet |
| `deploy/` | The systemd unit and the script that puts it on a server |
| `docs/design.md` | Why it is built the way it is, and every place it was wrong first |
| `docs/operations.md` | What runs where, how to deploy it, and what to do when it breaks |

The two documents under `docs/` are in Vietnamese: they are for whoever is operating this at
three in the morning, and that is not the same reader as the code.

## Running it

1. Make a bot at [kuku.vn/bot](https://kuku.vn/bot) and copy the token. It is shown once.
2. Upload the widget — a bot with no widget cannot open a session at all:

   ```bash
   cd bots/tienlenbot/widget && zip -qr /tmp/w.zip . && \
     curl -X POST https://api-bot.kuku.vn/setWidget \
       -H "Authorization: Bearer $ZEPLAO_BOT_TOKEN" \
       -H 'Content-Type: application/zip' --data-binary @/tmp/w.zip
   ```
3. `ZEPLAO_BOT_TOKEN=... node bots/tienlenbot/tienlenbot.mjs`
4. In a group, type `@bot`, add yours, then say `/tienlen`.

`ZEPLAO_BOT_API` points it at something other than production. `TIENLEN_SCORES` says where the
table of who has won what is kept (`/app/data/scores.json` by default, which is the path inside
the container the unit file runs).

## Seeing it without a phone

```bash
node tools/play.mjs        # then open http://localhost:8787
```

Two frames at the size a phone gives a widget, which are two people in the same room. The bot
runs unmodified in the same process; what stands in for Cúc Cu is a `Map` of sessions and an
event stream, and `zeplao.js` — the file the platform writes into every bundle at upload — is
served from there instead of by a phone.

The two frames are **two people in two different groups**, and the stand-in refuses to open a
session for somebody outside its conversation exactly as the real server does — so if the two
frames can play together there, they can play together.

**Chơi ngay** on the left for a table against machines. **Mở bàn** on the left and then **Bàn →
Vào** on the right for a table across the two groups; a table for two deals itself the moment
the second seat is taken.

The stand-in is not the platform. Sessions there are a `Map` and it enforces things this does
not — but it remembers the last state pushed to each person the way the real one does, because
a bot pushes the table *before* it asks for the frame to be opened and without that the first
push lands before anybody is listening.

## Tests

```bash
cd bots/tienlenbot && npm test
```

Both suites, no network, about a second. The second one starts an HTTP server that answers the
twelve methods this bot calls and writes down everything it was sent, so the assertions are
about what actually went over the wire — a table dealing itself when the last seat is taken,
a hand reaching one person and not the room, a viewer's move being refused.

## Deploying

```bash
deploy/deploy-bot.sh
```

Tests, uploads the file, uploads the widget, writes the unit, restarts it, reads back what the
bot said on the way up. The token lives in `/opt/zeplao/tienlenbot/.env` on the server, mode
600, and is never in git. The full account of it is in
[docs/operations.md](docs/operations.md).

The widget goes up **before** the restart, on purpose: a session pins the bundle it was made
with, so an author uploading mid-game does not change the table under four people playing on
it. The other order leaves the new bot handing out tables pinned to the old bundle for the
second it takes to come up.

## The rules it plays

Thirteen cards each, however many are sitting down; the rest of the deck stays in the box.
Whoever holds the lowest card in play opens and has to open with it — the three of spades at a
full table, and whatever was dealt in its place at a short one.

Rác, đôi, sám cô, tứ quý, sảnh from three, đôi thông from three pairs. No 2 in a run of either
kind. Same shape and same length answers, higher card wins, and the suit — bích, chuồn, rô, cơ —
breaks a tie.

Chặt: ba đôi thông cuts a lone 2; tứ quý cuts a lone 2, a pair of them and ba đôi thông; bốn
đôi thông cuts all of those and tứ quý. Nothing cuts bốn đôi thông but a bigger one.

Passing puts you out of the round. When nobody is left to answer, whoever played last leads
again — or, if that was their last card, the seat after them. Everybody who goes out gets a
place, whoever is still holding cards comes last, and so does anybody who walked out.

**Not in this version:** tới trắng (a hand that wins on the deal), thối 2, and betting.

## What is deliberately not here

- **A widget that knows anything.** The page checks a selection before lighting the button,
  because a button that is lit and then silently does nothing is worse than one that says why
  it is dark. Every play is checked again by the bot against the hand it dealt, and the bot is
  the only side of this a player cannot edit.
- **A per-group leaderboard.** It stopped meaning anything the moment tables stopped belonging
  to groups: two people at the same table can be in two rooms, so a room's board would count
  the same hand for one of them and not the other.
- **A real advertisement.** The screen says ADS and counts to ten. What is real is the part that
  matters — where the ten seconds are counted, and what stops somebody claiming twice.
