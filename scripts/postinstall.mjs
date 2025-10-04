#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const SKIP_FLAG = "GERMAN_VERB_MASTER_SKIP_NATIVE_REBUILD";

if (process.env[SKIP_FLAG] === "1") {
  process.exit(0);
}

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.warn(
    "[postinstall] Unable to locate npm executable path; skipping better-sqlite3 rebuild.",
  );
  process.exit(0);
}

const env = { ...process.env, [SKIP_FLAG]: "1" };
if (env.npm_config_http_proxy && !env.npm_config_proxy) {
  env.npm_config_proxy = env.npm_config_http_proxy;
}
delete env.npm_config_http_proxy;

const rebuild = spawnSync(
  process.execPath,
  [npmExecPath, "rebuild", "better-sqlite3"],
  { stdio: "inherit", env },
);

if (rebuild.error) {
  console.error("[postinstall] Failed to spawn npm rebuild:", rebuild.error);
  process.exit(1);
}

if (typeof rebuild.status === "number" && rebuild.status !== 0) {
  console.error(
    "[postinstall] npm rebuild better-sqlite3 exited with status",
    rebuild.status,
  );
  process.exit(rebuild.status);
}
