# POS Selection UX Wireframes

These low-fidelity wireframes translate the audit findings into a navigation flow that keeps the current verb-first experience intact while exposing upcoming parts of speech. Stakeholder feedback from the design sync on 2025-02-05 is captured inline.

## 1. Home Screen Mode Switcher

```
+-----------------------------------------------------------+
|  Header: "Heute üben"                                     |
|-----------------------------------------------------------|
|  Mode Chips: [All Tasks] [Verbs] [Nouns] [Adjectives] [+] |
|  (Feedback: Keep "Verbs" pre-selected for legacy users.)  |
|                                                           |
|  Quick Actions                                            |
|  -------------------------------------------------------  |
|  | Daily Goal | Review Queue | Browse Packs |           | |
|  -------------------------------------------------------  |
|                                                           |
|  Featured Pack Card (verb default)                        |
|  - Title, progress bar, CTA button                        |
|                                                           |
|  Mixed Queue Preview (3 slots)                            |
|  - Slot shows icon (V/N/Adj), lemma, due status           |
+-----------------------------------------------------------+
```

- **Navigation impact**: Mode chips update query params (`?mode=verbs|nouns|adjectives|all|custom`).  
- **Legacy safeguard**: When returning users arrive via `/home`, default chip remains **Verbs** until they interact with others.

## 2. Review Queue Drawer

```
+------------------- Review Queue --------------------------+
| Filters: POS [✓ Verb] [✓ Noun] [ ] Adjective | Sort ▼     |
|-----------------------------------------------------------|
| Task Row                                                  |
|  [V] spielen – Conjugate (due in 3h)                      |
|  Badge: "Streak 5" | CTA: "Üben"                          |
|-----------------------------------------------------------|
| Task Row                                                  |
|  [N] das Kind – Case Drill (due now, priority ↑)          |
|  Badge: "Neu" | CTA: "Üben"                               |
+-----------------------------------------------------------+
```

- **Stakeholder note**: keep filter defaults mirroring mode switcher. Sort order uses blended priority (from new scheduling tables).  
- **Offline parity**: Drawer reads from local `review-queue` store keyed by new `taskId` fields.

## 3. Content Pack Browser

```
+------------------- Packs ---------------------------------+
| Search [             ]  POS Filter: (All ▼)               |
|-----------------------------------------------------------|
| Pack Tile                                                |
|  Icon: 🧠  Title: "B1 Noun Genders"                       |
|  Metadata: POS=Noun | Tasks=120 | License=CC BY-SA        |
|  CTA: [Add to Practice]                                  |
|-----------------------------------------------------------|
| Pack Tile                                                |
|  Icon: ✨  Title: "Irregular Verb Boost"                  |
|  Metadata: POS=Verb | Tasks=80 | License=CC BY-SA         |
|  CTA: [Add to Practice]                                  |
+-----------------------------------------------------------+
```

- **Design decision**: CTA adds pack to `content_packs` join table and triggers background download of inflections.  
- **Approval**: Stakeholders confirmed cards should surface license for editor workflows.

## 4. Session Renderer Selector

```
+------------------- Practice Session ----------------------+
| Breadcrumb: Home › Practice › das Kind                    |
| Renderer Tabs: [Case Drill] [Article Match] [Audio]       |
|-----------------------------------------------------------|
| Active Renderer (Case Drill)                              |
|  Prompt: "Wähle den richtigen Artikel für ..."            |
|  Answer widgets adapt per renderer                        |
+-----------------------------------------------------------+
```

- **Task registry integration**: Renderer tabs come from task metadata; verbs show conjugation prompts by default.  
- **Accessibility**: maintain keyboard shortcuts across renderers.  
- **Open question**: audio renderer MVP blocked until audio assets pipeline defined (tracked separately).

## Flow Notes

1. Navigation remains anchored at `/home`, `/review`, `/packs`. Links propagate the selected POS mode to maintain context.  
2. Mixed queue preview reuses existing review card component with icon/pill additions; no breaking changes expected.  
3. Offline-first behaviour: When offline, chips and filters persist but disable remote pack fetch, showing cached packs only.  
4. Analytics instrumentation: Each mode switch emits `task_mode_selected` with `{ pos_mode, source }` to feed new telemetry tables.
