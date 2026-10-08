#!/usr/bin/env bun
import { $ } from "bun";

// ANSI basic-16 foreground colors only. The terminal theme sets the exact color, so these read on dark and light themes.
// Normal colors (30-37) are the theme's accent colors. Two exceptions:
// - blue is bright (94): normal blue is a dark navy in macOS Terminal, xterm and Windows, and vanishes on a black background.
// - the empty gauge track is bright black (90): the only muted color in the set. In Solarized Dark it is the background color,
//   so the track disappears there, but the filled part and the percent still show.
// The cloud profile and the cost have no color. They are plain facts, and the default foreground reads on every theme.
const c = {
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[94m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
};

// Nerd Font glyphs, all from the Material Design Icons set (nf-md-*), so they have one style and weight.
const g = {
  folder: "\u{f024b}",
  branch: "\u{f062c}",
  model: "\u{f061a}",
  aws: "\u{f0e0f}",
  gcloud: "\u{f11f6}",
  context: "\u{f029a}",
  cost: "\u{f0114}",
};

// Give the active cloud backend as a glyph and a profile name (AWS profile or Google Cloud project).
// Give null if there is no backend or no profile name.
const cloud = (env) => {
  const who = env.CLAUDE_CODE_USE_BEDROCK
    ? { glyph: g.aws, name: env.AWS_PROFILE || env.AWS_DEFAULT_PROFILE }
    : env.CLAUDE_CODE_USE_VERTEX
      ? { glyph: g.gcloud, name: env.ANTHROPIC_VERTEX_PROJECT_ID || env.CLOUDSDK_CORE_PROJECT }
      : null;
  return who?.name ? who : null;
};

// Make a short token count with one decimal, for example 31.6k or 1.2M.
// Select the unit from the rounded value, so that 999,960 shows as 1.0M and not as 1000.0k.
const fmtTok = (n) =>
  n >= 999_950 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

// Make one segment: a glyph, then the text, in one color.
// Many terminals draw a Nerd Font glyph 2 cells wide over the space after it, so put 2 spaces after the glyph.
const seg = (color, glyph, text) => `${color}${glyph}  ${text}${c.reset}`;

// Join parts of a segment with a dot.
const dot = (...parts) => parts.filter(Boolean).join(" · ");

// Cut text that is longer than 24 characters, and put an ellipsis where the cut is.
// Cut at a separator (/ : - _ .) when one is in the second half of the kept part, so that no word is cut in half.
// Keep the start by default: a folder name and a branch's ticket prefix start the text.
// Keep the end for a cloud profile: an SSO profile ends in its env:role.
const MAX = 24;
const cut = (chars) => {
  const head = chars.slice(0, MAX - 1);
  const at = head.findLastIndex((ch, i) => i >= MAX / 2 && /[/:_.-]/.test(ch));
  return at > 0 ? head.slice(0, at) : head;
};
const trunc = (s, keepEnd = false) => {
  const chars = [...s];
  if (chars.length <= MAX) return s;
  return keepEnd ? "…" + cut(chars.reverse()).reverse().join("") : cut(chars).join("") + "…";
};

// Give the visible width. Do not count the ANSI color codes.
// ponytail: each character is 1 cell, so wide characters (CJK, emoji) make lines wrap late.
const width = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;

// COLUMNS is the terminal width. Claude Code puts 2 cells of padding on each side of the status line, so remove 4.
// If COLUMNS is empty, assume a wide terminal and do not wrap.
const cols = (Number(process.env.COLUMNS) || Infinity) - 4;

// Put the segments on lines from left to right. If a segment does not fit on the line, start a new line.
const flow = (segs) =>
  segs.filter(Boolean).reduce((lines, s) => {
    const joined = lines.length ? `${lines.at(-1)}  ${s}` : "";
    if (joined && width(joined) <= cols) lines[lines.length - 1] = joined;
    else lines.push(s);
    return lines;
  }, []);

try {
  const raw = await Bun.stdin.text();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw);
  const cwd = data.workspace?.current_dir || data.cwd;
  if (!cwd) process.exit(0);

  // Line 1: folder, git branch, model, effort, cloud profile
  const folder = cwd.split("/").filter(Boolean).pop() || cwd;
  const folderSeg = seg(c.cyan, g.folder, trunc(folder));
  const branch = (await $`git -C ${cwd} branch --show-current`.quiet().nothrow().text()).trim();
  const gitSeg = branch ? seg(c.magenta, g.branch, trunc(branch)) : "";
  const model = data.model?.display_name;
  const modelSeg = model ? seg(c.blue, g.model, dot(model, data.effort?.level)) : "";
  const who = cloud(process.env);
  const cloudSeg = who ? seg("", who.glyph, trunc(who.name, true)) : "";

  // Line 2: context left, token count, cost
  // Claude Code gives the token counts of the last response, so their sum is the size of the context now.
  const ctx = data.context_window;
  const tok = (ctx?.total_input_tokens || 0) + (ctx?.total_output_tokens || 0);
  const tokStr = tok > 0 ? `${fmtTok(tok)} tok` : "";
  const rawRem = ctx?.remaining_percentage;
  const rem = rawRem == null || String(rawRem).trim() === "" ? NaN : Number(rawRem);
  let ctxSeg = "";
  if (Number.isFinite(rem)) {
    const pct = Math.round(Math.max(0, Math.min(100, rem)));
    const filled = Math.round((pct / 100) * 8);
    const color = pct <= 20 ? c.red : pct <= 40 ? c.yellow : c.green;
    const bar = `${"█".repeat(filled)}${c.gray}${"░".repeat(8 - filled)}${color}`;
    ctxSeg = seg(color, g.context, dot(`${bar} ${pct}% left`, tokStr));
  }
  const cost = data.cost?.total_cost_usd;
  const costSeg = cost > 0 ? seg("", g.cost, `$${cost.toFixed(2)}`) : "";

  const lines = [
    ...flow([folderSeg, gitSeg, modelSeg, cloudSeg]),
    ...flow([ctxSeg, costSeg]),
  ];
  process.stdout.write(lines.join("\n"));
} catch {
  process.exit(0);
}
