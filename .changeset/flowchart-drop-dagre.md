---
"@liustack/pptfast": patch
---

Flowchart layout no longer uses dagre. Ranks come from a longest-path layering plus one barycenter sort inside the engine. Connectors, fan-out, and edge-label rules stay the same. The dagre and @types/dagre packages are gone.
