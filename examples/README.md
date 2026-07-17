# Examples

## basic.json

A five-slide demo deck exercising the core slide types and blocks: `cover`,
`chapter`, `content` (with a `bullets` block), `content` with the
`kpi_focus` arrangement (`kpi_cards` block), and `ending`. Theme: `consulting`.

Build the CLI once, then run any of the commands below from the repo root:

```bash
pnpm build

# validate the IR against the schema
node dist/cli.js validate examples/basic.json

# render to a .pptx
node dist/cli.js render examples/basic.json -o out/basic.pptx

# render each slide to an SVG for a quick visual self-check
node dist/cli.js preview examples/basic.json -o out/svgs

# same deck, a different built-in theme
node dist/cli.js render examples/basic.json -o out/basic-tech.pptx --theme tech
```

`pnpm e2e` runs this example end to end (build → render → structural
assertions on the produced pptx → preview → optional LibreOffice PDF
conversion when `soffice` is installed) and writes its output to
`.e2e-out/` (git-ignored).
