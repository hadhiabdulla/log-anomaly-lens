# Evaluation notes

## What has been demonstrated

The test suite executes the exact scoring core used by the browser. Deterministic normal-training data is separate from the six synthetic candidates. Fixtures were designed during implementation and are not an independent benchmark. No percentage-accuracy metric is reported.

The included examples cover ordinary read sessions, a normal failed-login retry, rapid repeated retries, new export transitions, an unusual UTC hour and a known normal-looking blind spot. The model ranks session sequences, not isolated log records. All model fitting uses only the baseline input. No ground-truth labels are fed into fitting or scoring.

Run `node --test tests.cjs` to reproduce assertions. Core weights, smoothing and review-line formula are fixed engineering choices. The review line uses training scores; it is not tuned on a held-out real validation set. The six candidates are held out from fitting, but their design informed development. Both facts matter.

## Failure examples to show in a demo

1. Load the synthetic demo and compare. `known-blind-spot` stays below the line, because its normal-looking failed-login/retry/read/logout observations do not encode malicious intent.
2. `unusual-hour` scores higher than ordinary activity but stays below the review line. Hour novelty alone is not enough under these weights.
3. The export candidate is flagged whether exports are authorized or malicious. A legitimate new export workflow is a false alarm if interpreted as an attack. The app calls it novelty instead.
4. Replace the baseline with the candidate window: the app refuses exact identical text, but this cannot prevent a user from training on contaminated, reformatted or overlapping data. A matching-session-ID warning is not a leakage detector.

## Before real operational use

Use an authorized independent dataset with known context; separate training, tuning and test windows; document baseline contamination and schema drift; evaluate per-workflow alert load, ranking quality and misses; tune parameters on validation only. This work has not been done. Nothing in this repository supports automated blocking or a production security claim.
