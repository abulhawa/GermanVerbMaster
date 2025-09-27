#!/usr/bin/env tsx
import fetch from "node-fetch";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{
    message: string;
  }>;
};

type ProjectQueryResponse = {
  organization?: {
    projectV2?: ProjectMetadata | null;
  } | null;
  user?: {
    projectV2?: ProjectMetadata | null;
  } | null;
};

type ProjectMetadata = {
  id: string;
  title: string;
  url: string;
  views: {
    nodes: Array<{
      id: string;
      name: string;
      filter?: string | null;
    }>;
  };
};

type ItemsPage = {
  node?: {
    items: {
      nodes: Array<{
        fieldValueByName?: {
          name?: string | null;
        } | null;
      }>;
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
      };
    };
  } | null;
};

const OWNER = process.argv[2] ?? "abulhawa";
const PROJECT_NUMBER = Number.parseInt(process.argv[3] ?? "2", 10);
const VIEW_NAME = process.argv[4] ?? "Product Roadmap";

if (Number.isNaN(PROJECT_NUMBER)) {
  console.error(`Project number must be numeric. Received: ${process.argv[3] ?? ""}`);
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

if (!token) {
  console.error(
    "A GitHub token is required. Set GITHUB_TOKEN (with repo + project scopes) in the environment.",
  );
  process.exit(1);
}

async function githubGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "GermanVerbMaster/product-roadmap-status-counts",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText} -> ${text}`);
  }

  const payload = (await response.json()) as GraphQLResponse<T>;

  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${payload.errors.map((err) => err.message).join("; ")}`);
  }

  if (!payload.data) {
    throw new Error("GitHub GraphQL response did not include data.");
  }

  return payload.data;
}

async function loadProject(): Promise<ProjectMetadata> {
  const data = await githubGraphql<ProjectQueryResponse>(
    `query($owner: String!, $number: Int!) {
      organization(login: $owner) {
        projectV2(number: $number) {
          id
          title
          url
          views(first: 20) {
            nodes {
              id
              name
              filter
            }
          }
        }
      }
      user(login: $owner) {
        projectV2(number: $number) {
          id
          title
          url
          views(first: 20) {
            nodes {
              id
              name
              filter
            }
          }
        }
      }
    }`,
    { owner: OWNER, number: PROJECT_NUMBER },
  );

  const project = data.organization?.projectV2 ?? data.user?.projectV2;

  if (!project) {
    throw new Error(`Unable to load project ${OWNER} #${PROJECT_NUMBER}.`);
  }

  return project;
}

async function* iterateItems(projectId: string, filter: string | null | undefined) {
  let hasNextPage = true;
  let cursor: string | null | undefined;

  while (hasNextPage) {
    const page = await githubGraphql<ItemsPage>(
      `query($projectId: ID!, $filter: String, $after: String) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100, query: $filter, after: $after) {
              nodes {
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }`,
      {
        projectId,
        filter: filter ?? null,
        after: cursor ?? null,
      },
    );

    const itemsContainer = page.node?.items;

    if (!itemsContainer) {
      throw new Error("Failed to load project items from GitHub API.");
    }

    for (const item of itemsContainer.nodes) {
      yield item.fieldValueByName?.name ?? "(no status)";
    }

    hasNextPage = itemsContainer.pageInfo.hasNextPage;
    cursor = itemsContainer.pageInfo.endCursor ?? null;
  }
}

async function main() {
  try {
    const project = await loadProject();
    const view = project.views.nodes.find((candidate) => candidate.name === VIEW_NAME);

    if (!view) {
      const available = project.views.nodes.map((candidate) => candidate.name).join(", ") || "none";
      throw new Error(`View '${VIEW_NAME}' was not found. Available views: ${available}.`);
    }

    const statusCounts = new Map<string, number>();
    let total = 0;

    for await (const status of iterateItems(project.id, view.filter)) {
      total += 1;
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }

    const backlogCount = statusCounts.get("Backlog") ?? 0;
    const doneCount = statusCounts.get("Done") ?? 0;

    console.log(`Project: ${project.title}`);
    console.log(`URL: ${project.url}`);
    console.log(`View: ${VIEW_NAME}`);
    console.log(`Filter: ${view.filter ?? "(none)"}`);
    console.log("");
    console.log(`Total items in view: ${total}`);
    console.log(`Backlog items: ${backlogCount}`);
    console.log(`Done items: ${doneCount}`);

    const sortedStatuses = Array.from(statusCounts.entries()).sort((a, b) => b[1] - a[1]);
    if (sortedStatuses.length) {
      console.log("");
      console.log("Breakdown by status:");
      for (const [status, count] of sortedStatuses) {
        console.log(`- ${status}: ${count}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

await main();
