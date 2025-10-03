# Repository Agent Instructions

Automation that needs repository-specific guidance should search the tree for instruction files
using a case-insensitive match (for example, `find . -iname 'agents.md'`).

For GitHub authentication details and additional setup guidance, refer to
[`docs/agents.md`](docs/agents.md).

## UI/UX Change Review

- Any modification that touches UI or UX concerns **must** be validated against the
  repository guidelines in [`docs/ui-ux-guidelines.md`](docs/ui-ux-guidelines.md).
- Ensure the implementation continues to follow the existing design system guidance in
  [`ui-guidelines.md`](ui-guidelines.md) alongside the new UI/UX rules.
- Document in PR descriptions how the change satisfies the checklist in both guideline files.

## Testing Expectations

- Run `npm test` for unit and integration checks (Vitest).
- Install the Playwright browsers once with `npx playwright install --with-deps chromium`.
- Run `npm run test:e2e` for Chromium end-to-end coverage before submitting changes that touch UI components.
- Run npm run check
