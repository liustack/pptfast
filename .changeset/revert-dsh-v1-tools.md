---
"@liustack/pptfast": patch
---

Revert the DSH plugin's v1 model tools and session attachments. The plugin is a single skill registration again.

`pptfast_validate`, `pptfast_render`, and `pptfast_themes` did nothing the CLI cannot do, and each one cost a parameter schema, a collision-proof name, and an in-process loader to keep in sync with the render core. The first-page thumbnail the render tool pushed into the session is beaten outright by `pptfast serve`: one command opens a web page carrying every slide, reloading as the deck changes, with reviewer annotations coming back as `revision-request.json`.

That serve loop is now the deck's review path in the skill, written as a numbered round: start the server as a background job, hand the user the localhost URL, read their annotations back, stop the job when the round ends. The skill routes every step through the CLI, and the README and INSTALL guide drop the tool tables.

This also withdraws the internal exports the tools needed (`formatWarnings` from the SDK barrel, `resolveLocalAssets` from the node entry), and supersedes the unreleased `pptfast_render` acceptance fixes.
