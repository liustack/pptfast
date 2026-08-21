---
"@liustack/pptfast": patch
---

Stop DSH Desktop from loading pptfast's sharp into the same Electron process as the host's sharp. The optional sharp dependency now tracks the 0.35 line the host ships, and the preview tool always runs the CLI in a child process (real Node when inside Electron, never an in-process import).
