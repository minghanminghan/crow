#!/usr/bin/env bash
# Deploys a checkout to the mini PC. Run by the release workflow's deploy job as crow-runner:
#   VERSION=1.2.3 deploy/deploy.sh
# Builds into /opt/crow/releases/<version>-<run>, backs up the data dir, switches
# /opt/crow/current, restarts crow, and checks /api/version. Keeps the newest 3 releases.
# Rollback: sudo ln -sfn <old release> /opt/crow/current && sudo systemctl restart crow
# To restore data too, see deploy/backup.sh.
set -euo pipefail

OPT=/opt/crow
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
: "${VERSION:?set VERSION}"
R=$OPT/releases/$VERSION-${GITHUB_RUN_ID:-$(date +%s)}

step() { echo "==> $*"; }

step "build: $R"
mkdir -p "$R"
git -C "$SRC" archive HEAD | tar -x -C "$R"
cd "$R"
pnpm pkg set version="$VERSION"
pnpm install --frozen-lockfile
pnpm build

step "backup"
ln -sfn "$R" $OPT/next
sudo systemctl start crow-predeploy

step "switch + restart"
ln -sfn "$R" $OPT/current
sudo systemctl restart crow

step "health check"
port=$(systemctl show -P Environment crow | tr ' ' '\n' | sed -n 's/^PORT=//p')
for _ in $(seq 1 30); do
  got=$(curl -fsS "http://127.0.0.1:$port/api/version" 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version' 2>/dev/null || true)
  [[ $got == "$VERSION" ]] && break
  sleep 1
done
[[ $got == "$VERSION" ]] || { echo "error: /api/version is '$got', expected $VERSION. See journalctl -u crow" >&2; exit 1; }

step "prune releases"
cd $OPT/releases
ls -1t | tail -n +4 | while read -r old; do
  [[ $OPT/releases/$old == "$(readlink -f $OPT/current)" ]] || rm -rf "$old"
done
echo "deployed $VERSION"
