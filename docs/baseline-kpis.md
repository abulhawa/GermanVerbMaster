# Baseline KPI Snapshot (Sept 2025)

This baseline captures current engagement metrics ahead of Phase 1 work. Data was pulled on 26 Sep 2025 using `npx tsx scripts/baseline-kpis.ts`, which queries the production-like SQLite snapshot (`db/data.sqlite`).

## Headline Metrics
| Metric | Value | Notes |
| --- | --- | --- |
| Active learners (devices, 30 days) | 1 | Sample data contains a single device profile; user accounts are not yet in use. |
| Monthly active users (accounts, 30 days) | 0 | Account system ships in Phase 3; baseline highlights the gap. |
| Total attempts (30 days) | 21 | Represents drills logged on 14 Sep 2025 (UTC). |
| Average daily attempts (active days) | 21 | All attempts happened on one active day. |
| Overall answer accuracy | 61.9% | 13 of 21 attempts were correct. |
| Average time per attempt | 30.7s | Indicates opportunities to shorten sessions via adaptive queueing. |

## Level Breakdown
| CEFR Level | Attempts | Accuracy |
| --- | --- | --- |
| A1 | 21 | 61.9% |

Higher levels currently have no recorded activity; this will inform the seeding strategy for demo accounts and QA scripts.

## Methodology
1. Query `verb_practice_history` for the last 30 days. If no rows exist, fall back to all-time data.
2. Treat unique `device_id` values as learner proxies until account support lands.
3. Compute per-day attempt counts, overall accuracy, and average completion time (milliseconds converted to seconds).
4. Output a JSON summary to prevent Excel drift; paste the results above.

## Follow-Up Actions
- Create synthetic exercise data for levels A2–C1 to stress-test analytics before Phase 1 launch.
- Define MAU targets once account infrastructure (Phase 3) is scoped; until then track device-level actives.
- Pipe the script output into a scheduled report (GitHub Actions candidate) so the board receives automatic updates.