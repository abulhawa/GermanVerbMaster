#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install it and authenticate with GITHUB_TOKEN before continuing." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for JSON parsing." >&2
  exit 1
fi

: "${OWNER:?Set OWNER (e.g. export OWNER=abulhawa)}"
: "${PROJECT_NUMBER:?Set PROJECT_NUMBER (e.g. export PROJECT_NUMBER=2)}"

usage() {
  cat <<USAGE
Usage: $0 ISSUE_NUMBER [--status "Desired Status"] [--ensure-on-board]

Options:
  --status           Desired project status (e.g. "Done").
                     When supplied, the script updates the card if it differs.
  --ensure-on-board  Add the issue to the project board if it is missing.
USAGE
  exit 1
}

ISSUE_NUMBER=""
DESIRED_STATUS=""
ENSURE_ON_BOARD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status)
      [[ $# -ge 2 ]] || usage
      DESIRED_STATUS="$2"
      shift 2
      ;;
    --ensure-on-board)
      ENSURE_ON_BOARD=true
      shift
      ;;
    -*)
      usage
      ;;
    *)
      if [[ -z "$ISSUE_NUMBER" ]]; then
        ISSUE_NUMBER="${1#\#}"
        shift
      else
        usage
      fi
      ;;
  esac
done

[[ -n "$ISSUE_NUMBER" ]] || usage
[[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]] || { echo "ISSUE_NUMBER must be numeric." >&2; exit 1; }

fetch_item() {
  gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 200 \
    --jq ".items[] | select(.content.number == $ISSUE_NUMBER)"
}

ITEM_JSON="$(fetch_item || true)"

if [[ -z "$ITEM_JSON" ]]; then
  if $ENSURE_ON_BOARD; then
    echo "Issue #$ISSUE_NUMBER not found on project. Adding…"
    CONTENT_ID=$(gh issue view "$ISSUE_NUMBER" --json id --jq '.id')
    gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --content-id "$CONTENT_ID" >/dev/null
    ITEM_JSON="$(fetch_item || true)"
  else
    echo "Issue #$ISSUE_NUMBER is not on the project board."
    exit 1
  fi
fi

if [[ -z "$ITEM_JSON" ]]; then
  echo "Unable to locate the project item for issue #$ISSUE_NUMBER after ensuring it exists." >&2
  exit 1
fi

ITEM_ID=$(jq -r '.id' <<<"$ITEM_JSON")
CURRENT_STATUS=$(jq -r '.status' <<<"$ITEM_JSON")
TITLE=$(jq -r '.title' <<<"$ITEM_JSON")

echo "Issue #$ISSUE_NUMBER – $TITLE"
echo "Current status: ${CURRENT_STATUS:-unknown}"

if [[ -n "$DESIRED_STATUS" && "$CURRENT_STATUS" != "$DESIRED_STATUS" ]]; then
  STATUS_FIELD_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
    --jq '.fields[] | select(.name=="Status") | .id')

  OPTION_ID=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
    --jq ".fields[] | select(.name==\"Status\") | .options[] | select(.name==\"$DESIRED_STATUS\") | .id")

  if [[ -z "$OPTION_ID" ]]; then
    echo "Status \"$DESIRED_STATUS\" is not a valid option. Available options:"
    gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json \
      --jq '.fields[] | select(.name=="Status") | .options[] | .name'
    exit 1
  fi

  gh project item-edit "$PROJECT_NUMBER" --owner "$OWNER" \
    --id "$ITEM_ID" \
    --field-id "$STATUS_FIELD_ID" \
    --single-select-option-id "$OPTION_ID" >/dev/null

  echo "Updated status to \"$DESIRED_STATUS\"."
else
  echo "No status change requested."
fi
