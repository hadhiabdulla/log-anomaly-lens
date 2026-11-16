# Demo outline - real interaction only

This outline is not evidence a recording exists. Record the actual running UI.

1. Explain the problem: many log events, limited review time. This prototype ranks unusual sessions against a normal baseline, not attacks against a signature list.
2. Start in Beginner. Tap 1. Load practice example, then 2. Compare visits. Read the plain-English findings and next checks. Switch to Advanced to reveal JSONL inputs, expanded technical evidence and the scoring method. Switching keeps inputs/results and does not change the model.
3. Load synthetic demo. Show the two distinct inputs: 48 training sessions, 6 candidates. Point out JSONL schema and local-only scope.
4. Run Learn baseline & compare. Show burst retries and novel export transitions at the top, their count/pace/sequence contributions, and baseline counts on unusual transitions.
5. Show ordinary activity below the review line. Then show known-blind-spot also below it: same observable normal retry pattern, potentially malicious intent unknown. Mention unusual-hour is elevated but missed by the line.
6. Explain legitimate new exports would also flag. Novelty is not a security verdict.
7. Edit one line to invalid JSON. Run again. Show the actionable line-number error and stale results removed.
8. Restore demo, compare, export scores locally if useful. State no real-world accuracy, users or impact claim; AI assistance across implementation disclosed.

No source-code license has been chosen. Do not claim an open-source license in the narration or event entry.
