---
"@liustack/pptfast": minor
---

Chart `axes` field now renders. `x_title`/`y_title` draw as fitted axis titles on bar (both directions) and line charts, with space reserved only when present. `show_grid` toggles the existing bar/line gridlines and adds an opt-in vertical grid for horizontal bars. Non-cartesian chart types (pie, funnel, dumbbell) report a non-blocking validate warning instead of silently ignoring the field.
