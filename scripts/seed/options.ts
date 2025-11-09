export interface SeedOptions {
  reset?: boolean;
}

export function parseBooleanOption(value: string | undefined): boolean {
  if (!value) {
    return true;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised || normalised === 'true' || normalised === '1' || normalised === 'yes') {
    return true;
  }
  if (normalised === 'false' || normalised === '0' || normalised === 'no') {
    return false;
  }
  return true;
}

export function parseSeedOptions(argv: readonly string[]): SeedOptions {
  let reset = false;

  for (const raw of argv) {
    if (!raw || raw === '--') {
      continue;
    }

    if (raw === '--reset' || raw === '-r') {
      reset = true;
      continue;
    }

    if (raw === '--no-reset') {
      reset = false;
      continue;
    }

    if (raw.startsWith('--reset=')) {
      const [, value] = raw.split('=');
      reset = parseBooleanOption(value);
    }
  }

  return { reset } satisfies SeedOptions;
}
