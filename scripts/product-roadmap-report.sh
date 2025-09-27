#!/usr/bin/env bash
set -euo pipefail

OWNER="${1:-abulhawa}"
PROJECT_NUMBER="${2:-2}"
VIEW_NAME="${3:-Product Roadmap}"

if ! command -v gh >/dev/null 2>&1; then
  echo "The GitHub CLI (gh) is required but was not found in PATH." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run 'echo \"\$GITHUB_TOKEN\" | gh auth login --with-token' first." >&2
  exit 1
fi

project_json=$(gh project view --owner "$OWNER" --number "$PROJECT_NUMBER" --format json)

if [[ -z "$project_json" ]]; then
  echo "Failed to retrieve project metadata for $OWNER project #$PROJECT_NUMBER." >&2
  exit 1
fi

mapfile -t parsed < <(printf '%s' "$project_json" | node - "$VIEW_NAME" "$OWNER" "$PROJECT_NUMBER" <<'NODE')
const fs = require('fs');
const [viewName, owner, projectNumber] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
if (!Array.isArray(data.views)) {
  console.error(`Project metadata for ${owner}/${projectNumber} did not include any views.`);
  process.exit(1);
}
const view = data.views.find((v) => v.name === viewName);
if (!view) {
  const available = data.views.map((v) => v.name).join(', ');
  console.error(`View '${viewName}' was not found. Available views: ${available || 'none'}.`);
  process.exit(1);
}
console.log(view.id);
console.log(data.id);
console.log(data.title);
console.log(data.url);
NODE

if [[ ${#parsed[@]} -ne 4 ]]; then
  echo "Failed to parse project metadata." >&2
  exit 1
fi

VIEW_ID="${parsed[0]}"
PROJECT_ID="${parsed[1]}"
PROJECT_TITLE="${parsed[2]}"
PROJECT_URL="${parsed[3]}"

view_payload=$(gh api graphql -f query='query($projectId: ID!, $viewId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      view(id: $viewId) {
        name
        filter
      }
    }
  }
}' -F projectId="$PROJECT_ID" -F viewId="$VIEW_ID")

view_filter=$(printf '%s' "$view_payload" | node <<'NODE')
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const project = payload.node;
if (!project || !project.view) {
  console.error('Unable to load view metadata from GitHub API.');
  process.exit(1);
}
const filter = project.view.filter || '';
console.log(filter);
NODE

items_payload=$(gh api graphql -f query='query($projectId: ID!, $filter: String!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: 200, query: $filter) {
        totalCount
        nodes {
          content {
            __typename
            ... on DraftIssue {
              title
            }
            ... on Issue {
              title
              url
            }
            ... on PullRequest {
              title
              url
            }
          }
        }
      }
    }
  }
}' -F projectId="$PROJECT_ID" -F filter="$view_filter")

printf 'Project: %s\n' "$PROJECT_TITLE"
printf 'URL: %s\n' "$PROJECT_URL"
printf 'View: %s\n' "$VIEW_NAME"

printf '%s' "$items_payload" | node <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const project = payload.node;
if (!project) {
  console.error('Unexpected response from GitHub API.');
  process.exit(1);
}
const itemsContainer = project.items ?? { totalCount: 0, nodes: [] };
console.log(`Items in view: ${itemsContainer.totalCount}`);
const items = itemsContainer.nodes ?? [];
if (!items.length) {
  console.log('No items found.');
  process.exit(0);
}
console.log('\nTop items:');
for (const item of items.slice(0, 20)) {
  const content = item.content || {};
  const title = content.title || '(draft card)';
  const url = content.url || 'n/a';
  console.log(`- ${title}${url !== 'n/a' ? ` -> ${url}` : ''}`);
}
NODE
