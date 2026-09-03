/**
 * Vàng: ai được bao nhiêu, cược thế nào, và một ván chia tiền ra sao.
 *
 * Thuần và không biết gì về mạng: mọi thứ ở đây nhận vào bài hoặc số và trả về bài hoặc số.
 * Đó là lý do nó tách ra khỏi `tienlenbot.mjs` — một luật chơi kiểm được bằng một phép gọi hàm
 * là một luật chơi kiểm được, còn một luật chơi chỉ kiểm được qua một cái bàn đang chạy thì
 * không.
 */

import { PLACES, placeName } from './rules/tienlen.mjs';

/// What somebody has the first time they open this.
///
/// Enough to sit down at anything on the list and lose a couple of hands without being sent to
/// an advertisement — a first table that has to be paid for before it can be played is a game
/// nobody gets to the middle of.
///
/// **Given once and marked.** Raising it does not top anybody up: `rowFor` hands it over the
/// first time somebody is seen and writes `started` down, so everybody already playing keeps
/// what they have. Only the next person through the door gets the new number.
export const STARTING_GOLD = 50_000;

/// What turning up is worth, once a day.
export const DAILY_GOLD = 30_000;

/// What a table against the machines is played for.
///
/// Fixed, and deliberately not the room's stake. A table anybody can open at any stake and then
/// fill with machines is a table that prints gold — the machines do not mind what they lose.
///
/// The ladder scales with it on its own: `payouts` is a share of one stake, so nhất takes this
/// and nhì takes half of it whatever this number is. So does a board game, where the winner
/// takes exactly one of these off the loser.
export const BOT_STAKE = 10_000;

/// The three a table can be opened at with one tap. Anything between the floor and the ceiling
/// can be typed instead — these are the common answers, not the only ones.
export const STAKES = [1_000, 5_000, 20_000];

/// The floor and the ceiling for a table between people.
///
/// A floor because a table for nothing is not a table. A ceiling because the number arrives
/// from a page anybody can edit, and a stake nobody could ever cover is a room on everybody's
/// list that nobody can sit at.
export const MIN_STAKE = 1_000;
export const MAX_STAKE = 1_000_000;

/// What somebody may open a table at, whatever they typed.
export function asStake(asked) {
  const want = Math.round(Number(asked));
  if (!Number.isFinite(want)) return MIN_STAKE;
  return Math.max(MIN_STAKE, Math.min(MAX_STAKE, want));
}

/// The advertisement: how long it runs, what it pays, and how many in a day.
///
/// The ten seconds are counted here and not in the page. A widget is a file anybody can edit,
/// so a countdown it runs is a countdown it can skip — the page shows the clock and the bot
/// decides whether it ran.
///
/// **What it pays is its own number, and no longer one hand against the machines.**
///
/// It used to be defined as `BOT_STAKE`, on the argument that an advertisement exists to buy
/// one hand back and one that buys less has not done its job. That argument held while a
/// machine table cost four thousand. At ten it does not: an advertisement worth ten thousand is
/// a third of a day's gold for ten seconds, and the day's gold is the thing people are meant to
/// come back for.
///
/// So eight thousand, and what it buys is stated plainly rather than implied: **eight of the
/// cheapest tables on the list**, a long run at either bowl, or most of a hand against the
/// machine — two of them and you are back at one, with change. Ten seconds a time is still the
/// rationing, and it is the only rationing that matters.
///
/// The floor it must clear is `MIN_STAKE`, not `BOT_STAKE`: below the cheapest stake there is
/// genuinely nothing to sit at, and an advertisement that leaves somebody there has helped
/// nobody. Above it, how much is a matter of taste. There is a test on the floor and on the
/// ceiling — a run back to a machine table longer than four advertisements would be a errand
/// rather than a way back.
///
/// The count is deliberately huge. It is not there to ration anything — ten seconds a time is
/// the rationing, and somebody willing to sit through a thousand of them has earned whatever
/// that comes to. It is there so a bug in the counting cannot run away with the ledger.
export const ADS_MS = Number(process.env.TIENLEN_ADS_MS ?? 10_000);
export const ADS_GOLD = 8_000;
export const ADS_PER_DAY = 1_000;

/// Below this there is no table anybody can sit at — and now it says so literally.
///
/// It used to be `BOT_STAKE`, which read as "cannot afford the machine table". That was near
/// enough while the two numbers were four thousand and one thousand apart; at ten thousand it
/// would call somebody broke who can still sit at four tables on the list and at either bowl.
/// The cheapest thing anybody can sit at is one stake, so that is the number.
export const BROKE = MIN_STAKE;

/**
 * What each place takes, as a share of one stake.
 *
 * First takes a stake off last; at a full table second takes half a one off third. It adds to
 * nothing — gold moves between the people at the table and none is made — which is the only
 * shape that stays sane when the same four people play all evening.
 *
 * The middle of an odd table breaks even, because second of three is neither winning nor
 * losing and paying it either way would make one of those a lie.
 */
export function payouts(count) {
  if (count === 2) return [1, -1];
  if (count === 3) return [1, 0, -1];
  if (count >= 4) return [1, 0.5, -0.5, -1];
  return [0];
}

/// The day, in Vietnam.
///
/// A day that turns over in UTC turns over at seven in the morning here, so somebody playing
/// after dinner gets tomorrow's gold and somebody playing at breakfast does not get today's.
export const dayIn = (at = Date.now()) =>
  new Date(at + 7 * 3600_000).toISOString().slice(0, 10);

/// Gold, written the way it is read here: 12.500.
export function gold(amount) {
  const digits = String(Math.abs(Math.round(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (amount < 0 ? '-' : '') + digits;
}

/**
 * Who pays whom at the end of a table, and how much.
 *
 * Two different tables wearing the same clothes, and the difference is how many people are at
 * them.
 *
 * **Two or more people**: played for the room's stake, between the people, in the order they
 * went out. The machines sitting in the empty seats are furniture — whoever went out first of
 * the people has won, whatever the machines did, so two people and two machines is a table of
 * two and first takes a stake off second.
 *
 * **One person**: a table against the machines, whatever it was opened as. The ranking is the
 * whole table, and the stake is the house's rather than the room's.
 *
 * Pure, and given the seats rather than a game, because this is the part that is worth being
 * able to run a hundred finishing orders through without a chat anywhere near it.
 */
export function settlement(seats, finished, stake, extra = {}) {
  const people = seats.filter((one) => !one.bot);
  if (!people.length) return [];

  // How many are being paid comes from who is *at* the table, not from who has finished — so
  // this answers the same way after one person is out as it will at the end. That is what lets
  // the table show somebody what they won at the moment they won it rather than a minute later
  // when the last two have stopped arguing over a pair of threes.
  const alone = people.length < 2;
  const share = payouts(alone ? seats.length : people.length);
  const worth = alone ? BOT_STAKE : stake;

  const order = finished.map((seat) => seats[seat]).filter(Boolean);
  const ranked = alone ? order : order.filter((one) => !one.bot);

  const paid = [];
  const at = new Map();
  const put = (who, place, change) => {
    const row = {
      userId: who.userId,
      displayName: who.displayName,
      // Where they came *among the people who are being paid*, which at a table of two people
      // and two machines is first or second and never third.
      place,
      change,
      // What the money is made of, so a screen can say why rather than only how much.
      placing: change,
      chop: 0,
      rot: 0,
      blanche: 0,
      owes: 0,
    };
    paid.push(row);
    at.set(who.userId, row);
    return row;
  };

  ranked.forEach((who, place) => {
    if (who.bot) return;
    put(who, placeName(place, alone ? seats.length : people.length),
      Math.round((share[place] ?? 0) * worth));
  });

  // Anybody who has not finished yet still has money moving around them — a chặt is paid the
  // moment it happens, not at the end — so they need a row before the extras are added.
  for (const who of people) {
    if (!at.has(who.userId)) put(who, '', 0).placing = 0;
  }

  const { chops, rot, blanche, owes } = extra;

  // Chặt. Already worked out as it happened and already zero-sum: `chops` is a plain map of
  // what each person is up or down on cutting and being cut.
  if (chops) {
    for (const [userId, amount] of chops) {
      const row = at.get(userId);
      if (row) { row.chop = Math.round(amount * worth); row.change += row.chop; }
    }
  }

  // Thối. What is still in a losing hand goes to whoever went out first. Counted here rather
  // than as it happens because it is a fact about the end of the hand and about nothing else.
  if (rot && rot.size) {
    const first = paid.find((one) => one.place === PLACES[0]);
    let total = 0;
    for (const [userId, amount] of rot) {
      const row = at.get(userId);
      if (!row || (first && row.userId === first.userId)) continue;
      row.rot = -Math.round(amount * worth);
      row.change += row.rot;
      total -= row.rot;
    }
    if (first) { first.rot += total; first.change += total; }
  }

  // Tới trắng. Every other person pays three times the stake, and there is no placing money at
  // all — nobody played, so there is nothing to place.
  if (blanche) {
    const winner = at.get(blanche);
    if (winner) {
      const others = alone
        ? seats.filter((one) => one.bot).length
        : people.filter((one) => one.userId !== blanche).length;
      for (const row of paid) {
        row.placing = 0;
        row.chop = 0;
        row.rot = 0;
        row.change = 0;
      }
      winner.blanche = BLANCHE * worth * others;
      winner.change = winner.blanche;
      winner.place = PLACES[0];
      for (const row of paid) {
        if (row.userId === blanche) continue;
        row.blanche = -BLANCHE * worth;
        row.change = row.blanche;
      }
    }
  }

  // Đền. One person pays the whole table's placing money instead of the losers paying it. What
  // they were up or down on chặt and thối is theirs and stays — those are things they did, and
  // đền is about the hand as a whole.
  if (owes) {
    const owing = at.get(owes);
    if (owing) {
      // What the winners are owed, and one person owing all of it.
      //
      // Written as "the payer pays the winners" rather than "the payer takes on the losers'
      // debts", because those two are only the same arithmetic while the payer is losing. The
      // first version did the second, and a hand where the person đền had *won* their place
      // made a thousand gold out of nothing — caught by the zero-sum test on the phỏm side,
      // where the same shape of mistake was sitting in the same shape of code.
      let owed = 0;
      for (const row of paid) {
        if (row.userId === owes) continue;
        if (row.placing > 0) { owed += row.placing; continue; }
        if (row.placing < 0) { row.change -= row.placing; row.owes = -row.placing; row.placing = 0; }
      }
      owing.change += -owed - owing.placing;
      owing.owes = -owed - owing.placing;
      owing.placing = -owed;
    }
  }

  return paid;
}

/// What a hand nobody had to play for is worth, from each person at the table.
export const BLANCHE = 3;
