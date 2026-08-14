# Installing pptfast (for an AI agent)

You are an AI agent and your user told you to install `pptfast`. This document
is the procedure. Follow it in order. Every step is safe to run again, and
every step names what to do when it fails. Commands are POSIX shell (macOS or
Linux). A Windows note follows each block that needs one.

There is nothing to configure. pptfast renders entirely locally: no API key,
no account, no engine to set up, no network calls at render time. The only
prerequisite is Node >= 18.

## Step 0: are you inside DeepSeek Harness (dsh)?

If you are, this section is the whole install: stop here and skip steps 1
and 2. On dsh pptfast is a native plugin, not a skill folder. The plugin
registers the deck skill and ships the CLI inside the plugin package, so
nothing else needs installing.

You are on dsh if `~/.dsh/` exists, or the conversation runs in the DeepSeek
Harness web or desktop app. One command installs the plugin:

```sh
npx -y @deepseek-ai/dsh plugin --profile web add @liustack/pptfast@0.18.0
```

The version is named on purpose: dsh installs plugins through pnpm 11, which
holds back anything published in the last 24 hours and silently resolves
`@latest` to an older release. A named version is installed as a deliberate
request. `npm view @liustack/pptfast version` prints the current one.

Then tell the user to restart dsh and look at the plugin list: a card named
"pptfast" means the plugin is live and the deck skill is registered. Verify by
running the step 3 health check in the dsh terminal, with `pptfast` replaced
by the packaged-CLI command the skill's own opening note spells out.

**If it fails:**
- `dsh` warns `declares no dsh.bundle` -> the release-age gate installed an
  old version (before 0.17.0 the package had no plugin entry at all).
  `@latest` does not avoid that: name the version instead
  (`npm view @liustack/pptfast version` prints it), then re-run the command
  above with that version.
- The plugin card does not appear after a restart -> re-run the install
  command (it is safe to repeat), then restart dsh again.

For every other harness, the whole install is three steps:

1. Install the CLI globally.
2. Put the skill where your harness reads it.
3. Run the health check.

---

## Step 1: Install the CLI

```bash
npm install -g @liustack/pptfast
pptfast --version
```

This command is deliberately unpinned: plain npm has no release-age gate, so
`latest` here really is the current release.

**If it fails:**
- `node: command not found`, or `node --version` prints something below 18 ->
  install Node from [nodejs.org](https://nodejs.org) (or via nvm), open a new
  shell, re-run.
- `EACCES` or another permission error on the global install -> do not
  escalate to sudo. Either configure a user-writable npm prefix, or skip the
  global install entirely: `npx -y @liustack/pptfast <command>` works
  everywhere this document and the skill use `pptfast <command>`.
- `pptfast: command not found` right after a successful install -> the npm
  global bin directory is not on PATH in this shell. Open a new shell, or ask
  the user to, then re-run `pptfast --version`.

> **Windows:** the same two commands work as-is in PowerShell.

---

## Step 2: Put the skill where your harness reads it

The skill is the `skills/pptfast` folder: a `SKILL.md` (and its Chinese
sibling `SKILL.zh-CN.md`), a self-contained playbook that drives the CLI from
step 1. How it reaches your harness depends on which harness you are.

### Claude Code: the plugin marketplace

The repo doubles as a Claude Code plugin that ships the skill. These are
slash commands typed into the Claude Code session; if you cannot execute
them yourself, hand them to the user:

```
/plugin marketplace add liustack/pptfast
/plugin install pptfast@pptfast
/reload-plugins
```

**If it fails** (the marketplace is unreachable, or the Claude Code version
predates plugins): fall back to the skill-folder path below with `TARGET`
`~/.claude/skills/`.

### Codex, Pi, OpenCode: the skill folder

Each harness reads skills from a fixed location:

| Harness | Skill directory (`TARGET`) |
| :-- | :-- |
| Claude Code (manual fallback) | `~/.claude/skills/` |
| Codex | `~/.codex/skills/` |
| Pi, OpenCode | `~/.agents/skills/` |

Install into this global directory in the user's home, so the skill is
available in every project. Do not install into a project-local skills
directory unless the user explicitly asks to scope it to the current project.
If you cannot tell which harness you are, decide by which config directory
already exists: `ls -d ~/.claude ~/.codex ~/.agents 2>/dev/null`.

The global install from step 1 already put the skill files on disk, so copy
them from there, no network needed:

```bash
mkdir -p ~/.codex/skills/pptfast          # replace with your TARGET
cp -R "$(npm root -g)/@liustack/pptfast/skills/pptfast/." ~/.codex/skills/pptfast/
```

Re-running the copy refreshes an earlier install in place. Confirm it landed:

```bash
ls ~/.codex/skills/pptfast/SKILL.md       # replace with your TARGET
```

**If it fails:**
- `npm root -g` points somewhere without `@liustack/pptfast` -> step 1 did
  not complete (or used npx). Either finish step 1, or clone instead:
  ```bash
  rm -rf /tmp/pptfast-src
  git clone --depth 1 https://github.com/liustack/pptfast.git /tmp/pptfast-src
  cp -R /tmp/pptfast-src/skills/pptfast/. ~/.codex/skills/pptfast/
  ```
- A permission error -> confirm `TARGET` is under the user's home directory
  (`echo $HOME`), not a system path.

> **Windows:** `~` is the user profile. The directories are
> `%USERPROFILE%\.claude\skills\`, `%USERPROFILE%\.codex\skills\`, and
> `%USERPROFILE%\.agents\skills\`. In PowerShell, copy with
> `Copy-Item -Recurse -Force "$(npm root -g)\@liustack\pptfast\skills\pptfast\*" "$env:USERPROFILE\.codex\skills\pptfast\"`.

### Any other agent

Reference the playbook from the agent's context instead: add one line to the
project's `AGENTS.md` (or equivalent) pointing at
[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md), installed locally or
by its GitHub URL. The skill is plain Markdown and self-contained.

---

## Step 3: Health check

Two checks. There is no configuration step between them, because there is
nothing to configure.

**1. The CLI answers.**

```bash
pptfast --version
```

Expected: a bare version number. Anything else -> the fixes under step 1.

**2. The render loop works end to end.** Write the minimal deck, then run
validate and render:

```bash
cat > /tmp/pptfast-hello.json <<'EOF'
{
  "filename": "hello.pptx",
  "theme": { "id": "consulting" },
  "slides": [
    { "type": "cover", "heading": "Hello pptfast", "subheading": "A first deck in ten minutes" },
    { "type": "content", "heading": "Why it works", "components": [
      { "type": "bullets", "items": ["Semantic IR in", "Native DrawingML out", "Every shape stays editable"] } ] },
    { "type": "ending", "heading": "Thanks" }
  ]
}
EOF
pptfast validate /tmp/pptfast-hello.json
pptfast render /tmp/pptfast-hello.json -o /tmp/pptfast-hello.pptx
```

Expected output, line for line:

```
OK — 3 slides, theme "consulting"
wrote /tmp/pptfast-hello.pptx (3 slides, 23783 bytes)
```

(The byte count is exact on the current release: rendering is deterministic,
the same IR produces the same bytes. A nearby number on another release is
still a pass.)

On dsh, run the same two checks in the terminal, with `pptfast` replaced by
the packaged-CLI command the registered skill's opening note spells out
(`node <plugin package>/dist/cli.js`). The expected output is identical.

**If it fails:**
- `validate` reports errors -> each one carries a page number and a fix. The
  JSON above is known-good, so an error here means the file was written
  incompletely. Rewrite the heredoc and re-run.
- `render` fails with a module or import error -> the global install is
  damaged. Re-run `npm install -g @liustack/pptfast`.
- A warning about the optional `sharp` dependency -> ignore it. It is only
  needed by `pptfast audit --pixels`, never by validate or render.

---

## Done

Installation is complete. From now on the skill triggers on its own when the
user asks for a deck, a PPT, or slides: the model reads the schema, writes
IR, and closes the validate-render loop itself, as laid out in
[`skills/pptfast/SKILL.md`](./skills/pptfast/SKILL.md). The
[README](./README.md) covers the full CLI, themes, deck projects, and the
audit and preview tooling.
