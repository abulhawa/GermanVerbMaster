export function toNfc(value: string): string {
  return value.normalize("NFC");
}

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ");
}

export function normaliseText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = collapseWhitespace(value).trim();
  if (!trimmed) {
    return null;
  }
  return toNfc(trimmed);
}

export function makeDedupKey(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => normaliseText(part)?.toLowerCase() ?? "")
    .join("::");
}
