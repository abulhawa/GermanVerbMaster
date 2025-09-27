# Agent Setup Notes

Codex Cloud sessions need a GitHub credential to work with the private repo and the Product Roadmap project board.

> **Tip for agents**: Automatically locate instruction files by running a case-insensitive search such as `find . -iname "agents.md"` from the repository root.

1. Store a PAT (with `repo` and `project` scopes) in the environment secrets as `GITHUB_TOKEN`. The workspace automatically exposes this value as the `GITHUB_TOKEN` environment variable; verify it is populated by running `printenv GITHUB_TOKEN` (the output should be masked).
2. Install `gh`.
3. After the workspace boots, authenticate GitHub CLI by piping the secret from the environment:
   ```bash
   echo "$GITHUB_TOKEN" | gh auth login --with-token
   gh auth status
   ```
   You should see `Logged in to github.com as abulhawa`.
4. Use `git clone https://github.com/abulhawa/GermanVerbMaster.git` or any GitHub API calls; they will reuse the authenticated session.
5. Use GitHub CLI directly to inspect Product Roadmap items:
   ```bash
   export PROJECT_NUMBER=2
   export OWNER=abulhawa
   gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
     | jq -r '.items[] | "\(.title)\t\(.status)"'
   ```
   Adjust the owner, project number, or limit as needed for other projects.
6. When rotating the token, update the secret value in the Codex environment.

SSH keys are optional; the PAT + `gh auth` flow covers both git and project automation calls.

## Product Roadmap Workflow Automation

Codex can move cards between statuses at runtime by composing GitHub CLI calls. The checklist below keeps everything scriptless:

1. Capture identifiers once per session:
   ```bash
   export PROJECT_NUMBER=2
   export OWNER=abulhawa
   PROJECT_ID=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')
   STATUS_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
     --jq '.fields[] | select(.name=="Status") | .id')
   ```
2. List items (with status codes and item IDs) so the assistant can decide what to do next:
   ```bash
   gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
     --jq '.items[] | {number: .content.number, title: .title, status: .status, id: .id}'
   ```
3. When the next task should change status, look up the desired option ID once:
   ```bash
   gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
     --jq '.fields[] | select(.name=="Status") | .options[] | {name, id}'
   ```
   Example: `Next Up -> 1ab37230`, `In Progress -> 0222f038`, `Done -> ba093244`.
4. Apply the update with `gh project item-edit`:
   ```bash
   gh project item-edit "$PROJECT_NUMBER" --owner "$OWNER" \
     --id "$ITEM_ID" \
     --field-id "$STATUS_FIELD_ID" \
     --single-select-option-id "$OPTION_ID"
   ```
   Substitute `$ITEM_ID` (from step 2) and `$OPTION_ID` (from step 3).

The assistant can chain these commands to pick the next backlog item, mark it `In Progress`, and close it as `Done` when the work finishes, so no custom TypeScript tooling is required.
