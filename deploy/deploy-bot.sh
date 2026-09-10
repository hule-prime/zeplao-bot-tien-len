#!/usr/bin/env bash
# Puts the bot on the server as its own service.
#
#   deploy/deploy-bot.sh [tienlenbot]
#
# Separate from anything that deploys the API, on purpose. A bot is a client of the public API:
# it has no share in the blue-green handover, nothing waits for it, and a deploy of the API
# neither restarts it nor is delayed by it. That separation is the whole reason it is deployed
# rather than just written down — a bot that could take the API with it would not be a bot, it
# would be a feature.
#
# The token lives in /opt/zeplao/<bot>/.env on the server and is never in git. Make one at
# https://kuku.vn/bot and write it there once:
#
#   ZEPLAO_BOT_TOKEN=<the token>
set -euo pipefail

BOT=${1:-tienlenbot}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$ROOT/bots/$BOT" ]; then
  echo "no bot called $BOT — bots/ has: $(ls "$ROOT/bots")" >&2
  exit 2
fi

# Where the server is, and how to reach it. No defaults, on purpose.
#
# They used to be written in here. This repository is public, and an address with a port beside
# it is a door somebody else can knock on — the address is not a secret worth much, but it is
# not worth publishing either, and nothing about a deploy script needs it in the open.
#
# Put them in deploy/.env, which git ignores:
#
#   ZEPLAO_HOST=root@<address>
#   ZEPLAO_SSH_PORT=<port>
#   ZEPLAO_SSH_KEY=~/.ssh/<key>
[ -f "$ROOT/deploy/.env" ] && . "$ROOT/deploy/.env"

SSH_KEY=${ZEPLAO_SSH_KEY:?set it in deploy/.env}
SSH_PORT=${ZEPLAO_SSH_PORT:?set it in deploy/.env}
HOST=${ZEPLAO_HOST:?set it in deploy/.env}
SSH_KEY=${SSH_KEY/#\~/$HOME}

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
remote() { ssh -i "$SSH_KEY" -p "$SSH_PORT" "$HOST" "$@"; }

step "test"
( cd "$ROOT/bots/$BOT" && npm test --silent )

step "upload"
# data/ is the bot's own and survives every deploy. Made here rather than by the bot, because a
# container cannot create its own bind mount.
remote "mkdir -p /opt/zeplao/$BOT/data"
# The ledger, before anything is touched.
#
# It is the one thing here that cannot be rebuilt: who has how much gold, and how they got it.
# Every other file on that server is a copy of a file in this repository. A dated copy costs
# nothing and is the difference between a bad deploy and a bad afternoon.
remote "mkdir -p /opt/zeplao/backup
  if [ -f /opt/zeplao/$BOT/data/scores.json ]; then
    cp -a /opt/zeplao/$BOT/data/scores.json \
      /opt/zeplao/backup/$BOT-scores-\$(date +%Y%m%d-%H%M%S).json
    ls -t /opt/zeplao/backup/$BOT-scores-*.json | tail -n +31 | xargs -r rm --
    echo \"sổ vàng: \$(wc -c < /opt/zeplao/$BOT/data/scores.json) byte, đã sao lưu\"
  fi"

# Everything the bot imports, not a list of files.
#
# It used to name two files. Then the rules moved into `rules/` and `economy.mjs`, and a deploy
# that copies the entry point without what it imports leaves a bot that runs fine on the machine
# it was written on and dies on the server with ERR_MODULE_NOT_FOUND — at the *next* restart,
# which may be days later and will look like anything but a deploy. So: the whole directory,
# minus the parts that are not the bot.
#
# **No `--delete`.** It was there for a day and it deleted the bot's token: `.env` lives on the
# server and nowhere else, so from rsync's side it was a file the source did not have. Nothing
# here needs deleting — a file left behind by an older version is inert, and the cost of that is
# nothing next to the cost of removing something only the server has. The two things only the
# server has are named again below anyway, because a rule you can only get right by remembering
# is a rule that gets got wrong.
rsync -a \
  --exclude 'widget/' --exclude 'node_modules/' --exclude '*.test.mjs' \
  --exclude 'data/' --exclude '.env' \
  -e "ssh -i $SSH_KEY -p $SSH_PORT" \
  "$ROOT/bots/$BOT/" "$HOST:/opt/zeplao/$BOT/"

# What the server owns, still owned. Checked rather than assumed: the deploy that deleted the
# token reported success at every step it had, and only fell over three steps later reading a
# file that was no longer there.
remote "test -s /opt/zeplao/$BOT/.env || { echo 'MẤT .env — token của bot không còn'; exit 1; }
  test -d /opt/zeplao/$BOT/data || { echo 'MẤT data/ — sổ vàng không còn'; exit 1; }
  echo 'token và sổ vàng còn nguyên'"

# And the ledger is still writable from inside the container.
#
# Read-only on the code and writable on data/ is two mounts stacked, and stacking them the wrong
# way round gives a bot that runs, plays, pays — and loses every gold it paid the moment it
# restarts. Nothing about that shows up in a log until somebody notices their purse went
# backwards. Checked after every start, because it costs one line.
after_start() {
  remote "docker exec zeplao-$BOT sh -c 'touch /app/data/.probe && rm /app/data/.probe' \
      || { echo 'SỔ VÀNG KHÔNG GHI ĐƯỢC — mount sai chiều'; exit 1; }
    echo 'sổ vàng ghi được'"
}

# Every module it imports, resolved on the server, before it is asked to serve anybody.
#
# A missing file is the one deploy fault that hides: the process starts, the loop runs, and the
# import that is not there is only reached at the next restart. Importing the entry point here
# walks the whole graph in one go, in the container the bot runs in, and fails the deploy rather
# than the night.
remote "docker run --rm -v /opt/zeplao/$BOT:/app -w /app node:22-alpine \
  node -e 'import(\"/app/$BOT.mjs\").then(() => console.log(\"imports ok\"))'"

step "unit"
scp -q -i "$SSH_KEY" -P "$SSH_PORT" \
  "$ROOT/deploy/zeplao-$BOT.service" \
  "$HOST:/etc/systemd/system/zeplao-$BOT.service"

# The widget, through the same endpoint any author would use from their own machine. There is
# no inside route, and a deploy that used one would be testing something nobody else can do.
#
# Before the restart, not after. A session pins the bundle it was made with, on purpose: an
# author uploading mid-game must not change the table under four people playing on it. That
# makes the order here load-bearing — the other way round, the new bot comes up and hands out
# tables pinned to the *old* bundle for as long as it takes the upload to finish.
if [ -d "$ROOT/bots/$BOT/widget" ]; then
  step "widget"
  TOKEN=$(remote "grep -o 'ZEPLAO_BOT_TOKEN=.*' /opt/zeplao/$BOT/.env | cut -d= -f2-")
  # The bot long-polls through api-bot.kuku.vn, but the app opens hosted widget files through
  # its own API base: https://kuku.vn/api/widgets/...
  #
  # Uploading the bundle to api-bot updates the bot row but leaves the app API without the
  # files, so the frame pins a fresh version and then gets 404 for index.html: a blank widget.
  # Do this once through the canonical app origin. Uploading several origins in sequence makes
  # several widget versions, and a user who opens one of the intermediate versions can be pinned
  # to a bundle whose files are only half visible through their browser's origin.
  WIDGET_API=${ZEPLAO_WIDGET_API:-https://kuku.vn/api/bot}
  ZIP=$(mktemp -t widget-XXXXXX).zip
  ( cd "$ROOT/bots/$BOT/widget" && zip -qr "$ZIP" . )
  WIDGET_JSON=$(curl -sS -X POST "$WIDGET_API/setWidget" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/zip' \
    --data-binary "@$ZIP")
  echo "$WIDGET_JSON"
  rm -f "$ZIP"

  WIDGET_VERSION=$(node -e '
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => {
      const widget = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Number.isInteger(widget.version)) process.exit(2);
      process.stdout.write(String(widget.version));
    });
  ' <<<"$WIDGET_JSON")
  BOT_ID=$(curl -sS "$WIDGET_API/getMe" -H "Authorization: Bearer $TOKEN" \
    | node -e '
      const chunks = [];
      process.stdin.on("data", (chunk) => chunks.push(chunk));
      process.stdin.on("end", () => {
        const bot = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!bot.id) process.exit(2);
        process.stdout.write(String(bot.id));
      });
    ')

  # A hosted widget is immutable, but only if every public edge can read every file for the
  # version the API just announced. If one node has metadata without files, some browsers get
  # pinned to a version that returns 404 and the frame opens white.
  step "widget files"
  WIDGET_FILES="index.html style.css zeplao.js faces.js sound.js pieces.js board.js taixiu.js tienlen.js"
  for round in 1 2 3; do
    for host in https://kuku.vn https://www.kuku.vn https://api-bot.kuku.vn; do
      for file in "" "/" $WIDGET_FILES; do
        if [ -z "$file" ]; then
          url="$host/api/widgets/$BOT_ID/$WIDGET_VERSION"
        elif [ "$file" = "/" ]; then
          url="$host/api/widgets/$BOT_ID/$WIDGET_VERSION/"
        else
          url="$host/api/widgets/$BOT_ID/$WIDGET_VERSION/$file"
        fi
        code=$(curl -L -sS -o /dev/null -w '%{http_code}' \
          -H 'Cache-Control: no-cache' \
          -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0' \
          "$url")
        if [ "$code" != 200 ]; then
          echo "widget file missing after upload: $code $url" >&2
          exit 1
        fi
      done
    done
  done
  echo "widget v$WIDGET_VERSION visible on public web hosts"

  # Và nó **chạy được**, không chỉ tải về được.
  #
  # Mọi thứ ở trên chỉ hỏi "file có ở đó không". Khung trắng thì không cần một file nào biến mất
  # cả: bảy file nạp nối đuôi nhau ở `onload`, nên một file 200-nhưng-hỏng, hay hai file lỡ khai
  # trùng một cái tên, cũng cho ra đúng cái kết quả ấy — trang chết ở giữa dây, im lặng, không
  # một dòng lỗi ở đâu. Cách duy nhất từng phát hiện ra nó là có người mở game rồi nhắn "trắng
  # bóc", và cả một dãy commit của kho này là những lần đi tìm nó bằng cách đoán.
  #
  # Nên bước này mở đúng bản vừa upload bằng một trình duyệt thật, đóng vai host, và chỉ chịu
  # đi tiếp khi trang **vẽ ra được cái sảnh**.
  step "widget chạy thật"
  if node "$ROOT/tools/widget-selftest.mjs" "$BOT_ID" "$WIDGET_VERSION"; then
    :
  else
    code=$?
    # Không có Chrome (2) thì nói to rồi đi tiếp — không thể bắt mọi cái máy phải có trình duyệt.
    # Trang hỏng thật (1) thì dừng: đi tiếp lúc này là đẩy một cái khung trắng ra cho người chơi.
    if [ "$code" = 2 ]; then
      echo "CHƯA THỬ ĐƯỢC bản v$WIDGET_VERSION — không chạy được self-test trên máy này" >&2
    else
      echo "bản v$WIDGET_VERSION KHÔNG CHẠY — dừng lại trước khi restart bot" >&2
      exit 1
    fi
  fi
fi

step "start"
remote "if [ ! -f /opt/zeplao/$BOT/.env ]; then
  echo 'no token at /opt/zeplao/$BOT/.env — make a bot at https://kuku.vn/bot and write:'
  echo '  ZEPLAO_BOT_TOKEN=<the token>'
  exit 3
fi
chmod 600 /opt/zeplao/$BOT/.env
docker pull -q node:22-alpine >/dev/null
systemctl daemon-reload
# Enabled but not started here. \`--now\` starts it and the restart on the next line then races
# the container it just made — docker refuses the name, systemd logs a failure, and five seconds
# later it comes up fine. A deploy that fails once every single time is a deploy whose failures
# nobody reads. \`restart\` starts a stopped unit on its own, so this is the whole of it.
systemctl enable zeplao-$BOT >/dev/null 2>&1
systemctl restart zeplao-$BOT
sleep 6
systemctl is-active zeplao-$BOT"

step "ledger"
after_start

step "check"
# What the bot said on the way up: its own handle, read back from the API with its own token.
# Anything else and the token is wrong.
remote "journalctl -u zeplao-$BOT -n 5 --no-pager | tail -3"
