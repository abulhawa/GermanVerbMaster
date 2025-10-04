import { describe, expect, it } from "vitest";

import {
  collectDeprecatedProxyEnv,
  formatProxyEnvGuidance,
} from "../../scripts/check-npm-env.mjs";

describe("collectDeprecatedProxyEnv", () => {
  it("flags deprecated npm proxy env variables", () => {
    const issues = collectDeprecatedProxyEnv({
      npm_config_http_proxy: "http://proxy:8080",
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.deprecated).toBe("npm_config_http_proxy");
    expect(issues[0]?.replacement).toBe("npm_config_proxy");
  });

  it("returns empty array when environment is already migrated", () => {
    const issues = collectDeprecatedProxyEnv({
      npm_config_proxy: "http://proxy:8080",
    });

    expect(issues).toHaveLength(0);
  });
});

describe("formatProxyEnvGuidance", () => {
  it("produces actionable instructions", () => {
    const message = formatProxyEnvGuidance([
      {
        deprecated: "npm_config_http_proxy",
        replacement: "npm_config_proxy",
        description: "HTTP proxy forwarding",
      },
    ]);

    expect(message).toContain("export npm_config_proxy=\"$npm_config_http_proxy\"");
    expect(message).toContain("unset npm_config_http_proxy");
  });

  it("returns empty string when there are no issues", () => {
    expect(formatProxyEnvGuidance([])).toBe("");
  });
});
