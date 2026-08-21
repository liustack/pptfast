---
"@liustack/pptfast": minor
---

`render` and `preview` no longer require `-o`. Omit it and the files land in `.pptfast/<deck>/` at the project root, git-ignored locally on first create. An explicit `-o` is unchanged.
