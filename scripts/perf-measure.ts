#!/usr/bin/env tsx
import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const url = process.env.URL ?? 'http://127.0.0.1:5000/';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });

  // Collect basic navigation timing and resource timings
  const metrics = await page.evaluate(() => {
    const timing = (performance as any).timing || {};
    const nav = (performance as any).getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
    const resources = performance.getEntriesByType('resource').slice(0, 30).map((r) => ({ name: r.name, duration: r.duration }));
    return { timing, nav, resources };
  });

  const out = { url, collectedAt: new Date().toISOString(), metrics };
  const outPath = 'test-results/perf-measure.json';
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('Wrote perf metrics to', outPath);

  await browser.close();
}

run().catch((err) => {
  console.error('Perf measure failed', err);
  process.exit(1);
});
