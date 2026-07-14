#!/usr/bin/env bun
import { $ } from "bun";

// ANSI basic-16 colors so the terminal theme can remap them
const c = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  magenta: "\x1b[95m",
  white: "\x1b[97m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[94m",
};

// Nerd Font glyphs
const g = {
  folder: "\u{f07b}",
  branch: "\u{e0a0}",
  model: "\u{f085}",
  aws: "\u{f270}",
  gcloud: "\u{f1a0}",
  context: "\u{f0e4}",
  cost: "\u{f0d6}",
  tokens: "\u{f292}",
};

const seg = (text) => `${c.gray}[${c.reset}${text}${c.gray}]${c.reset}`;
const trunc = (s, n = 24) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const cloud = (env) => {
  const who = env.CLAUDE_CODE_USE_BEDROCK
    ? { glyph: g.aws, name: env.AWS_PROFILE || env.AWS_DEFAULT_PROFILE }
    : env.CLAUDE_CODE_USE_VERTEX
      ? { glyph: g.gcloud, name: env.ANTHROPIC_VERTEX_PROJECT_ID || env.CLOUDSDK_CORE_PROJECT }
      : null;
  return who?.name ? who : null;
};

try {
  const raw = await Bun.stdin.text();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw);
  const cwd = data.workspace?.current_dir || data.cwd;
  if (!cwd) process.exit(0);

  // Line 1: folder, git branch, model, cloud identity
  const folder = cwd.split("/").filter(Boolean).pop() || cwd;
  const folderSeg = seg(`${c.cyan}${g.folder} ${trunc(folder)}${c.reset}`);
  const branch = (await $`git -C ${cwd} branch --show-current`.quiet().nothrow().text()).trim();
  const gitSeg = branch ? seg(`${c.magenta}${g.branch} ${trunc(branch)}${c.reset}`) : "";
  const model = data.model?.display_name;
  const modelSeg = model ? seg(`${c.white}${g.model} ${trunc(model)}${c.reset}`) : "";
  const who = cloud(process.env);
  const cloudSeg = who ? seg(`${c.gray}${who.glyph} ${who.name}${c.reset}`) : "";
  const line1 = [folderSeg, gitSeg, modelSeg, cloudSeg].filter(Boolean).join(" ");

  // Line 2: context gauge, cost, tokens
  const rawRem = data.context_window?.remaining_percentage;
  const rem = rawRem == null || String(rawRem).trim() === "" ? NaN : Number(rawRem);
  let ctxSeg = "";
  if (Number.isFinite(rem)) {
    const pct = Math.max(0, Math.min(100, rem));
    const filled = Math.round((pct / 100) * 8);
    const color = pct <= 20 ? c.red : pct <= 40 ? c.yellow : c.green;
    const bar = `${color}${"█".repeat(filled)}${c.gray}${"░".repeat(8 - filled)}${c.reset}`;
    ctxSeg = seg(
      `${color}${g.context}${c.reset} ${bar} ${color}${String(Math.round(pct)).padStart(3, " ")}%${c.reset}`,
    );
  }

  const cost = data.cost?.total_cost_usd;
  const costSeg =
    typeof cost === "number" ? seg(`${c.blue}${g.cost} $${cost.toFixed(2)}${c.reset}`) : "";
  const tok =
    (data.context_window?.total_input_tokens || 0) +
    (data.context_window?.total_output_tokens || 0);
  const tokSeg = tok > 0 ? seg(`${c.gray}${g.tokens} ${fmtTok(tok)} tok${c.reset}`) : "";
  const line2 = [ctxSeg, costSeg, tokSeg].filter(Boolean).join(" ");

  process.stdout.write([line1, line2].filter(Boolean).join("\n"));
} catch {
  process.exit(0);
}
