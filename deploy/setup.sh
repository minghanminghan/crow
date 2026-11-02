#!/usr/bin/env bash
# One-time (and safe to re-run) mini PC setup for crow. Run as root from a repo checkout:
#   sudo [PORT=3418] [NODE_BIN=/usr/bin/node] deploy/setup.sh
# Creates the crow and crow-runner users and dirs, installs crow.service on 127.0.0.1:$PORT,
# the nightly crow-backup.timer and crow-predeploy.service, lets crow-runner deploy (see
# deploy/runner.sh), and serves https://crow.<domain> -> 127.0.0.1:$PORT to the tailnet (deploy/caddy).
set -euo pipefail

UNIT=/etc/systemd/system/crow.service
DATA=/var/lib/crow
BACKUPS=/var/backups/crow
OPT=/opt/crow
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

die() { echo "error: $*" >&2; exit 1; }
step() { echo "==> $*"; }

[[ $EUID -eq 0 ]] || die "run as root (sudo $0)"
for cmd in systemctl ss tailscale install useradd visudo; do
  command -v "$cmd" >/dev/null || die "$cmd not found"
done

# Keep the port from a previous run unless PORT is given.
PORT=${PORT:-$(sed -n 's/^Environment=PORT=//p' "$UNIT" 2>/dev/null || true)}
PORT=${PORT:-3418}
NODE_BIN=${NODE_BIN:-$(command -v node || true)}
TARGET=http://127.0.0.1:$PORT

[[ -x $NODE_BIN ]] || die "node not found; set NODE_BIN=/path/to/node"
NODE_BIN=$(readlink -f "$NODE_BIN")
case $NODE_BIN in /home/* | /root/*) die "node at $NODE_BIN is under a home dir; the service runs with ProtectHome. Install node system-wide or set NODE_BIN" ;; esac
[[ $("$NODE_BIN" -p 'process.versions.node.split(".")[0]') -ge 24 ]] || die "node 24+ required ($NODE_BIN is $("$NODE_BIN" --version))"

step "user: crow"
if ! id -u crow >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin crow
fi
runuser -u crow -- "$NODE_BIN" --version >/dev/null || die "user crow cannot run $NODE_BIN"

step "user: crow-runner"
if ! id -u crow-runner >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir /home/crow-runner --shell /bin/bash crow-runner
fi
sudoers=$(printf '%s\n' "crow-runner ALL=(root) NOPASSWD: $(command -v systemctl) start crow-predeploy, $(command -v systemctl) restart crow")
if [[ $(cat /etc/sudoers.d/crow-runner 2>/dev/null) != "$sudoers" ]]; then
  printf '%s\n' "$sudoers" >/etc/sudoers.d/crow-runner.tmp
  visudo -cqf /etc/sudoers.d/crow-runner.tmp || die "bad sudoers rule"
  chmod 0440 /etc/sudoers.d/crow-runner.tmp
  mv /etc/sudoers.d/crow-runner.tmp /etc/sudoers.d/crow-runner
fi

step "dirs: $DATA $BACKUPS $OPT/releases"
install -d -o crow -g crow -m 0750 "$DATA" "$BACKUPS"
install -d -o crow-runner -g crow-runner -m 0755 "$OPT" "$OPT/releases"
chown -R crow-runner:crow-runner "$OPT/releases"

step "port: 127.0.0.1:$PORT"
pids=$(ss -Hltnp "sport = :$PORT" | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
for pid in $pids; do
  owner=$(ps -o user= -p "$pid" | tr -d ' ')
  [[ $owner == crow ]] || die "port $PORT is used by pid $pid ($owner). Pick another: PORT=<port> $0"
done
if [[ -z $pids ]] && ss -Hltn "sport = :$PORT" | grep -q .; then
  die "port $PORT is in use. Pick another: PORT=<port> $0"
fi

step "systemd: crow.service crow-backup.service crow-backup.timer crow-predeploy.service"
changed=()
for unit in crow.service crow-backup.service crow-backup.timer crow-predeploy.service; do
  rendered=$(sed -e "s|@NODE_BIN@|$NODE_BIN|" -e "s|@PORT@|$PORT|" "$HERE/$unit")
  dest=/etc/systemd/system/$unit
  if [[ ! -f $dest ]] || [[ $(cat "$dest") != "$rendered" ]]; then
    printf '%s\n' "$rendered" >"$dest"
    changed+=("$unit")
  fi
done
[[ ${#changed[@]} -eq 0 ]] || systemctl daemon-reload
systemctl enable crow >/dev/null
systemctl enable --now crow-backup.timer >/dev/null
if [[ -e $OPT/current/package.json ]]; then
  if [[ " ${changed[*]} " == *" crow.service "* ]] || ! systemctl is-active --quiet crow; then systemctl restart crow; fi
  systemctl is-active --quiet crow || echo "warning: crow did not start; see journalctl -u crow" >&2
else
  echo "    $OPT/current does not exist yet; the service starts after the first deploy"
fi

"$HERE/caddy/setup.sh" crow "127.0.0.1:$PORT"
URL=https://crow.${DOMAIN:-andrewminghanjiang.com}

cat <<EOF

Done. crow will be at $URL (local: $TARGET).

Deploys (CD): install the GitHub runner once, then each release on main deploys itself:
  sudo RUNNER_TOKEN=<token> deploy/runner.sh
  token: gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token -q .token
  First deploy: re-run the deploy job of the latest release workflow run.

Move your laptop boards (one time):
  laptop:  tar -czf /tmp/crow-data.tar.gz -C <whiteboard checkout>/data . && scp /tmp/crow-data.tar.gz <minipc>:/tmp/
  minipc:  sudo systemctl stop crow
           sudo tar -xzf /tmp/crow-data.tar.gz -C $DATA && sudo chown -R crow:crow $DATA
           sudo systemctl start crow

Backups run nightly (crow-backup.timer) into $BACKUPS. Run one now:
  sudo systemctl start crow-backup && journalctl -u crow-backup -n 5

Install the CLI on a laptop:
  curl -fsSL $URL/cli/crow.mjs -o ~/.local/bin/crow && chmod +x ~/.local/bin/crow
EOF
