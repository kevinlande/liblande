#!/bin/bash
# Install LibLande for Word on this Mac. From LibLande's Settings › Word:
#   curl -fsSL https://kevinlande.github.io/liblande/word/install.sh | bash
# or the installer downloaded from there (or in the project, Install
# LibLande for Word.command), double-clicked in Finder.
#
# It puts LibLande's add-in file (the latest, from LibLande's site) into
# Word's add-ins folder on this Mac, takes out the old test add-in, and
# offers to restart Word. Run it again any time to reinstall; run it with
# --remove (from Terminal) to take the add-in out.
#
# (macOS asks, the first time, whether Terminal may control Finder: allow
# it, as Finder does the copying into Word's folder.)

set -u
WEF="$HOME/Library/Containers/com.microsoft.Word/Data/Documents/wef"
URL="https://kevinlande.github.io/liblande/word/liblande-word.xml"
NAME="liblande-word.xml"

say() { printf '%s\n' "$*"; }
finish() { say ""; read -n 1 -s -r -p "Press any key to close this window." < /dev/tty 2>/dev/null; echo; exit "${1:-0}"; }

if [ ! -d "$HOME/Library/Containers/com.microsoft.Word" ]; then
  say "Word doesn't seem to be installed on this Mac (or hasn't been opened yet)."
  say "Open Word once, quit it, then run this again."
  finish 1
fi

DOCS="$HOME/Library/Containers/com.microsoft.Word/Data/Documents"
CACHE="$HOME/Library/Containers/com.microsoft.Word/Data/Library/Application Support/Microsoft/Office/16.0/Wef"

# macOS keeps other apps (Terminal included) out of Word's own folders,
# but lets Finder in: so Finder does the copying and deleting. (The first
# time, macOS asks whether Terminal may control Finder: allow it.)
finder() { osascript -e "tell application \"Finder\"" -e "$1" -e "end tell" 2>&1; }
has() { [ "$(finder "exists item (POSIX file \"$1\" as text)")" = "true" ]; }
trash() { has "$1" && finder "delete item (POSIX file \"$1\" as text)" >/dev/null; }
clear_cache() { has "$CACHE" && finder "delete every item of folder (POSIX file \"$CACHE\" as text)" >/dev/null; }

if [ "${1:-}" = "--remove" ]; then
  trash "$WEF/$NAME"; trash "$WEF/liblande-word-test.xml"
  if has "$WEF/$NAME"; then say "Couldn't remove it: macOS didn't let Terminal control Finder."; finish 1; fi
  say "LibLande for Word removed (it's in the Trash). Restart Word for it to go."
  finish 0
fi

# The add-in file, the latest from the site (and checked before it's used).
dir="$(mktemp -d -t liblande-word)"
tmp="$dir/$NAME"
if ! curl -fsSL "$URL?$(date +%s)" -o "$tmp"; then
  say "Couldn't download the add-in from LibLande's site. Are you online?"
  finish 1
fi
if ! grep -q '<OfficeApp' "$tmp" || ! /usr/bin/xmllint --noout "$tmp" 2>/dev/null; then
  say "What came back from LibLande's site isn't the add-in file. Try again in a minute."
  finish 1
fi
has "$WEF" || finder "make new folder at folder (POSIX file \"$DOCS\" as text) with properties {name:\"wef\"}" >/dev/null
trash "$WEF/liblande-word-test.xml"
out="$(finder "duplicate file (POSIX file \"$tmp\" as text) to folder (POSIX file \"$WEF\" as text) with replacing")"
# (Checked, not assumed: there now?)
if ! has "$WEF/$NAME"; then
  say "The add-in couldn't be put in Word's folder (${out:-no reason given})."
  say "If macOS asked whether Terminal may control Finder and you said no: in"
  say "System Settings › Privacy & Security › Automation, allow Terminal to"
  say "control Finder, then run this again. Or copy it yourself: two Finder"
  say "windows are opening; drag $NAME into the wef folder."
  open -R "$tmp"; open "$DOCS" 2>/dev/null
  finish 1
fi
# Word keeps add-ins it has seen in a cache, and can go on showing an old
# one: cleared (Microsoft's advice), once Word isn't running.
pgrep -xq "Microsoft Word" || clear_cache
say "LibLande for Word is installed."
say "(In Word: the LibLande button on the Home tab, or Home › Add-ins.)"

if pgrep -xq "Microsoft Word"; then
  say ""
  read -r -p "Word is open. Restart it now so the add-in appears? Unsaved documents will ask to be saved. [y/N] " ans < /dev/tty 2>/dev/null || ans=n
  if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
    osascript -e 'tell application "Microsoft Word" to quit' >/dev/null 2>&1
    for i in $(seq 1 60); do pgrep -xq "Microsoft Word" || break; sleep 0.5; done
    if pgrep -xq "Microsoft Word"; then say "Word is still open (waiting on a document?). Quit it, then run this again."
    else clear_cache; open -a "Microsoft Word"; say "Word restarted."; fi
  else
    say "Quit Word when you're ready, then run this again, so the add-in shows up."
  fi
else
  say "Open Word, and it will be there."
fi
finish 0
