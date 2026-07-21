# claude-statusline

A simple, elegant status line for [Claude Code](https://docs.claude.com/en/docs/claude-code).

![example](example.png)

- **Line 1** — folder, git branch, model, reasoning effort, and cloud profile (AWS, Google Cloud)
- **Line 2** — context gauge (green, then yellow, then red as it fills), session cost, token count, and output burn rate

The status line shows the cloud profile only when Claude Code uses a provider. The profile is your `AWS_PROFILE` on Bedrock, or your project ID on Vertex. The Claude API and a subscription do not show a profile.

If the terminal is too narrow, the cloud profile and the token segment both move to a new line together.

The colors use the basic-16 ANSI palette. The terminal theme sets the exact color.

## Install

```sh
git clone https://github.com/therealparmesh/claude-statusline
cd claude-statusline
./install.sh
```

The installer copies `statusline.js` to `~/.claude/`. It adds the `statusLine` entry to your `settings.json` and keeps your other settings. Restart Claude Code to see the status line.

## Requirements

- [Bun](https://bun.sh)
- A [Nerd Font](https://nerdfonts.com) for the glyphs

## License

MIT
