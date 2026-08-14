---
"@liustack/pptfast": minor
---

Add `pptfast doctor`: one command that says whether this machine's install is actually healthy, with no network call and nothing written to disk.

The check that earns it is skill drift. An installed skill is a copy, and that copy keeps its install-time launcher forever, so `pptfast --version` can report something months newer than what the harness actually runs and nothing surfaces the gap. Doctor scans the three skill directories INSTALL.md documents, reads the pinned version out of each copy's launcher, and names any copy that is behind, with the clone-and-copy line that refreshes exactly that one.

It also reports the dsh plugin's version per profile (read from the profile's own `node_modules`, which is what really loads), Node against the `engines` floor, whether the optional `sharp` and `soffice` capabilities are present and what each one costs when missing, and a self-test render of a built-in deck through the real pipeline in memory.

Exit code 1 is reserved for a hard failure: a runtime below the floor, or a self-test render that did not complete. Skill drift, a stale dsh plugin, and missing optional capabilities are warnings and still exit 0, because the write-IR to validate to render flow keeps working through all of them. `--json` prints the same report machine-readably.
