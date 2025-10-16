# GermanVerbMaster Product & Delivery Roadmap

This roadmap translates the strategic opportunities identified for GermanVerbMaster into a concrete execution plan. It is organized by phases, epics, deliverables, and acceptance criteria, with an accompanying sprint plan and GitHub project board setup to manage the work.

## Roadmap Overview
| Phase | Primary Goal | Duration (est.) |
| --- | --- | --- |
| Phase 0 – Readiness | Align stakeholders, create planning assets, and baseline analytics. | 2 weeks |
| Phase 1 – Adaptive Learning Core | Ship the adaptive review engine and learner-facing progress insights. | 6 weeks |
| Phase 2 – Multi-Modal Practice | Add listening, speaking, and contextual drills for richer pedagogy. | 6 weeks |
| Phase 3 – Data Platform & Accounts | Introduce cloud profiles, syncing, and teacher dashboards. | 8 weeks |
| Phase 4 – Monetization & Partnerships | Package premium offerings and external integrations. | 6 weeks |

Each phase can be delivered incrementally, but the dependencies flow from foundational analytics (Phase 0) through to business extensions (Phase 4).

### Immediate Priority – Verb Corpus Expansion
**Goal:** Expand the German verb database to at least 100 verbs per CEFR level (A1–C2) while maintaining the existing schema for each entry (infinitive, English gloss, Präteritum, Partizip II, auxiliary verb, level, example sentences, vetted source metadata, and pattern classification).

| Workstream | Description | Key Activities | Definition of Done |
| --- | --- | --- | --- |
| Source Vetting & Planning | Identify authoritative CEFR-aligned verb lists for each level. | • Audit Goethe-Institut, telc, Hueber, and DW resources<br>• Capture licensing/attribution requirements<br>• Approve target verb sets (≥120 candidates per level to allow QA pruning) | • Curated source list approved by product & linguistics reviewers<br>• Tracking sheet with URLs, extraction notes, and attribution text |
| Data Extraction & Normalization | Translate vetted sources into the existing `GermanVerb` structure. | • Build a spreadsheet template mirroring `verb-lists.ts` fields<br>• Normalize umlauts/spelling variants, auxiliary selection, and pattern tags<br>• Draft example sentences tied to the same sources or corpus references | • Level spreadsheet populated with ≥110 verbs (buffer before QA) per level<br>• Example sentences reviewed for register and difficulty alignment |
| Quality Assurance & Sign-off | Validate accuracy and readiness for ingestion. | • Cross-check conjugations with Duden or Canoo<br>• Linguistic review for duplicates/conflicts<br>• Prepare import checklist covering tests, seeding, and changelog updates | • Finalized list of ≥100 verbs per level in import-ready format<br>• QA log signed by reviewer with outstanding issues resolved |
| Implementation Readiness | Ensure engineering has a low-friction path to import data. | • Break down ingestion tasks into GitHub issues<br>• Annotate roadmap & backlog with dependencies<br>• Define automated validation scripts (linting, schema checks) | • Issues queued in `Next Up` with acceptance criteria<br>• Validation tooling approach documented (even if build pending) |

> **Status:** Highest priority; move associated GitHub Project cards into `Next Up` immediately and staff with product + linguistics resources before advancing other epics.

## Phase Details

### Phase 0 – Readiness
**Objective:** Establish infrastructure for data-driven decisions and align stakeholders on execution.

| Epic | Description | Key Deliverables | Acceptance Criteria |
| --- | --- | --- | --- |
| 0.1 Planning Enablement | Build planning artifacts and issue hygiene. | • Roadmap, project board, issue templates<br>• Persona & journey updates<br>• Success metrics baseline | • Roadmap published in repo<br>• GitHub Project board live with automation<br>• Baseline KPIs defined (MAU, daily attempts, accuracy) |
| 0.2 Analytics Baseline | Instrument current app to capture required metrics. | • Enhanced logging of attempt timestamps & durations<br>• Analytics dashboard export | • Practice history includes response times & difficulty tags<br>• Dashboard exportable as CSV for baseline report |
| 0.3 Verb Corpus Expansion | Deliver the expanded CEFR-level verb datasets. | • CEFR-level verb spreadsheets (≥100 verbs each) ready for import<br>• QA checklist & reviewer sign-off<br>• Issue set covering ingestion, validation scripts, and regression tests | • Data reviewed against authoritative sources (Goethe, DW, Duden)<br>• Import-ready JSON/TS artifacts validated against schema<br>• GitHub issues moved to `Next Up` with owners assigned |

### Phase 1 – Adaptive Learning Core
**Objective:** Deliver adaptive scheduling, smarter reviews, and motivational insights.

| Epic | Description | Key Deliverables | Acceptance Criteria |
| --- | --- | --- | --- |
| 1.1 Spaced Repetition Engine | Implement Leitner/SRS scheduling on server. | • Drizzle schema updates for scheduling state<br>• API endpoint returning personalized review queue<br>• Background job for queue regeneration | • Learners receive prioritized verbs based on forgetting curves<br>• Queue respects accuracy & response-time weights |
| 1.2 Adaptive Practice UI | Surface adaptive queue and goal tracking in client. | • UI to toggle adaptive vs. free practice<br>• Daily/weekly goal configuration<br>• Progress heatmap & streak widgets | • Adaptive mode default once learner opts in<br>• Goals show completion percentages and trigger reminders |
| 1.3 Insightful Analytics | Expand analytics view to actionable insights. | • “Focus mode” recommendations<br>• Export of trouble verbs<br>• Email summary (if opted in) | • Analytics page lists top 5 verbs to review with supporting data<br>• Weekly digest available via email or download |

### Phase 2 – Multi-Modal Practice
**Objective:** Support diverse learning styles with new practice modalities and contextualization.

| Epic | Description | Key Deliverables | Acceptance Criteria |
| --- | --- | --- | --- |
| 2.1 Audio Comprehension | Add listening exercises and text-to-speech. | • Audio prompt generation using TTS<br>• Listening-only drill mode<br>• Accessibility controls (playback speed, captions) | • Learners can complete listening drills offline/online<br>• Audio drills tracked in analytics with accuracy & replay count |
| 2.2 Pronunciation Practice | Allow speaking/recording drills. | • Speech-recognition integration<br>• Pronunciation scoring feedback<br>• Microphone permission & fallback UI | • Recognition accuracy ≥ industry benchmarks on test set<br>• Pronunciation attempts stored with confidence scores |
| 2.3 Contextual Verb Usage | Provide sentence-level and pattern-based tasks. | • Pattern quests UI grouping related verbs<br>• Cloze sentence drills with hints<br>• Mini-grammar insights per pattern | • Pattern quests unlock sequentially and record completion<br>• Cloze drills accept multiple valid answers with feedback |

### Phase 3 – Data Platform & Accounts
**Objective:** Enable multi-device usage, class management, and richer analytics.

| Epic | Description | Key Deliverables | Acceptance Criteria |
| --- | --- | --- | --- |
| 3.1 Account System & Sync | Optional user accounts with cloud sync. | • OAuth/email sign-up flow<br>• Synced progress history & preferences<br>• Device merge & conflict resolution strategy | • Users can log in from multiple devices and see consistent data<br>• Offline queue flushes to correct profile upon reconnection |
| 3.2 Teacher Dashboards | Classroom management features. | • Class roster & invite flows<br>• Assignment creation from verb sets<br>• Aggregated analytics per class & student | • Teachers can assign practice, monitor completion, and export reports<br>• Student privacy (GDPR compliant) maintained |
| 3.3 Verb Corpus Admin Tools | Streamline verb updates and contributions. | • Admin UI for verb ingestion & tagging<br>• Moderation workflow for community submissions<br>• Versioned offline bundle deployment | • New verbs can be added without code changes<br>• Offline bundle updates propagate with version tracking |

### Phase 4 – Monetization & Partnerships
**Objective:** Package premium offerings, certification, and platform integrations.

| Epic | Description | Key Deliverables | Acceptance Criteria |
| --- | --- | --- | --- |
| 4.1 Premium Plans | Introduce subscription tiers. | • Paywall for premium drills & dashboards<br>• Stripe/Billing integration<br>• Trial and upgrade flows | • Payments processed securely, receipts emailed<br>• Feature flags gate premium experiences cleanly |
| 4.2 Certification & Sharing | Offer verifiable progress artifacts. | • Skill badges & certificates<br>• LinkedIn/Europass share integrations<br>• API for certificate validation | • Learners can generate certificates meeting CEFR-aligned criteria<br>• Shared badges link to verification page |
| 4.3 External Integrations | Open ecosystem for B2B use. | • LTI-compatible module or REST API<br>• Partner sandbox & documentation<br>• Usage analytics for partners | • LMS partners can embed drills with SSO<br>• API usage metrics captured in analytics |

## Sprint Plan (Initial 6 Sprints)
Assuming two-week sprints and a blended product/engineering team, the first six sprints cover Phases 0–1.

| Sprint | Focus | Primary Epics | Key Milestones |
| --- | --- | --- | --- |
| Sprint 0 | Kickoff, Planning & Verb Corpus Mobilization | 0.1, 0.2, 0.3 | Project board live, verb-source approval completed, analytics instrumentation scoped |
| Sprint 1 | Verb Data Production & SRS Foundations | 0.3, 1.1 | ≥100 A1/A2 verbs QA’d and staged; Schema + API updates deployed to staging |
| Sprint 2 | Adaptive UI | 1.1, 1.2 | Adaptive queue visible in client navigation |
| Sprint 3 | Goals & Insights | 1.2, 1.3 | Goal tracking released to beta users |
| Sprint 4 | Analytics Enhancements | 1.3 | Focus mode recommendations GA |
| Sprint 5 | Hardening & Launch | 1.1–1.3 | Adaptive learning GA, post-launch metrics reviewed |

Subsequent sprints can tackle Phase 2 epics, ideally clustered (e.g., dedicate one sprint per modality before integrating cross-cutting analytics updates).

## GitHub Project Board & Issue Management
1. **Create a GitHub Projects (Beta) board** named `Product Roadmap` scoped to the repository.
   - Columns: `Backlog`, `Next Up`, `In Progress`, `Review`, `Ready for Release`, `Done`.
   - Enable automation so merged PRs move cards to `Done`.
   - Pin a dedicated "Verb Corpus Expansion" swimlane/card group and set its cards to `Next Up` with assignees before pulling other work.
2. **Create issue templates** (`.github/ISSUE_TEMPLATE/feature.md`, `research.md`, `bug.md`) that collect:
   - Problem statement & user value
   - Acceptance criteria
   - Definition of done and analytics instrumentation needs
3. **Spin up milestone per phase** (e.g., `Phase 1 – Adaptive Learning Core`) to group issues and track burndown.
4. **Break epics into issues** using labels such as `epic:adaptive-learning`, `type:research`, `type:engineering`, `team:product`.
   - Use GitHub Discussions or Research issues for user interviews and validation tasks.
   - Link issues to epics via task lists in an “epic” issue for each roadmap epic.
5. **Use GitHub Actions for status reporting**: configure a scheduled workflow to post sprint status to the project board and notify stakeholders via Slack/Teams.

## Acceptance Tracking & Reporting
- **Definition of Done:** every deliverable requires implemented feature, automated tests (as applicable), updated documentation, and analytics tracking verified in staging.
- **Phase Gate Reviews:** hold a retrospective and metric review before exiting each phase. Confirm KPIs improved per baseline.
- **Stakeholder Updates:** provide bi-weekly roadmap updates summarizing completed cards, upcoming focus, risks, and decisions.

## Dependencies & Risks
- Speech-recognition and audio features require evaluation of browser support and data privacy compliance.
- Account system introduces GDPR considerations—plan privacy reviews during Phase 3.
- Monetization features need legal review and customer-support readiness before launch.

This roadmap positions GermanVerbMaster to evolve from a single-device practice app into a comprehensive, adaptive learning platform with monetizable offerings and institutional value.
