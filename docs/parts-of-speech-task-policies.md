# Task Policies for Initial Parts-of-Speech Rollout

The first wave of lexeme-centric tasks introduces one production task type per supported part of speech. This document captures queue limits, renderer requirements, and evaluation rules so server and client implementations stay aligned while additional POS are onboarded.

## Summary

| POS | Task Type | Renderer | Queue Cap | Evaluation | Notes |
| --- | --- | --- | --- | --- | --- |
| Verb (`verb`) | `conjugate_form` | `conjugate_form` | 30 | Normalised string equality | Covers Präteritum and Partizip II prompts. |
| Noun (`noun`) | `noun_case_declension` | `noun_case_declension` | 25 | Normalised string equality | Focused on accusative plural formation. |
| Adjective (`adjective`) | `adj_ending` | `adj_ending` | 20 | Normalised string equality | Targets comparative endings first. |

All evaluations normalise whitespace and case before comparison. Future iterations will introduce richer evaluators (e.g. multi-answer lists, fuzzy matching) but initial release keeps parity with existing verb drills.

## Queue Policies

### Verbs – `conjugate_form`
- **Queue cap**: 30 concurrent verb tasks per device.
- **Rotation rule**: Promote to higher Leitner box after a correct response; reset to box 1 on mistakes. Due date multiplier equals the current Leitner box in hours.
- **Hints**: German and English example sentences plus auxiliary verb when available.
- **Prompt contract**:
  - `requestedForm.tense`: `past` or `participle`.
  - `requestedForm.person`: `3` for past-tense drills; omitted for participles.
  - `requestedForm.number`: `singular`.
- **Solution contract**: single orthographic form in standard German.

### Nouns – `noun_case_declension`
- **Queue cap**: 25 tasks per device.
- **Rotation rule**: Identical Leitner behaviour to verbs; due date multiplier fixed at 45 minutes for incorrect responses.
- **Hints**: Source example sentences and gender article (der/die/das) when known.
- **Prompt contract**:
  - `requestedCase`: `accusative`.
  - `requestedNumber`: `plural`.
  - `gender`: optional but recommended for articles.
- **Solution contract**: plural surface form; optional article returned in metadata for renderer display.

### Adjectives – `adj_ending`
- **Queue cap**: 20 tasks per device to avoid crowding higher-difficulty material.
- **Rotation rule**: Correct responses increase Leitner box by one (max 5); incorrect responses reset to box 1 and schedule a retry in 15 minutes.
- **Hints**: Example sentences only; no automatic stems provided in v1.
- **Prompt contract**:
  - `degree`: fixed to `comparative` initially.
  - `syntacticFrame`: simple sentence scaffold for contextual cues.
- **Solution contract**: comparative inflected form.

## Enforcement Notes

- Server-side validation uses the shared Zod schemas in `shared/task-registry.ts`. ETL and migrations must conform to these schemas to avoid seeding invalid payloads.
- Queue caps are enforced by the scheduler in `POST /api/submission`; future work will introduce proactive throttling before queue generation.
- All seeded tasks declare their originating pack via `sourcePack` to simplify audit logging and selective replays.
- Legacy verb endpoints (`/api/quiz/verbs`, `/api/practice-history`, etc.) continue to operate but emit deprecation headers pointing clients to `/api/tasks`.

## Future Extensions

- Add nominative singular noun drills and adjective superlative tasks once renderer support lands.
- Introduce evaluator plugins for multi-answer prompts (e.g., alternate plural forms).
- Expand queue policy metadata to include per-pack overrides for curated courses.
