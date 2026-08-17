---
"@liustack/pptfast": minor
---

Previews now live in `$PPTFAST_HOME/previews/<id>/` instead of the system temp
directory, and their bookkeeping is no longer filed under a hash of the CLI's
install path. Upgrading the plugin used to orphan every preview card written
before it, and the operating system swept the rest within days. Nothing expires
now: a rendered deck stays until its owner deletes it.

A deck that is gone says so. The preview route separates "no such preview" from
"present but incomplete" from "present but unreadable" from "could not read it
just now", and the DSH card keeps whatever it can still prove — the thumbnails
it already holds and the page count from the tool's own summary — instead of
vanishing or opening a raw JSON error as a web page.

`pptfast preview --html` gained `#page=N`, so an embedder holding only a URL
can open the viewer on the page the reader clicked. Its filmstrip now fades at
whichever end still has thumbnails behind it rather than cutting the last one
off, and the stage measures the room it actually has instead of guessing at the
chrome above it — which was leaving a grey bar down each side of the slide.

`pptfast render` refuses a deck whose pages silently lost content, naming the
pages. Drops that paint a visible "+N more" are unchanged; `--allow-dropped-content`
ships the rest anyway.

An empty `PPTFAST_HOME` is now treated as unset rather than as the current
directory.
