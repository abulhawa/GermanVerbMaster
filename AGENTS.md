# Repository Agent Instructions

Automation that needs repository-specific guidance should search the tree for instruction files
using a case-insensitive match (for example, `find . -iname 'agents.md'`).

For GitHub authentication details and additional setup guidance, refer to
[`docs/agents.md`](docs/agents.md).

## UI/UX Change Review

- Any modification that touches UI or UX concerns **must** be validated against the
  unified product and design-system guidance in [`docs/ui-ux-guidelines.md`](docs/ui-ux-guidelines.md).
- Document in PR descriptions how the change satisfies the checklist in that guideline file.

## Testing Expectations

- Run `npm test` for unit and integration checks (Vitest).
- Install the Playwright browsers once with `npx playwright install --with-deps chromium`.
- Run `npm run test:e2e` for Chromium end-to-end coverage before submitting changes that touch UI components.
- Run npm run check
