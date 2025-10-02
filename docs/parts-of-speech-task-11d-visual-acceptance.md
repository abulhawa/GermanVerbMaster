# Task 11d – UI Integration & Preset Acceptance Notes

Date: 2025-10-05

## Scope
- Verified the refactored Home practice flow renders tasks via the new task store and registry-driven renderers.
- Confirmed the "Verbs only" preset banner, session progress meter, and progress sidebar reflect task-centric state.
- Validated settings dialog updates renderer preferences and CEFR level while refreshing the practice queue.

## Visual Checks
1. **Initial load**
   - Home page renders focus card with conjugation prompt fetched from `/api/tasks` (falls back to legacy verbs when offline).
   - Session progress bar initialises at 0% and updates after completing a task.
2. **Task submission states**
   - Correct submission shows success banner, queues next task, and updates sidebar metrics.
   - Incorrect submission displays expected form hint and retains task for retry.
3. **Settings dialog**
   - Changing verb level triggers queue refresh and resets session state.
   - Toggling hints/examples immediately updates renderer behaviour for subsequent tasks.
4. **Error handling**
   - When the task feed is unavailable, the inline retry control appears beneath the card with descriptive messaging.
   - Retry action clears the error and re-attempts the fetch.

## Follow-up
- Task 11e will add automated UI parity tests and Playwright smoke coverage for mixed-POS sessions.
