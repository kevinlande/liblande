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
# (macOS may ask whether Terminal may use Word's data: allow it, as that's
# where Word keeps its add-ins.)

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

if ! mkdir -p "$WEF" 2>/dev/null; then
  say "macOS didn't let this window into Word's folder."
  say "In System Settings › Privacy & Security, allow Terminal to access data"
  say "from other apps (or Full Disk Access), then run this again."
  finish 1
fi

if [ "${1:-}" = "--remove" ]; then
  rm -f "$WEF/$NAME" "$WEF/liblande-word-test.xml"
  say "LibLande for Word removed. Restart Word for it to go."
  finish 0
fi

# The add-in file, the latest from the site (and checked before it's used).
tmp="$(mktemp -t liblande-word)"
if ! curl -fsSL "$URL?$(date +%s)" -o "$tmp"; then
  say "Couldn't download the add-in from LibLande's site. Are you online?"
  rm -f "$tmp"
  finish 1
fi
if ! grep -q '<OfficeApp' "$tmp" || ! /usr/bin/xmllint --noout "$tmp" 2>/dev/null; then
  say "What came back from LibLande's site isn't the add-in file. Try again in a minute."
  rm -f "$tmp"
  finish 1
fi
rm -f "$WEF/liblande-word-test.xml"
mv -f "$tmp" "$WEF/$NAME"
chmod 644 "$WEF/$NAME"
say "LibLande for Word is installed."
say "(In Word: the LibLande button on the Home tab, or Home › Add-ins.)"

if pgrep -xq "Microsoft Word"; then
  say ""
  read -r -p "Word is open. Restart it now so the add-in appears? Unsaved documents will ask to be saved. [y/N] " ans < /dev/tty 2>/dev/null || ans=n
  if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
    osascript -e 'tell application "Microsoft Word" to quit' >/dev/null 2>&1
    for i in $(seq 1 60); do pgrep -xq "Microsoft Word" || break; sleep 0.5; done
    if pgrep -xq "Microsoft Word"; then say "Word is still open (waiting on a document?). Restart it yourself when ready."
    else open -a "Microsoft Word"; say "Word restarted."; fi
  else
    say "Restart Word when you're ready, and the add-in will be there."
  fi
else
  say "Open Word, and it will be there."
fi
finish 0
