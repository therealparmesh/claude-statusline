#!/usr/bin/env bash
# Copy statusline.js to the Claude config folder and set statusLine in settings.json.
# Keep all other settings, and all other statusLine keys (for example padding).
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/statusline.js"
DEST_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$DEST_DIR/statusline.js"

command -v bun >/dev/null || {
	echo "error: bun not found — install from https://bun.sh" >&2
	exit 1
}

mkdir -p "$DEST_DIR"
[ "$SRC" -ef "$DEST" ] || cp "$SRC" "$DEST"
chmod +x "$DEST"

# Claude Code runs the command in a shell, so quote paths that have spaces.
# Write the home folder as ~ so that the same settings.json works on other machines.
DEST="$DEST" SETTINGS="$DEST_DIR/settings.json" bun -e '
  const f = Bun.file(process.env.SETTINGS);
  const text = (await f.exists()) ? (await f.text()).trim() : "";
  const s = text ? JSON.parse(text) : {};
  const q = (p) => (/^[\w.\/-]+$/.test(p) ? p : `"${p.replace(/["\\$`]/g, "\\$&")}"`);
  const home = process.env.HOME + "/";
  const dest = process.env.DEST;
  const command = dest.startsWith(home) ? "~/" + q(dest.slice(home.length)) : q(dest);
  s.statusLine = { ...s.statusLine, type: "command", command };
  await Bun.write(f, JSON.stringify(s, null, 2) + "\n");
'

echo "installed → $DEST"
echo "note: needs a Nerd Font (https://nerdfonts.com) for the glyphs to render."
echo "restart Claude Code to see it."
