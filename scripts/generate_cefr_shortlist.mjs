import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const externalDir = path.join(repoRoot, "docs", "external");
const outputDir = path.join(repoRoot, "docs", "verb-corpus");
fs.mkdirSync(outputDir, { recursive: true });

const rows = [];
const seen = new Set();

function normalizeWhitespace(value) {
  return value.replace(/[\u00A0\s]+/g, " ").trim();
}

function looksLikeInfinitive(word) {
  if (!word) return false;
  return /[a-zäöüß]+$/i.test(word);
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseCsvFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ? values[index].trim() : "";
    });
    return entry;
  });
}

function extractDtzVerbs(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const verbs = new Set();
  const skipPrefixes = [
    "hat ", "ist ", "war ", "waren ", "sich ", "hatte ", "hatten ", "wurden ", "wurde ",
    "habe ", "haben ", "konnte ", "konnten ", "sollte ", "sollten ", "musste ", "mussten ",
    "wollte ", "wollten ", "kann ", "können ", "möchte ", "möchten ", "mag ", "machte ",
    "gibt ", "bot ", "gab ", "ging ", "kam ", "lag ", "nahm ", "sah ", "stand ",
    "trug ", "trat ", "fiel ", "fand ", "fing ", "fuhr "
  ];
  const allowList = new Set(["sein", "tun"]);
  for (const lineRaw of lines) {
    const sanitized = lineRaw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
    if (!sanitized) continue;
    const lower = sanitized.toLowerCase();
    const match = lower.match(/^([a-zäöüß]+)/);
    if (!match) continue;
    const lemma = match[1];
    const charAfterLemma = sanitized.charAt(lemma.length);
    if (charAfterLemma !== ",") continue;
    if (!lemma.endsWith("en") && !allowList.has(lemma)) continue;
    const parts = lower.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const secondPart = parts[1];
    if (!/^[a-zäöüß]/.test(secondPart)) continue;
    if (["der", "die", "das", "den", "dem", "des"].some((article) => secondPart.startsWith(`${article} `))) continue;
    if (skipPrefixes.some((prefix) => secondPart.startsWith(prefix))) continue;
    verbs.add(lemma.normalize("NFC"));
  }
  return verbs;
}

function extractLingsterVerbCandidates(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const verbs = new Set();
  const allowList = new Set(["sein", "tun"]);
  for (const lineRaw of lines) {
    const sanitized = lineRaw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
    if (!sanitized) continue;
    const lower = sanitized.toLowerCase();
    const match = lower.match(/^([a-zäöüß]+) (a1|a2|b1|b2)\b/);
    if (!match) continue;
    const lemma = match[1];
    if (!lemma.endsWith("en") && !allowList.has(lemma)) continue;
    if (lemma === "den" || lemma === "einen") continue;
    verbs.add(lemma.normalize("NFC"));
  }
  return verbs;
}

function addRow(level, infinitive, sourceId, sourceName, sourceUrl, license, notes = "") {
  if (!level || !infinitive) return;
  if (!looksLikeInfinitive(infinitive)) return;
  const key = `${level}|${infinitive}|${sourceId}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ level, infinitive, source_id: sourceId, source_name: sourceName, source_url: sourceUrl, license, notes });
}

const dwdsSources = [
  { level: "A1", filename: "dwds-goethe-A1.csv", sourceId: "dwds_goethe_a1", sourceName: "DWDS Goethe-Zertifikat A1", apiUrl: "https://www.dwds.de/api/lemma/goethe/A1.csv" },
  { level: "A2", filename: "dwds-goethe-A2.csv", sourceId: "dwds_goethe_a2", sourceName: "DWDS Goethe-Zertifikat A2", apiUrl: "https://www.dwds.de/api/lemma/goethe/A2.csv" },
  { level: "B1", filename: "dwds-goethe-B1.csv", sourceId: "dwds_goethe_b1", sourceName: "DWDS Goethe-Zertifikat B1", apiUrl: "https://www.dwds.de/api/lemma/goethe/B1.csv" }
];

for (const { level, filename, sourceId, sourceName, apiUrl } of dwdsSources) {
  const filePath = path.join(externalDir, filename);
  if (!fs.existsSync(filePath)) continue;
  const entries = parseCsvFile(filePath);
  for (const entry of entries) {
    const lemma = normalizeWhitespace(entry.Lemma ?? "");
    if (!lemma) continue;
    const pos = normalizeWhitespace(entry.Wortart ?? "");
    if (!pos.includes("Verb")) continue;
    const infinitive = lemma.toLowerCase();
    addRow(level, infinitive, sourceId, sourceName, apiUrl, "DWDS terms (attribution required)", `POS: ${pos}`);
  }
}

let dtzUniqueVerbs = [];
let dtzOverlapVerbs = [];
const dtzTxtPath = path.join(externalDir, "goethe-dtz-wortliste.txt");
if (fs.existsSync(dtzTxtPath)) {
  const dtzVerbs = Array.from(extractDtzVerbs(dtzTxtPath)).sort((a, b) => a.localeCompare(b, "de"));
  const existingInfinitives = new Set(rows.map((row) => row.infinitive));
  const sourceId = "goethe_dtz";
  const sourceName = "Goethe DTZ Wortliste";
  const sourceUrl = "https://www.goethe.de/resources/files/pdf209/dtz_wortliste.pdf";
  for (const verb of dtzVerbs) {
    if (existingInfinitives.has(verb)) {
      dtzOverlapVerbs.push(verb);
      continue;
    }
    addRow("DTZ", verb, sourceId, sourceName, sourceUrl, "Goethe-Institut terms (internal use)", "Extracted from DTZ alphabetical list");
    dtzUniqueVerbs.push(verb);
    existingInfinitives.add(verb);
  }
}

let lingsterCandidates = new Set();
const lingsterPath = path.join(externalDir, "lingster-wortschatz-A1-B2.txt");
if (fs.existsSync(lingsterPath)) {
  lingsterCandidates = extractLingsterVerbCandidates(lingsterPath);
}

rows.sort((a, b) => {
  if (a.level === b.level) {
    return a.infinitive.localeCompare(b.infinitive, "de");
  }
  return a.level.localeCompare(b.level);
});

const header = ["level", "infinitive", "source_id", "source_name", "source_url", "license", "notes"];
const csvLines = [header.join(",")];
for (const row of rows) {
  const values = header.map((key) => {
    const value = row[key] ?? "";
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  });
  csvLines.push(values.join(","));
}

fs.writeFileSync(path.join(outputDir, "cefr-verb-shortlist.csv"), csvLines.join("\n"));

const summaryLevels = ["A1", "A2", "B1", "B2", "C1", "C2", "DTZ"];
const summary = Object.fromEntries(summaryLevels.map((level) => [level, 0]));
for (const row of rows) {
  if (summary[row.level] !== undefined) {
    summary[row.level] += 1;
  }
}
fs.writeFileSync(path.join(outputDir, "cefr-verb-shortlist-summary.json"), JSON.stringify(summary, null, 2));

if (dtzUniqueVerbs.length > 0) {
  const dtzList = ["infinitive", ...dtzUniqueVerbs];
  fs.writeFileSync(path.join(outputDir, "dtz-verb-list.csv"), dtzList.join("\n"));
}
if (dtzOverlapVerbs.length > 0) {
  const overlapList = ["infinitive", ...dtzOverlapVerbs];
  fs.writeFileSync(path.join(outputDir, "dtz-verb-overlap.csv"), overlapList.join("\n"));
}

if (lingsterCandidates.size > 0) {
  const lingsterList = ["infinitive", ...Array.from(lingsterCandidates).sort((a, b) => a.localeCompare(b, "de"))];
  fs.writeFileSync(path.join(outputDir, "lingster-verb-candidates.csv"), lingsterList.join("\n"));
}



