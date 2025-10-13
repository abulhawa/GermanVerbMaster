import { resolveConfigFromEnv, runEnrichment } from "./enrichment/pipeline";

async function main() {
  const config = resolveConfigFromEnv();
  console.log("Starting enrichment pipeline with config:", {
    mode: config.mode,
    limit: config.limit,
    apply: config.apply && !config.dryRun,
    onlyIncomplete: config.onlyIncomplete,
    enableAi: config.enableAi,
    allowOverwrite: config.allowOverwrite,
  });

  const result = await runEnrichment(config);

  console.log(`Scanned ${result.scanned} entries.`);
  console.log(`Proposed updates for ${result.updated} words.`);
  if (result.applied) {
    console.log(`Applied updates to ${result.applied} words.`);
  } else if (config.apply && config.dryRun) {
    console.log("Dry run enabled; no database changes were applied.");
  }

  if (result.backupPath) {
    console.log(`Backup saved to ${result.backupPath}`);
  }
  if (result.reportPath) {
    console.log(`Report written to ${result.reportPath}`);
  }
}

main().catch((error) => {
  console.error("Enrichment pipeline failed:", error);
  process.exitCode = 1;
});
