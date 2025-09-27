# Codex Roadmap Sync Checklist

Use this playbook during Codex Cloud working sessions to keep the Product Roadmap board and the
issue currently in progress synchronized. The steps assume you have already provisioned the
GitHub personal access token documented in [`docs/agents.md`](agents.md).

## 1. Authenticate GitHub CLI in the workspace

```bash
printenv GITHUB_TOKEN # output should be masked
command -v gh >/dev/null || sudo npm install -g gh # install if missing
command -v jq >/dev/null || sudo apt-get update && sudo apt-get install -y jq

echo "$GITHUB_TOKEN" | gh auth login --with-token
```

Confirm the session:

```bash
gh auth status
```

## 2. Set the project context once per session

```bash
export OWNER=abulhawa
export PROJECT_NUMBER=2
```

If you regularly collaborate on other roadmap boards, change these values accordingly.

## 3. Run the roadmap status helper after each task

The repository ships a convenience script that validates the active issue and (optionally)
updates the status to match your current state of work.

```bash
./scripts/check_roadmap_status.sh <ISSUE_NUMBER> \
  --status "In Progress" \
  --ensure-on-board
```

- Replace `<ISSUE_NUMBER>` with the numeric identifier from GitHub (for example `123`).
- Drop `--status` when you only need to verify the card exists without changing its state.
- Use `--status "Done"` once the implementation and review checklist are complete.
- Omit `--ensure-on-board` if you want the command to fail when the card is missing (useful
  during QA to detect workflow regressions).

The script will:

1. Confirm the issue has a matching project item.
2. Add the issue to the board automatically when `--ensure-on-board` is present.
3. Display the current roadmap status.
4. Align the status with the value passed via `--status`, aborting with a list of valid options
   when the target column does not exist.

## 4. Capture results in your session notes

Log the output from step 3 in the Codex transcript or task notes so reviewers can confirm the
roadmap status was checked before moving on to the next issue.

Following this checklist ensures the Product Roadmap reflects the source of truth for any Codex
engagement and avoids surprises during handoff.
