# Spec writing and page types

Read this when writing `deck.spec.json`, choosing page types (`cover` / `chapter` / `content` / `ending`), or running the narrative interview.

### Phase 1 — Read the vocabulary (do this fresh every session)

```bash
pptfast schema             # IR JSON Schema: the single source of truth
pptfast schema --spec      # deck spec schema
pptfast narratives --json  # named narrative presets (strategy/pacing/audience axes + theme recommendations)
pptfast themes --json      # built-in themes (id + label)
```

Never write IR or a spec from memory of a previous session or from this file — the schema evolves and `schema`/`narratives`/`themes` output always wins.

Also scan the workspace before asking anyone anything. Facts the files can answer are not questions:

- An existing confirmed `deck.spec.json` already locks narrative, theme, and branding. Do not re-interview. Route follow-ups through phase 6.
- A `theme.json`, a pinned `pptfast.config.json` theme, a user-named theme id, or a supplied `.thmx` / `.potx` / branded `.pptx` is a brand signal. Extract or honor it. Do not ask whether a template exists.
- Request text that already names the audience, argument style, or density has derived that axis. Do not re-ask it.

A brand signal answers what the deck should look like, never how it should argue. The full rule lives in `references/branding.md`.


**Boundary-page rule — learn this now, it is the single most common mistake:** `cover`, `chapter`, and `ending` pages never render `components` or `footnote`, on any layout, no exceptions. Put that content on a `content` page instead. Getting this wrong at spec time means rewriting real content later — `validate` catches it with `"<type>" slides do not render components/footnote — move this content to a content slide or remove it`, but by then you have already drafted content that has to move.

```json
// pages/closing.json — spec type "ending" — WRONG: components never render on an ending page
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/wrap-up.json — spec type "content", inserted right before the ending page — CORRECT
{ "components": [{ "type": "bullets", "items": ["Thank you", "Questions? sales@example.com"] }] }
```

```json
// pages/closing.json — spec type "ending" — stays bare, nothing to move here
{}
```

`docs/deck-projects.md`'s boundary-page render surface table has the full per-type accounting.

### Phase 2 — Spec and confirm

Propose and confirm before writing any page content.

- Lock a narrative package first: named preset (or explicit axes), theme id, branding posture, and a type-scale band (how large cover / chapter / speech headings render: `regular` omit/1, `display` 1.3, `hero` 1.5). This is a decision layer above theme, not a visual choice. Use the Narrative interview below when any axis is still unknown and a user is present. Do not silently pick a preset in that case.
- Density (leave air vs pack the page) is decided in that interview (or derived). Follow the Sparse-page contract in `references/layouts.md` when you pin climax, quote, and evidence layouts and write `notes`. `pacing` does not grow a fourth value for this.
- Theme id comes from the chosen narrative's `themeRecommendations` in `narratives --json` (or from `themes` output if none fit — a recommendation, never a constraint). If the interview's brand question returned a template, extract it first — see `references/branding.md`.
- Write the confirmed `narrative`, `theme`, and `branding` into `deck.spec.json` as soon as the user agrees, before drafting any page. Do not hold them in the conversation and reconstruct them once pages exist.
- Draft `deck.spec.json`: one entry per page (`id`, `type`, `heading`, optionally `beat`/`focus`/`summary`) — opens on `cover`, closes on `ending`, everything in between is `content` or `chapter`. Write `narrative` as a preset id string when the three axes match a preset exactly, otherwise as `{strategy, pacing, audience}`. Never write `{id, pacing}` mixed shapes. Omit `branding` by default. Write `branding: "full"` only when every content page needs the brand footer (and whenever `meta.confidentiality` is `confidential` or `restricted`). Do not invent a `typeScale` field on the spec — it does not exist. The band is a recommendation. Only a bare IR (spec skipped) may put `theme.style.shape.typeScale` on the IR itself.
- Run `pptfast spec validate deck.spec.json` and fix whatever it reports until it prints `OK` — the hard gates (boundary pages, heading length, beat rotation, page count vs. pacing) all fire here, before a single page is written
- Once `spec validate` prints `OK`, set a `seed` (any integer) in `deck.spec.json` for revision stability — write one now, or run `pptfast assemble` once in phase 3 and copy the `generated seed …` value it prints into the spec. Without a persisted seed, editing one page's heading later can reshuffle every other page's auto-picked layout

**After the user confirms the validated spec, do not re-spec.** Restructuring a confirmed spec (reordering, retyping, dropping pages) silently wastes the user's review. If new information genuinely forces a change, say so and re-confirm first, then re-run `spec validate`.

### Narrative interview (at most one round)

When a user is present and any of audience, how it is told / strategy, or pacing is still unknown, relay the unresolved questions below in **one** message, then stop. Do not fill them in. Do not say "I'll assume". If the harness has a multiple-choice question tool, use it and pass the options verbatim.

Open that message with one sentence naming the deck you are about to build: who it is for, how the argument is told, how full a page runs, which theme, footer on or off. Build that sentence only out of what the request and the workspace actually said. Where a signal is missing, say it is missing and name the ★ option as a default, not as a read of their situation. Never dress a default as a conclusion about their meeting. Keep axis names (`pyramid`, `spacious`, `executive`) out of that sentence and out of the options. Close the message with the three ways out: take it as-is, change an option, or say none of these fit.

Skip the whole interview (zero questions) when: a confirmed spec already exists; the user said to skip questions / just generate / batch; there is nobody in this run at all; or the request already locks audience, argument style, and density. A complete brief still gets a one-line narrative package before you write the spec — that is the existing spec confirmation, not a second interview round.

Having no multiple-choice tool is not the same as having no user. In a plain conversation the user is present: the questions are the entire message and the stop still applies. Only a run with nobody in it (CI, batch, a script with no conversation) skips the pause, and there you still put the package, the reason, and what would change it in the visible output, then proceed on it. A later objection reopens the choice, and you re-run `spec validate` after changing it.

Skip only the derived axes. An empty workspace (no spec, no `theme.json`, no pinned config theme, nothing derivable in the request) asks Q1–Q4 together. A workspace with no brand signal asks Q4 even if it is not otherwise empty.

If the user skips an option, answers "anything", or replies off-list: fill the missing axis with the ★ default, name that fill in the recommendation reason, and do not follow up. "None of these fit" gets exactly one question back — which single axis is wrong — and nothing else. A veto of the package gets the prepared second candidate, not a new interview.

<!-- Maintainer note, not an instruction to relay: Q1 earns its place today only through the lookup below and the tone of the prose. The `audience` axis still changes nothing on the render surface. If a future wave stops reading `audience` in that lookup, delete Q1 rather than keep asking a question whose answer changes no deliverable. -->

**Q1 — Who is this for?** `executive` board / VP (conclusion first) · `technical` engineers who will check the numbers · `customer` ★ buyers, users, a pitch room · `public` mixed or public.

**Q2 — How should it be told?** This is the reading of the deck. Q1 and Q3 only tune it. `talk-pyramid` ★ one conclusion per page (`pyramid`) · `talk-showcase` one image or number per page (`showcase`) · `read-brief` a packed brief, evidence first (`briefing`) · `teach` a training walkthrough (`instructional`). Derive `storytelling` from 年报 / brand-film / situation-to-resolution language. Do not add it as a fifth option.

**Q3 — Sparse or packed?** `spacious` ★ leave air, few words per page · `balanced` a normal mix · `dense` pack the evidence, the page stands alone.

**Q4 — Brand template?** Only when there is no brand signal. `extract` yes, they will hand over a `.thmx` / `.potx` / branded `.pptx` · `builtin` ★ no, use a built-in theme · `later` built-in now, brand later (treat as `builtin`, do not open a second round). Whether a `theme.json` is already in the workspace is something you check, never something you ask.

End that message with this block, verbatim, one line per axis, a derived value filled in and every unresolved axis left as `?`:

```
NARRATIVE_INTERVIEW
audience: ?
tell: ?
pacing: ?
brand: ?
```

The block is the gate, not your self-discipline: while any line still reads `?`, you may not create or edit `deck.spec.json`, a page file, or a bare IR. Only the user's reply clears a `?` — or, once they have replied, the ★ default for an axis they left open. In a run with nobody in it, fill every line yourself and print the block with `(no user in this run)` on the first line, so the choice is visible and reversible.

After the reply, emit one package and one backup, one sentence of reason, one clause for what would change it, then wait for confirmation:

`recommend: <preset-or-axes> × <theme> × branding omit|full × typeScale regular|display|hero`
`what would change it: <one clause>` — most often: this will be forwarded without a speaker, so put the extra words in notes, or recommend a PDF instead of packing the slide.

Lookup (theme = first `themeRecommendations` entry from `narratives --json` for that preset, or for the nearest preset when writing axes). Omit the field by default. Write `"full"` when `meta.confidentiality` is `confidential` or `restricted`, or every content page needs the brand footer. `customer` + `talk-pyramid` + `spacious` → `pitch` / omit / display. `executive` + `talk-pyramid` + `spacious` → `boardroom-report` / omit / display. `customer` + `talk-showcase` + `spacious` → `product-launch` / omit / display. `technical` + `teach` + `balanced` → `training` / omit / regular. `technical` + `read-brief` + `dense` → `weekly-brief` / omit / regular. `executive` + `read-brief` + `dense` → axes `{pyramid, dense, executive}` / omit / regular, theme from `boardroom-report`. `public` + storytelling + `balanced` → `annual-review` / omit / regular. Else write the axes object and take the nearest preset's theme list: `pyramid`+`executive` → `boardroom-report`, `pyramid`+`customer` → `pitch`, `showcase` → `product-launch`, `instructional` → `training`, `briefing`+`dense` → `weekly-brief`, `storytelling` → `annual-review`, else `general`.

Type-scale band: `regular` when `dense` or `balanced`. `display` when `spacious`. `hero` only on a repaint that switches the theme to `stage`. Do not retarget a boardroom deck to `stage` just to enlarge titles. Do not write `typeScale` onto `deck.spec.json`. Do not edit a repo-root `pptfast.config.json` for one deck. On a bare IR (spec skipped) a non-`regular` band may be written as `theme.style.shape.typeScale` 1.3 or 1.5.

The second candidate ships with the package, prepared in advance, and it has to differ in mechanism: flip density (`spacious` ↔ `dense`, type-scale follows), or flip what leads the argument (`pitch` ↔ `product-launch`, `training` ↔ the same material as a dense handout). The same three axes in a different theme is a repaint, not a candidate — offer that only when the user rejected the look, and say the narrative did not move. `stage` × `hero` is the repaint for a showcase that wanted bigger titles. Do not flip all three axes at once.

This interview settles the three narrative axes, not whether the request should be a deck at all. If that larger question is open, say so plainly and let the user answer it before you spec.

A very small deck may still skip the spec file and write a single IR. It may not skip this interview when axes are unknown. Write the same decisions onto the IR's `narrative` / `theme` / `branding`.
