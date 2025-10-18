import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function logDecommissionedNotice(): void {
  console.log(
    'Seed pipeline disabled: enrichment data is now managed exclusively through schema migrations.',
  );
  console.log('No database changes were made.');
}

async function main(): Promise<void> {
  logDecommissionedNotice();
}

const executedAsScript = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');

if (executedAsScript) {
  try {
    await main();
  } catch (error) {
    console.error('Unexpected error while running the seed stub:', error);
    process.exit(1);
  }
}

export { logDecommissionedNotice };
