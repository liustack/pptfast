---
"@liustack/pptfast": patch
---

A deck with a `cycle` component exports again. Every `cycle` ever rendered was
refused at the door: the ring is drawn around its own center, so half of its
labels sit at a negative x in the group's local space, and the exporter sized
their text boxes as if that local x were a position on the slide — producing
zero-width and negative-width shapes, which the package audit rejects outright.
The box is now measured after the group's transforms are folded in, which is
the only point where the coordinate is a slide coordinate. Text lands exactly
where it always did (the anchor was never the broken part), so no deck renders
any differently — the shapes around the text are simply the right size now.

`examples/team-onboarding.json`, shipped un-renderable since 0.19.2, renders.
Every file in `examples/` is now covered by the test suite, so a broken one
cannot ship quietly again.
