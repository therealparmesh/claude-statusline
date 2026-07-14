#!/usr/bin/env bash
# Installs the statusline: copies statusline.js to ~/.claude and points
# settings.json at it (merging, so existing settings are preserved).
set -euo pipefail

SRC="$(dirname "$0")/statusline.js"
DEST_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$DEST_DIR/statusline.js"

command -v bun >/dev/null || {
	echo "error: bun not found — install from https://bun.sh"
	exit 1
}

mkdir -p "$DEST_DIR"
cp -f "$SRC" "$DEST"
chmod +x "$DEST"

# Merge statusLine into settings.json via bun (preserves everything else).
# Run the script directly via its shebang; the ~ path keeps settings portable.
DEST="$DEST" bun -e '
  const p = (process.env.CLAUDE_CONFIG_DIR || process.env.HOME + "/.claude") + "/settings.json";
  const f = Bun.file(p);
  const s = (await f.exists()) ? await f.json() : {};
  s.statusLine = { type: "command", command: process.env.DEST.replace(process.env.HOME, "~") };
  await Bun.write(f, JSON.stringify(s, null, 2) + "\n");
'

echo "installed → $DEST"
echo "note: needs a Nerd Font (https://nerdfonts.com) for the glyphs to render."
echo "restart Claude Code to see it."
