#!/usr/bin/env bun
import { $ } from "bun";

// ANSI basic-16 colors. The terminal theme sets the exact color.
// Use dim, not "bright black", for gray text: some themes (Solarized Dark) make bright black the background color.
const c = {
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  dim: "\x1b[2m",
  undim: "\x1b[22m",
  reset: "\x1b[0m",
};

// Nerd Font glyphs.
const g = {
  folder: "\u{f07b}",
  branch: "\u{e0a0}",
  model: "\u{f085}",
  aws: "\u{f270}",
  gcloud: "\u{f1a0}",
  context: "\u{f0e4}",
  cost: "\u{f0d6}",
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

// Cut the text to n characters. If the text is too long, keep the start and add an ellipsis.
const trunc = (s, n = 24) => {
  const chars = [...s];
  return chars.length > n ? chars.slice(0, n - 1).join("") + "…" : s;
};

// Cut the text to n characters. If the text is too long, keep the end and add an ellipsis.
const truncStart = (s, n) => {
  const chars = [...s];
  return chars.length > n ? "…" + chars.slice(1 - n).join("") : s;
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
  const cloudSeg = who ? seg(c.dim, who.glyph, truncStart(who.name, 32)) : "";

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
    const bar = `${"█".repeat(filled)}${c.dim}${"░".repeat(8 - filled)}${c.undim}`;
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
