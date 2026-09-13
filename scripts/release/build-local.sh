#!/usr/bin/env bash
set -euo pipefail
# Builds only. Does not submit, deploy, activate payments or send communications.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLATFORM="${1:-}"
PROFILE="${2:-}"
case "$PLATFORM:$PROFILE" in android:qa|android:production|ios:production) ;; *) echo 'Usage: build-local.sh android qa|production OR ios production' >&2; exit 2;; esac
command -v eas >/dev/null || { echo 'Install an owner-approved pinned EAS CLI and authenticate the authorized Expo account.' >&2; exit 1; }
test -f "$ROOT/apps/mobile/eas.json" || { echo 'Missing apps/mobile/eas.json' >&2; exit 1; }
: "${MWANAMKE_BUILD_OWNER_APPROVED:?Set after verifying Expo project and signing material belong to the product owner}"
test "$MWANAMKE_BUILD_OWNER_APPROVED" = true || exit 1
mkdir -p "$ROOT/artifacts/mobile"
EXT=aab
if [ "$PROFILE" = qa ]; then EXT=apk; fi
if [ "$PLATFORM" = ios ]; then EXT=ipa; fi
OUTPUT="$ROOT/artifacts/mobile/mwanamke-$PLATFORM-$PROFILE.$EXT"
test ! -e "$OUTPUT" || { echo 'Artifact already exists; archive it before rebuilding.' >&2; exit 1; }
cd "$ROOT/apps/mobile"
eas build --local --non-interactive --platform "$PLATFORM" --profile "$PROFILE" --output "$OUTPUT"
shasum -a 256 "$OUTPUT" > "$OUTPUT.sha256"
echo 'Build generated. Signature, install, privacy manifest and journey verification remain mandatory.'
