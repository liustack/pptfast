# Branding posture

Read this when extracting a company template, or deciding whether to write `branding: "full"`.

A brand signal answers what the deck should look like, never how it should argue. Turning "this company's palette looks like a consulting firm" into a narrative is a guess wearing a fact's clothes, and it is how a deck ends up arguing in a shape nobody chose.

## Brand themes — the user's own company template

When the user hands over (or mentions having) a company template — a `.thmx` theme, `.potx` template, or any branded `.pptx` — extract its colors and fonts into a custom theme **before** picking a built-in theme in phase 2. Extraction runs entirely locally; the file never leaves the machine.

```bash
pptfast brand extract corp-template.pptx -o deck-dir/theme.json --id acme
pptfast render deck-dir/     # theme.json auto-loads; set "theme": "acme" in deck.spec.json
```

A `theme.json` sitting in the deck project directory auto-loads on every command (validate/render/audit/preview/serve) — reference its id from `deck.spec.json` and no flag is needed. For a single IR file, pass `--theme-file deck-dir/theme.json` instead (works on the same five commands). Loading enforces a contrast floor: a template whose text/background tones are too close is refused with the failing token and ratio named — relay that message and ask the user whether to adjust the extracted file's colors or fall back to a built-in theme.

Leave `branding` off the spec and the IR unless every content page needs the brand footer. Write `branding: "full"` whenever `meta.confidentiality` is `confidential` or `restricted`, or the file needs an organization colophon. Confidentiality and date then appear on the cover. They stay off every other posture.
