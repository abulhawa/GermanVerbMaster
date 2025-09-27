import { createHash, randomBytes } from 'node:crypto';

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

function sanitizeForSql(value: string | undefined): string {
  if (!value) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

const name = getArg('--name') ?? 'Sandbox Partner';
const contactEmail = getArg('--contact');
const notes = getArg('--notes');
const originsRaw = getArg('--origins');
const origins = originsRaw ? originsRaw.split(',').map((origin) => origin.trim()).filter(Boolean) : undefined;

const apiKey = randomBytes(24).toString('base64url');
const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

console.log('✅ Partner API key generated');
console.log('------------------------------------------');
console.log(` Name:            ${name}`);
if (contactEmail) {
  console.log(` Contact email:   ${contactEmail}`);
}
if (origins && origins.length > 0) {
  console.log(` Allowed origins: ${origins.join(', ')}`);
}
console.log('------------------------------------------');
console.log(` API key (share with partner): ${apiKey}`);
console.log(` SHA-256 hash (store in DB):   ${apiKeyHash}`);
console.log('');
console.log('Insert into SQLite:');
const sql = `INSERT INTO integration_partners (name, api_key_hash, contact_email, allowed_origins, scopes, notes)\nVALUES (${sanitizeForSql(name)}, '${apiKeyHash}', ${sanitizeForSql(contactEmail)}, ${origins ? `'${JSON.stringify(origins)}'` : 'NULL'}, '[]', ${sanitizeForSql(notes ?? 'Generated via scripts/create-partner-key.ts')});`;
console.log(sql);
console.log('');
console.log('Tip: run this against your local database using `sqlite3 db/data.sqlite` or Drizzle migrations.');
