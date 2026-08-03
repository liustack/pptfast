---
"@liustack/pptfast": patch
---

Documented a capability boundary that the "editable PPTX" claim was leaving implicit: shapes and text runs (including the ones a `chart` or `data_table` component draws) are real, restylable, retypable PowerPoint objects, but pptfast does not produce a native PowerPoint chart part or `<a:tbl>` table object, so a chart's or table's underlying numbers are not editable inside PowerPoint the way a native chart/table would be. README.md/README.zh-CN.md now state this plainly next to the editability claim, and `skills/pptfast/SKILL.md`/`SKILL.zh-CN.md` gained a matching rule so the skill never tells a user otherwise. No code or rendered output changed.
