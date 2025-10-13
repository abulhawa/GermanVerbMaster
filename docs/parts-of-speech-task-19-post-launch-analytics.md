# Task 19 – Post-Launch Analytics & Iteration Loop

## Context & Goals
Tasks 1–18 introduced the lexeme-centric data model, scheduler, feature flags, client registry, and documentation required to ship noun and adjective practice alongside verbs. The goal of Task 19 is to operationalise those foundations by:

- Publishing a dashboard suite that surfaces engagement and quality signals per part of speech (POS) and task type.
- Establishing an iteration loop that uses telemetry (`scheduling_state`, `telemetry_priorities`, unified practice history) to tune scheduler weights and feature rollouts.
- Capturing a backlog of follow-on analytics and content improvements so audio, sentence, and advanced evaluator work can be prioritised post-launch.

## Data Sources Unlocked by Tasks 1–18
| Source | Origin Task(s) | Availability Notes |
| --- | --- | --- |
| `lexemes`, `inflections`, `task_specs`, `content_packs`, `pack_lexeme_map` | Schema RFC + migrations (Tasks 4–5) and ETL refactor (Task 6) | Deterministic IDs allow consistent joins between content, telemetry, and analytics outputs.
| `scheduling_state`, blended priority weights, review snapshots | Scheduler alignment (Task 10) | Stores Leitner metadata and per-attempt weights required to measure queue health.
| `telemetry_priorities` snapshots | Scheduler alignment (Task 10) | Captures scheduled priority scores for offline analysis and model training.
| Unified practice history + submission API | API overhaul (Task 9) | Records `{taskId, lexemeId, pos, taskType, renderer}` for every attempt.
| Client task registry instrumentation & parity tests | Client refactor & UI integration (Tasks 11a–11e, 12) | Emits POS/task mode selection events and renderer-level timing metrics.
| Feature flags & killswitch hooks | Feature flag rollout (Task 17) | Flags (`pos.noun`, `pos.adjective`) expose adoption funnels and enable rapid rollback if dashboards surface regressions.
| Documentation & onboarding assets | Task policies (Task 7), training update (Task 18) | Provide context for operators reviewing dashboards and triaging backlog items.

## Dashboard Suite
Three complementary dashboards will be published in Looker (or Metabase equivalent). Each dashboard consumes the shared Postgres snapshot exported to the analytics warehouse nightly via the existing ETL job.

### 1. POS Adoption & Engagement
- **Audience:** Product, Content Ops, Executive stakeholders.
- **Cadence:** Reviewed twice weekly during rollout, weekly thereafter.
- **Primary visuals:**
  - Stacked area chart of daily active devices per POS (`scheduling_state.device_id` joined with latest `task_specs.pos`).
  - Table of attempts, accuracy, and average latency by `{pos, taskType}` sourced from unified practice history.
  - Feature-flag funnel (e.g., percentage of sessions with noun tasks when the `pos.noun` flag is enabled).
- **Derived metrics:** retention by POS cohort, first-week stickiness, attempt mix compared to queue caps from Task 7.
- **Alerts:** Slack notification if accuracy for any POS drops below 55% or latency exceeds 45 seconds median for 2 consecutive days.

### 2. Scheduler Health & Queue Load
- **Audience:** Platform engineering, data science.
- **Cadence:** Daily check during the first 30 days; weekly afterwards.
- **Primary visuals:**
  - Heat map of `priority_score` distribution by Leitner box and POS using `scheduling_state`.
  - Rolling 7-day trend of due vs. completed tasks to highlight backlog creep.
  - Histogram of `accuracy_weight`, `latency_weight`, `stability_weight` contributions (from `telemetry_priorities`).
- **Derived metrics:** percentage of overdue tasks (>12h past `due_at`), blended score drift relative to launch baseline, per-POS abandonment rate (attempts started vs. completed).
- **Alerts:** PagerDuty trigger if overdue percentage exceeds 20% for any POS or if blended score variance doubles compared to the previous week.

### 3. Content Quality & Feedback Loop
- **Audience:** Content editors, localisation, QA.
- **Cadence:** Weekly review with Content Ops; ad-hoc deep dives when new packs ship.
- **Primary visuals:**
  - Accuracy vs. hint usage per pack (`content_packs` join with practice history metadata).
  - Top 20 tasks by incorrect attempts alongside error notes flagged via client feedback forms (Tasks 11d/12 renderers forward optional annotations).
  - Table of telemetry anomalies (e.g., latency z-scores > 2) to identify confusing prompts or missing audio assets.
- **Derived metrics:** pack-level CSAT from onboarding survey (Task 18 docs reference) and QA status coverage.
- **Alerts:** Jira automation creates a ticket when any pack’s accuracy dips below 50% for three consecutive days or when hint usage spikes >30% of attempts.

## Iteration Loop & Ownership
1. **Daily ingestion:** Existing ETL exports append practice history and telemetry snapshots to the warehouse at 03:00 UTC. Owners: Data Engineering.
2. **Dashboard refresh:** Looker schedules refresh at 05:00 UTC. Owners: Analytics Engineering.
3. **Stand-up checks:** Platform engineering reviews Scheduler Health metrics every stand-up, logging anomalies in the POS rollout channel.
4. **Weekly triage:** Product + Content Ops host a 60-minute review of the Content Quality dashboard to prioritise fixes and backlog items.
5. **Scheduler tuning sprint:** Every two weeks, Data Science recalculates blended weight coefficients using `telemetry_priorities` and proposes adjustments for `accuracy_weight`, `latency_weight`, and `stability_weight`. Changes are gated by feature flags and rolled out via configuration PR with automated regression tests (Task 15 coverage).
6. **Retro & backlog grooming:** Monthly retro evaluates adoption goals against baseline KPIs. New insights feed the backlog below.

## Scheduler Tuning Workflow
- **Input:** Export the latest `telemetry_priorities` rows filtered by POS and Leitner box.
- **Analysis:** Maintain the scheduler tuning notebook (store under `analytics/notebooks/scheduler-tuning.ipynb`) to compute optimal weight adjustments using Bayesian updates seeded with Task 10 baselines.
- **Experiment:** Enable candidate weights behind the `scheduler.experimentalWeights` flag for 10% of traffic. Monitor median latency and accuracy for 48 hours.
- **Rollout:** If improvements exceed +3% accuracy or -10% latency without regression elsewhere, promote weights to default configuration and archive experiment results in `/analytics/reports/YYYY-MM-DD-scheduler-tuning.md`.

## Backlog for Post-Launch Enhancements
| Priority | Item | Description & Goal | Dependencies | Definition of Done |
| --- | --- | --- | --- | --- |
| P0 | Audio prompt analytics | Track playback counts, repeat actions, and correlation with accuracy for upcoming audio-enabled tasks. | Requires audio asset fields from schema RFC (`task_specs.metadata.audio_id`) and renderer updates (future Task 20). | Dashboard tile showing audio usage per POS with <5% missing data; telemetry tables persist `audioPlaybackCount` events. |
| P0 | Sentence-level drill readiness | Instrument prototype sentence tasks (future Task 21) to capture hint usage and partial credit outcomes. | Depends on evaluator plugin work and renderer support. | Practice history records `evaluationDetail`, dashboards expose completion + partial credit rates. |
| P1 | Adaptive difficulty insights | Surface learner progression between Leitner boxes across POS to inform dynamic queue caps. | Scheduler tuning workflow live; requires additional Zod schema fields for difficulty tier. | Scheduler Health dashboard includes Leitner transition matrix; recommendations documented quarterly. |
| P1 | Partner export telemetry | Extend `/api/partner/drills` analytics to include POS mix and completion funnels for B2B clients. | Requires API instrumentation updates and coordination with integrations team. | Partner dashboard section live with authenticated filters; partner MAUs reported monthly. |
| P2 | Offline practice quality | Compare offline vs. online attempt accuracy and latency for mixed POS sessions. | Offline/PWA update (Task 13) instrumentation. | Offline toggle on dashboards with statistically significant sample size; action plan documented when variance >5%. |
| P2 | Hint effectiveness study | Analyse which hint types yield the best accuracy improvements per POS. | Requires consistent hint metadata from ETL (Task 6) and renderer logging. | Report delivered with recommended hint taxonomy adjustments; iteration added to content training guide. |

Backlog items should be tracked in the product roadmap with clear owners and linked analytics acceptance criteria.

## Operational Checklist
- [ ] Confirm Looker connections to the analytics warehouse include new tables.
- [ ] Validate feature flag metrics by running staged rollouts (`pos.noun`, `pos.adjective`) and confirming dashboard deltas.
- [ ] Document dashboard navigation and alert runbooks in `content-admin-guide.md` (Task 18 follow-up).
- [ ] Schedule the first scheduler tuning sprint one week after general availability.

## Appendix – Metrics Dictionary
| Metric | Definition | Source |
| --- | --- | --- |
| Active devices per POS | Count of distinct `device_id` with ≥1 attempt in trailing 7 days, grouped by task POS. | Unified practice history joined with `task_specs.pos`. |
| Median attempt latency | 50th percentile of `response_ms` per `{pos, taskType}`. | Unified practice history. |
| Overdue queue percentage | `(tasks with due_at < now - 12h) / (total active tasks)` per POS. | `scheduling_state`. |
| Hint adoption rate | Percentage of attempts where `hintUsed` is true. | Client instrumentation events stored alongside practice submissions. |
| Pack accuracy | `correctAttempts / totalAttempts` for tasks associated with a pack. | Practice history + `pack_lexeme_map`. |
| Feature flag adoption | Percentage of sessions with ≥1 task under a POS flag after the flag is enabled. | Practice history segmented by flag activation timestamp. |
