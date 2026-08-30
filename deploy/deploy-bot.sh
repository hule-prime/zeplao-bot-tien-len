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

SSH_KEY=${ZEPLAO_SSH_KEY:-~/.ssh/<khoá>}
SSH_PORT=${ZEPLAO_SSH_PORT}
HOST=${ZEPLAO_HOST:-root@$ZEPLAO_HOST}

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
remote() { ssh -i "$SSH_KEY" -p "$SSH_PORT" "$HOST" "$@"; }

step "test"
( cd "$ROOT/bots/$BOT" && npm test --silent )

step "upload"
# data/ is the bot's own and survives every deploy. Made here rather than by the bot, because a
# container cannot create its own bind mount.
remote "mkdir -p /opt/zeplao/$BOT/data"
scp -q -i "$SSH_KEY" -P "$SSH_PORT" \
  "$ROOT/bots/$BOT/$BOT.mjs" \
  "$ROOT/bots/$BOT/package.json" \
  "$HOST:/opt/zeplao/$BOT/"

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
  ZIP=$(mktemp -t widget-XXXXXX).zip
  ( cd "$ROOT/bots/$BOT/widget" && zip -qr "$ZIP" . )
  curl -sS -X POST "${ZEPLAO_BOT_API:-https://api-bot.kuku.vn}/setWidget" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/zip' \
    --data-binary "@$ZIP"
  echo
  rm -f "$ZIP"
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

step "check"
# What the bot said on the way up: its own handle, read back from the API with its own token.
# Anything else and the token is wrong.
remote "journalctl -u zeplao-$BOT -n 5 --no-pager | tail -3"
