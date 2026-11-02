#!/usr/bin/env bash
# Backs up /var/lib/crow to /var/backups/crow/crow-<UTC time>.tar.gz. Run as crow by crow-backup.service
# (nightly) and crow-predeploy.service (--backup-only). Without --backup-only, also deletes backups older
# than 7 days, always keeping the newest 3.
# Restore: sudo systemctl stop crow && sudo tar -xzf <backup> -C /var/lib/crow && sudo systemctl start crow
set -euo pipefail

DATA=${DATA_DIR:-/var/lib/crow}
BACKUPS=${CROW_BACKUPS:-/var/backups/crow}

file=$BACKUPS/crow-$(date -u +%Y%m%dT%H%M%SZ).tar.gz
tar -czf "$file.tmp" -C "$DATA" .
mv "$file.tmp" "$file"
echo "backup: $file"
[[ ${1:-} == --backup-only ]] && exit 0

ls -1t "$BACKUPS"/crow-*.tar.gz | tail -n +4 | while read -r old; do
  if [[ -n $(find "$old" -mmin +$((7 * 24 * 60))) ]]; then rm -f "$old" && echo "deleted: $old"; fi
done
