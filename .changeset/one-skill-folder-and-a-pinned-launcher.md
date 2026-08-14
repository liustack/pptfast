---
"@liustack/pptfast": minor
---

pptfast now ships in exactly two shapes: one skill folder any harness reads, and one DSH plugin. Installing it no longer involves installing a CLI.

**The Claude Code plugin form is gone.** `.claude-plugin/` (marketplace and plugin manifests) delivered the same `skills/pptfast` folder that Claude Code already reads from `~/.claude/skills/`, at the cost of a third distribution shape with its own version mirror. Claude Code installs the skill folder like every other harness now.

**The skill carries a version-pinned launcher.** `skills/pptfast/scripts/run.sh` and `run.ps1` resolve a runtime on every call: a compatible `pptfast` on `PATH`, then `npx` at the pinned version, then `bunx` at the pinned version, with a structured diagnosis and exit 78 when a machine has no JavaScript runtime at all. The pin is stamped from `package.json` at release time and guarded by drift tests, so an installed skill copy runs the release it was installed with instead of whatever happened to be on the machine. Both SKILL files drive the CLI through it, with a hand-run fallback for harnesses that forbid scripts. The DSH path is unchanged and still uses the CLI inside the plugin package.

**Node floor raised to 22.19.** `engines` said `>=18`, which had not been true for a while: the repo's own test runner cannot start below 20, and CI was quietly running 20 and 22. The floor now matches what is actually supported and tested, and the CI matrix runs 22 and 24.

Install docs are rewritten around this: the READMEs lead with the one line you forward to your AI, and manual install (`npm install -g`, building from source) drops to an INSTALL.md appendix for the rare case someone wants `pptfast` as their own terminal command.
