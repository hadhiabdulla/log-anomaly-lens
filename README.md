# Log Anomaly Lens

Learn normal event sequences. Review unusual sessions. A browser-local prototype for operations anomaly triage, built during AI OpenBuild in November 2026.

This is **not an attack detector or a risk probability**. A new legitimate workflow can look unusual. Abuse that looks like normal activity can score low. Use the output to choose what to inspect, not to block users or declare an incident.

## Run it

No build, account, API key, package installation or model download is needed.

```sh
python3 -m http.server 8000
# Open http://localhost:8000
```

Use **Load synthetic demo**, then **Learn baseline & compare**. Or paste two separate JSONL windows: a reviewed normal baseline and new candidate sessions. The baseline is never silently retrained on candidates.

```json
{"timestamp":"2026-11-01T10:00:00Z","session":"pseudonymous-session-1","event":"login"}
{"timestamp":"2026-11-01T10:00:30Z","session":"pseudonymous-session-1","event":"read"}
{"timestamp":"2026-11-01T10:01:00Z","session":"pseudonymous-session-1","event":"logout"}
```

- Required fields: `timestamp` (ISO 8601, seconds and timezone), `session`, `event` (nonempty strings, at most 80 characters). Extra fields are ignored, not rendered or modeled.
- Each input supports up to 5,000 events, 1,000 explicit session IDs and 1.5 million characters. File inputs have a 1.5 MB byte limit. Malformed data is rejected with a line number; no silent skipping.
- At least 5 baseline sessions and 20 events are required. These are guardrails, not a claim of enough data for real use. Prefer 30+ representative normal sessions covering normal workflows and time periods.
- Input order can vary: events are sorted by timestamp within each explicit session ID, stable by line on ties. There is no automatic session timeout. Do not reuse a session ID across unrelated sessions.
- `<START>`, `<END>` and `<UNKNOWN>` are reserved event names.
- Export scores is optional. Its JSON includes session IDs and explanation labels. Protect it as potentially sensitive data.

## The learned model

`engine.js` runs unchanged in a browser and Node. No model library or remote inference is used.

1. Fit first-order Markov transition counts over `<START>`, event labels and `<END>` from the baseline only. Additive smoothing alpha = 0.25. For each transition, `p = (count + alpha) / (outgoing_count + alpha * (vocabulary_size + 2))`. The extra outcomes are END and a shared unknown-label bucket. Unseen event labels share that bucket; an unseen source event has no learned outgoing transitions and uses the smoothed uniform fallback.
2. Sequence feature: average `-log2(p)` over transitions. Output shows the three most surprising transitions and their baseline counts. These are evidence about novelty, not causal explanations of an attack.
3. Volume feature: `log(1 + event_count)`. Pace feature: mean `log(1 + gap_seconds)`. Start-hour feature: smoothed negative log probability of the first event's UTC hour.
4. Normalize each feature against baseline mean/spread. Standard-deviation floors (sequence 0.3, volume 0.25, pace 0.5, hour 0.5) avoid division by zero and extreme tiny-sample scaling. Sequence/hour deviations are one-sided; volume/pace deviations are two-sided. Single-event sessions have no pace evidence.
5. Raw score = 0.50 * sequence deviation + 0.20 * volume deviation + 0.20 * pace deviation + 0.10 * hour deviation. These weights are hand-chosen, not learned or optimized.
6. Review line = max(1, training-score 95th percentile + 0.75). **It is calibrated in-sample, not a validated security threshold.** No false-positive-rate or detection-rate guarantee follows from it.

Meaningful ML role: transition probabilities, timing, volume and hour distributions are learned from the provided normal data. Changing that baseline changes what is considered unusual. This is small statistical ML, not an LLM, isolation forest or fixed list of attack signatures.

## Reproduce the checks

Node 20+:

```sh
npm test
# Or: node --test tests.cjs
```

The dependency-free suite covers parser failures and bounds, date/offset handling, order sensitivity, deterministic fixtures, baseline/candidate separation, model immutability during scoring, finite scores, displayed-score decomposition, held-out synthetic candidate ranking, expected misses and static network/storage guards.

The demo uses 48 normal synthetic baseline sessions and 6 disjoint candidate sessions. It is deliberately small and designed to exercise behavior, **not a benchmark**. Candidate patterns informed development. Do not present test pass count as accuracy.

Observed demo behavior:
- Rapid repeated login failures and an unseen export sequence cross the review line.
- Ordinary read sessions and ordinary retries stay below it.
- An unusual UTC hour raises the score but does not alone cross the demo's review line. A patient unusual-hour attack can be missed.
- `known-blind-spot` has the same observable pattern as an ordinary retry. It stays below the line even if the unseen intent is malicious. There is no intent label available to the model.

## Limits and safe use

- Only synthetic checks so far. No production incident data, independent dataset validation, measured real-world accuracy, existing users or impact claims.
- First-order transitions forget long-range order. Session averages can hide brief unusual subsequences. Low-and-slow or normal-looking abuse can pass.
- Poisoned or unrepresentative normal data can teach the wrong baseline. Daylight-saving/work-hour context, location, host roles and identity context are not modeled. There is no impossible-travel feature.
- A legitimate deploy or event-schema change may raise novelty. Unknown event labels are shown for this reason. Start hours are UTC, not a guessed user's local time.
- JSONL only. Raw syslog, Windows Event XML, arbitrary free-text logs and automatic IP/user sessionization are not supported. Convert authorized logs locally and use pseudonymous session IDs first.
- Do not paste secrets, personal information or logs you are not authorized to process. No real systems are scanned or contacted.

## Privacy and implementation

All parsing, fitting and scoring happen in the open tab. The app has no `fetch`, XHR, WebSocket, beacon, analytics, cookies or persistent browser storage. CSP denies connection requests (`connect-src 'none'`) and allows same-origin scripts only. Static hosting still receives normal asset requests and connection metadata. Browser extensions and your device are outside this app's control. Clear all removes inputs/results from the UI; closing the tab ends the in-memory session. Export creates a local download only.

Files: `engine.js` (parser/model), `app.js` (interaction/render/export), `index.html` + `style.css` (UI), `tests.cjs` (checks). Rendered log labels use `textContent`, never raw HTML.

## Contribution and event disclosure

New project implementation started November 16, 2026, during the AI OpenBuild build window. Generative AI assistance was used for the core model implementation, UI, synthetic data, tests and documentation, with review and iterative execution checks. No code from the owner's earlier isolation-forest, intrusion-detection or insider-threat projects was reused. No pretrained model, external dataset, paid AI service or third-party runtime is included.

This is a prototype, not a completed hackathon submission. Event entry materials, demo recording and submission status are tracked separately.

## License

No source-code license has been selected. Public visibility is not a license grant. Do not infer MIT or another license from the account's other repositories.
