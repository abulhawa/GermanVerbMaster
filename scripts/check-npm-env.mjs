#!/usr/bin/env node

const PROXY_MAPPINGS = [
  {
    deprecated: "npm_config_http_proxy",
    replacement: "npm_config_proxy",
    description: "HTTP proxy forwarding",
  },
];

function collectDeprecatedProxyEnv(env = process.env) {
  return PROXY_MAPPINGS.filter(({ deprecated }) => env[deprecated]);
}

function formatProxyEnvGuidance(issues) {
  if (issues.length === 0) {
    return "";
  }

  const lines = [
    "Detected deprecated npm proxy environment variable(s):",
    ...issues.map(
      ({ deprecated, replacement, description }) =>
        `  • ${deprecated} (${description}) → use ${replacement}`,
    ),
    "",
    "Update your shell configuration before rerunning npm commands:",
    "  export npm_config_proxy=\"$npm_config_http_proxy\"",
    "  unset npm_config_http_proxy",
  ];

  return lines.join("\n");
}

export { collectDeprecatedProxyEnv, formatProxyEnvGuidance };

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const issues = collectDeprecatedProxyEnv();

  if (issues.length > 0) {
    const message = formatProxyEnvGuidance(issues);
    console.error(`${message}\n`);
    process.exit(1);
  }
}
