export interface SubmissionMetric {
  timestamp: string; // ISO
  durationMs: number;
  queued: boolean;
}

const KEY = 'practice.metrics.v1';
const MAX_ENTRIES = 200;

function read(): SubmissionMetric[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SubmissionMetric[];
  } catch {
    return [];
  }
}

function write(list: SubmissionMetric[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch {
    // ignore
  }
}

export function recordSubmissionMetric(durationMs: number, queued: boolean) {
  const list = read();
  list.push({ timestamp: new Date().toISOString(), durationMs, queued });
  write(list);
}

export function getSubmissionMetrics(): SubmissionMetric[] {
  return read();
}

export function clearSubmissionMetrics(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
