const TRUE_VALUES = new Set(["1", "true", "yes", "y", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "n", "off", "disabled"]);

export function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return defaultValue;
}

export function isLexemeSchemaEnabled(): boolean {
  return parseBooleanFlag(process.env.ENABLE_LEXEME_SCHEMA, true);
}
