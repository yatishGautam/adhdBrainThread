#!/usr/bin/env bash
#
# Replace /Applications/ADHD Superpower.app with the freshly packaged build.
#
# This app is meant to stay resident — closing its window does not quit it, and the tray keeps
# a session ticking — so "install the new build" always means "stop the old one first". A copy
# over a running bundle leaves a process whose code no longer matches the files underneath it,
# which crashes in ways that look like bugs in the app.
#
# Stopping it is done gently on purpose. Quit runs the app's own shutdown: a running focus block
# is ended and written as `ended_early`, and the JSON store is flushed. A SIGKILL skips all of
# that, losing whatever had not hit the debounce and leaving an open session behind — which is
# why the escalation below says so out loud rather than doing it quietly.
#
#   npm run install:mac              build, stop, replace
#   npm run install:mac -- --launch  …and start it again afterwards
#
set -euo pipefail

BUNDLE_ID="com.yatish.adhd-superpower"
APP_NAME="ADHD Superpower.app"
TARGET_DIR="/Applications"
TARGET="${TARGET_DIR}/${APP_NAME}"
# The app's own executable path, which is what distinguishes it from this script and from any
# helper process that merely has the name in its arguments.
PROCESS_MATCH="${APP_NAME}/Contents/MacOS/ADHD Superpower"

LAUNCH_AFTER=0
for arg in "$@"; do
  case "$arg" in
    --launch) LAUNCH_AFTER=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '  %s\n' "$1"; }

# ---------------------------------------------------------------- find the build

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE=""
for candidate in "${ROOT}/dist/mac-arm64/${APP_NAME}" "${ROOT}/dist/mac/${APP_NAME}"; do
  [[ -d "$candidate" ]] && SOURCE="$candidate" && break
done

if [[ -z "$SOURCE" ]]; then
  echo "No packaged app found under dist/. Run 'npm run pack:mac' first." >&2
  exit 1
fi
say "built:  ${SOURCE#"$ROOT"/}"

# Refuse to install something unusable rather than replacing a working app with it.
if ! codesign --verify --strict "$SOURCE" 2>/dev/null; then
  echo "The packaged app fails signature verification — not installing it." >&2
  exit 1
fi

if [[ ! -w "$TARGET_DIR" ]]; then
  echo "${TARGET_DIR} is not writable by $(whoami). Install it by hand, or fix the permissions." >&2
  exit 1
fi

# ------------------------------------------------------------------ stop the old

running() { pgrep -f "$PROCESS_MATCH" >/dev/null 2>&1; }

# Waits up to $1 seconds for every matching process to go away.
wait_for_exit() {
  local deadline=$((SECONDS + $1))
  while running; do
    (( SECONDS >= deadline )) && return 1
    sleep 1
  done
  return 0
}

if running; then
  say "stopping the running app (this ends a focus block in progress, and flushes its data)"
  # Ask first. This is the only path that runs the app's shutdown handler.
  osascript -e "quit app id \"${BUNDLE_ID}\"" >/dev/null 2>&1 || true

  if ! wait_for_exit 20; then
    say "it did not respond to Quit — sending TERM"
    pkill -f "$PROCESS_MATCH" 2>/dev/null || true

    if ! wait_for_exit 10; then
      say "WARNING: forcing it. Anything written in the last few seconds may not have been"
      say "         saved, and a running block will be left open — the app will offer to"
      say "         count it next time it starts."
      pkill -9 -f "$PROCESS_MATCH" 2>/dev/null || true
      wait_for_exit 10 || { echo "Could not stop the app. Quit it from Activity Monitor." >&2; exit 1; }
    fi
  fi
  say "stopped"
else
  say "not running — nothing to stop"
fi

# --------------------------------------------------------------------- replace

# ditto rather than cp: it is the copy that understands bundles, and it carries the extended
# attributes and the signature across intact.
STAGE="${TARGET_DIR}/.${APP_NAME}.incoming"
rm -rf "$STAGE"
ditto "$SOURCE" "$STAGE"

# The old one is only removed once the new one is on the same volume and ready to be moved into
# place, so a failure here leaves the working app where it was.
rm -rf "$TARGET"
mv "$STAGE" "$TARGET"

codesign --verify --strict "$TARGET"
VERSION="$(defaults read "${TARGET}/Contents/Info" CFBundleShortVersionString 2>/dev/null || echo '?')"
say "installed: ${TARGET} (version ${VERSION})"

if (( LAUNCH_AFTER )); then
  open -a "$TARGET"
  say "launched"
else
  say "not launched — it will be the new build next time you open it"
fi
