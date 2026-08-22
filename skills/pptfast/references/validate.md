# Validate loop

Read this when running assemble / validate / audit / preview / serve, or revising a page.

### Phase 3 — Fill pages in batches of at most 4, validate immediately

For each page in the confirmed spec, write `pages/<page-id>.json` with its content (`components`, and optionally `layout`/`arrangement`/`background`/`image_side`/`footnote`/`notes` — never `type`/`heading`, those are locked by the spec). Remember Phase 1's boundary-page rule while drafting `cover`/`chapter`/`ending` pages — do not give them `components` or `footnote` and then have to move it. `notes` is speaker notes prose for whoever presents the deck — writing a good speaking script is a model strength. Draft `notes` whenever the page needs a spoken walkthrough beyond what is on the slide (Sparse-page contract). That is the default, not optional.

```bash
pptfast assemble deck-dir/     # materializes deck.json — catches structural drift: orphan page files, locked-field violations, a broken spec
pptfast validate deck-dir/     # content-quality gate: heading length, density, bullets budget (warnings) + unknown theme, boundary-page content, and a bullet item past render-safety (hard errors)
```

Fix whatever either command reports as an error and re-run until both print `OK`. `validate` can print `OK` alongside `warning:` lines (e.g. a long heading or a dense slide) — tighten those too when practical, they read better, but they do not block. Only an error stops `OK` from printing. A spec page with no page file yet is a placeholder (heading only) — assemble and validate both accept that. Leaving some pages as placeholders between batches is normal, not an error. `assemble` also prints `note: N layouts auto-selected into deck.json` whenever a page's `layout` was left to auto-selection — informational, not an error. Pin `layout` in a page file only when a specific pick needs to be locked — a `pinOnly` layout like `quote-stage`, `statement`, `pull-quote`, or `verse-chapter` needs this pin every single time, since it never comes up through auto-selection at all (see `references/layouts.md`). Climax, quote, and evidence pages pin those by default (see `references/layouts.md`).

### Phase 4 — Render

```bash
pptfast render deck-dir/
```

The `.pptx` lands in `.pptfast/<deck>/`. The command prints the absolute path. Report that line to the user.

`--theme <id>` overrides the deck theme without editing the spec. `--style <path>` layers a style-token override on top (re-color without forking a theme, schema: `pptfast schema --style`). Render refuses a deck with unfilled placeholder pages unless you add `--draft` — reach for that only when the user explicitly wants a look before every page is done. It also refuses a deck where a page holds more than fits, so the layout left blocks out with nothing on the slide to say so: the error names the pages and how many blocks each lost. Fix it by shortening that page or splitting it in two, and re-render — `--allow-dropped-content` ships the file with the content missing, so only pass it if the user says to.

If the project has a `pptfast.config.json`, its theme/style are project defaults — do not fight them with `--theme` unless the user asks. Any page `notes` you wrote in phase 3 export as native PowerPoint speaker notes (View → Notes in PowerPoint/Keynote) — never drawn onto the slide itself.

### Phase 5 — Audit and optional visual self-check

Once every page is filled (no placeholders left), run the deterministic geometry audit:

```bash
pptfast audit deck-dir/
```

Zero-token, zero-variance — it renders each page off-screen and checks overflow, out-of-bounds, low-contrast, overlap, content-truncated (an ellipsis cut real text), and content-dropped (an item or whole component silently clamped out, tagged data-dropped in the SVG), exiting 1 when it finds anything (0 when clean). Each finding names its page (and id) and carries a fix. Fix the flagged page's content — same "restructure, don't delete" discipline as a `validate` error — then re-run `pptfast audit deck-dir/` alone (no need to re-render) until it exits 0. This is the deck's visual QA. Do not rely on eyeballing a screenshot instead.

If any page has a cover/chapter photo background, add `--pixels` — it rasterizes the page and samples real pixels to catch text sitting directly on an unscrimmed photo, the one case the SVG-only checks above can't see.

```bash
pptfast preview deck-dir/ --html
```

Writes one standalone SVG per slide plus a self-contained `preview.html` into `.pptfast/<deck>/`, never gated on placeholder pages. The command prints the absolute path. Report that line to the user. Read a few SVGs yourself (they are plain text files) to sanity-check layout and density before delivering, especially for image-heavy decks. Hand `preview.html` (thumbnail strip, keyboard navigation, placeholder badges) to the user for their own look instead. When every page is filled, `preview.html` also overlays the same `audit` findings (per-page badges + a findings panel) so the reviewer sees them without a terminal. A deck with any placeholder page shows a one-line "audit skipped" notice instead. `preview.html` is read-only: it shows the deck, it never edits it. When the reviewer wants something changed, they tell you in the conversation. A screenshot of the page in question is the fastest way for both of you, and you route it through phase 6.

### Showing the deck to the user

How you hand a deck over depends on what the harness can render. Take the first one that applies.

**If a `pptfast_preview` tool exists, call it.** It renders the deck and puts a real slide preview in the conversation: a thumbnail strip in the tool card, full size on click, arrow keys to page. The user sees the deck without leaving the thread and without opening anything. Never fall back to handing over a file path or a URL when this tool is present. That is the experience it was built to replace. The tool reports only a summary line back to you (page count, audit state). That is deliberate: the deck itself goes to the user's screen, not into your context.

**If the harness has a built-in browser (VS Code, Cursor, and similar), preview to a file.** Run `pptfast preview deck-dir/ --html`. The command prints the absolute path of `preview.html`. Give the user that path so they can open it in the built-in browser. Re-run the same command after each revision: the path does not change, they refresh. No port, no background process.

**Otherwise, serve it.** Most harnesses have no way to draw a slide in the transcript, so the review happens in the user's own browser. Never try to substitute by pasting a thumbnail or a screenshot of one page into the conversation. Serve the whole thing and let the user page through it at full size. Start the server as a background task (in DSH, follow the background-job convention and note the job id so you can stop it later):

```bash
pptfast serve deck-dir/ --no-open
```

Then run the round in this order:

1. Always pass `--no-open`. There is no browser to auto-open in an agent environment.
2. Report the exact localhost URL it prints (default `http://127.0.0.1:4400`) to the user, so they can open it themselves. That one line is the whole handoff.
3. The user pages through the deck and tells you what needs changing, in the conversation. A screenshot of the offending page is the fastest hand-off — you see exactly what they see.
4. Route each request through phase 6's revision flow. The page live-reloads on every file you save, so each revision lands in the tab the user already has open. No new link, no re-export, nothing for them to click.
5. Stay in the loop while they keep looking. When the round is over, stop the serve process (kill the background job). Never leave it running after the task ends.

### Phase 6 — Revision: edit one page, re-assemble

A revision touches the smallest file that captures it:

- Content change ("punch up the KPI page") → edit that page's `pages/<id>.json` only, then repeat phase 3's `assemble` + `validate` pair, and phase 5's `audit`, before re-rendering. Never regenerate pages nobody asked you to touch.
- Structural change (reorder, add/remove a page, change a page's type or heading) → edit `deck.spec.json` instead, re-run `pptfast spec validate` first (phase 2's no-respeccing rule still applies: only do this when the user actually asked for a structural change).
- A change the reviewer asked for in conversation (usually with a screenshot of the page) → find that page's `pages/<id>.json` by matching what they described against `deck.spec.json`/`pages/`, and treat their words as a requirement to interpret, not a patch to apply verbatim: they are describing a rendered slide, not writing page-file JSON. Translate it into a concrete content edit, then run the same content-change loop above (`assemble` + `validate` + `audit`) for every page you touched. Preview stays read-only end to end: nothing writes into `pages/*.json` except your own deliberate edit.

## Routing a follow-up request

Once a deck project exists, a follow-up message routes into exactly one of three branches — decide which before doing anything:

1. **Edit a page** ("change slide 3", "make the KPI page punchier", or a screenshot with a note) → phase 6: edit that page's file, re-assemble, re-validate, re-audit. Never touch pages nobody asked about.
2. **A new deck** (a different topic, audience, or an explicit request to start over) → phase 1: a new deck project directory, fresh narrative/theme decision, fresh spec.
3. **Unrelated to deck generation** (a question about the content, anything with no connection to slides) → do not invoke pptfast at all.
