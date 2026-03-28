#!/bin/bash

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

pause_for_exit() {
  printf '\n'
  read -r -p "Press Return to close..."
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required to run this app."
  echo "Install Node.js from https://nodejs.org/ and then run this file again."
  pause_for_exit
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
if [ -z "${NODE_MAJOR}" ] || [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "Node.js 20+ is required to run this app."
  echo "Your current version is: $(node -v 2>/dev/null)"
  pause_for_exit
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found on your PATH."
  echo "Reinstall Node.js and make sure npm is included."
  pause_for_exit
  exit 1
fi

if [ ! -d "${SCRIPT_DIR}/node_modules/ws" ]; then
  echo "Installing dependencies..."
  if ! (cd "${SCRIPT_DIR}" && npm install); then
    echo
    echo "npm install failed."
    pause_for_exit
    exit 1
  fi
fi

echo "Starting the Catan server on http://localhost:8000 ..."
if ! osascript - "${SCRIPT_DIR}" <<'APPLESCRIPT'
on run argv
  set repoPath to item 1 of argv
  tell application "Terminal"
    activate
    do script "cd " & quoted form of repoPath & " && npm start"
  end tell
end run
APPLESCRIPT
then
  echo "Failed to open Terminal and start the server."
  echo "You can run it manually with:"
  echo "  cd \"${SCRIPT_DIR}\" && npm start"
  pause_for_exit
  exit 1
fi

sleep 2
open "http://localhost:8000"

echo "Catan is opening in your browser."
echo "Keep the Terminal window running npm start open while you play."
