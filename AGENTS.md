# Repository Agent Instructions

Automation that needs repository-specific guidance should search the tree for instruction files
using a case-insensitive match (for example, `find . -iname 'agents.md'`).

For GitHub authentication details and additional setup guidance, refer to
[`docs/agents.md`](docs/agents.md).

## Runtime Requirements
- First check is node is installed (`node -v` should be `24.9.0`).
- If node is missing, install Node.js **24.9.0** and use it for all tooling (npm, pnpm, vite, etc.).
- If `nvm` is available:
  ```bash
  nvm install 24.9.0
  nvm use 24.9.0
  ```
- else, use `volta`
  ```bash
  set -e
  export VOLTA_HOME="$HOME/.volta"
  export PATH="$VOLTA_HOME/bin:$PATH"

  if [ ! -x "$VOLTA_HOME/bin/volta" ]; then
    curl -sSf https://get.volta.sh | bash >/dev/null 2>&1
    export PATH="$VOLTA_HOME/bin:$PATH"
  fi
  volta install node@24.9.0
  ```
- Otherwise, install Node 24.9.0 via your preferred version manager (such as `fnm`, `asdf`, or a
  direct tarball download) and ensure the `node` and `npm` binaries exposed in `$PATH` report
  version 24.9.0 before running repository commands.

## Testing Expectations

- Run `npm test` for unit and integration checks (Vitest).
- Install the Playwright browsers once with `npx playwright install --with-deps chromium`.
- Run `npm run test:e2e` for Chromium end-to-end coverage before submitting changes that touch UI components.
- Run npm run check
