# Images

Read this when declaring image assets, searching stock, or generating art.

### Image slides

Declare images once in `assets.images` and reference them by `asset_id` — double-check every `asset_id` spelling, a wrong key renders a silent placeholder instead of failing. An explicit `layout` id always wins over pptfast's auto-selection, which otherwise picks from the theme's layout set for that page type (the full registry set by default, unless the theme curates it narrower) — for a slide built around an image, set `layout` to one of the image takeovers: `image-split` (half-page image + side text, `image_side: left|right`), `image-top` (full-bleed top image + text columns below), `image-bottom` (text above, image below), `image-annotate` (center image + radiating callouts taken from the first 4 bullets). **Every image layout needs an `image` component somewhere in `components`** — pptfast uses the first one it finds as the image source regardless of array position, and every other component becomes the layout's text body.

Before generating art for any `image` component whose `asset_id` still has no real file behind it, run `pptfast asset-brief <target>` — it renders the deck for real and reports each slot's actual frame (not the layout's nominal slot size), crop mode with a safe-zone note, suggested generation pixels, the theme's palette, and a paste-ready prompt. Matching the reported aspect ratio and palette is what makes a generated image look intentional once it's placed instead of stretched, cropped wrong, or off-tone.

### Stock photos

Run `pptfast asset-brief <target>` first so the frame, crop, and palette are known.

Query rules: short concrete nouns, English 2–4 words (`office desk`, `wind farm`). Chinese is a variant, not the only query. No mood or quality words (`beautiful`, `4k`, `cinematic`). No negative keywords (`not office`, `no people`).

Search order is Pexels, then Pixabay if a key is set, then Openverse (cc0/pdm, commercial filter).

```bash
pptfast config set pexels.apiKey
pptfast images search "office desk" --orientation landscape
```

Do not auto-pick the first result. A person or a vision model picks from the ~8 thumbs. Then download:

```bash
pptfast images fetch pexels:123 --deck <dir> --as hero
pptfast images list --deck <dir>
pptfast images generate --deck <dir> --as <asset_id>
```

Local generators stay off until enabled:

```bash
pptfast config set images.generators.grok.enabled true
pptfast config set images.generators.codex.enabled true
pptfast config set images.generators.antigravity.enabled true
```

The file lands in `.pptfast/<deck>/assets/<asset_id>.jpg` with a sidecar next to it. Reference that `asset_id` from the page. Do not delete `.pptfast/` wholesale to "rerun". That drops pinned photos.

No key: leave the slot `missing` (grey frame). Do not invent a photo. Do not scrape. Do not use Unsplash. This is a local client fetching with the user's own key. Commercial use in a presentation is allowed. Do not resell the photo standalone. Print attribution in the terminal, not on the slide by default.
