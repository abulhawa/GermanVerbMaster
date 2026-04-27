import process from "node:process";
import { isAdminFeatureEnabled } from "../server/config.js";

type ValidationLevel = "error" | "warning";

type ValidationResult = {
  level: ValidationLevel;
  message: string;
};

function addResult(results: ValidationResult[], level: ValidationLevel, message: string): void {
  if (!results.some((item) => item.level === level && item.message === message)) {
    results.push({ level, message });
  }
}

function getEnv(key: string): string | undefined {
  const value = process.env[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function hasOnlyResendKeyCharacters(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUppercase = code >= 65 && code <= 90;
    const isLowercase = code >= 97 && code <= 122;
    const isAllowedSymbol = char === "-" || char === "_";

    if (!(isDigit || isUppercase || isLowercase || isAllowedSymbol)) {
      return false;
    }
  }

  return true;
}

function isProductionLikeEnvironment(): boolean {
  if (getEnv("FORCE_ENV_VALIDATION") === "1") {
    return true;
  }

  const defaultNodeEnv = getEnv("VERCEL") ? "production" : "development";
  const nodeEnv = getEnv("NODE_ENV") ?? defaultNodeEnv;
  return nodeEnv.toLowerCase() === "production";
}

function validateDatabaseUrl(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const databaseUrl = getEnv("DATABASE_URL");

  if (!databaseUrl) {
    addResult(results, "error", "DATABASE_URL is missing. Point it at the managed Postgres instance used in production (e.g. Supabase).");
    return results;
  }

  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    addResult(results, "error", "DATABASE_URL must be a Postgres connection string that starts with postgres:// or postgresql://.");
  }

  if (/localhost|127\.0\.0\.1/i.test(databaseUrl)) {
    addResult(results, "error", "DATABASE_URL currently points at localhost. Use the production database connection string instead.");
  }

  return results;
}

function validateSupabaseAuthConfiguration(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl) {
    addResult(results, "error", "SUPABASE_URL or VITE_SUPABASE_URL is missing. Use the same Supabase project as the Android app.");
  } else if (!/^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl)) {
    addResult(results, "warning", "SUPABASE_URL should point at the production Supabase project URL used by Android.");
  }

  if (!supabaseAnonKey) {
    addResult(results, "error", "SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is missing. Web auth cannot verify Supabase sessions without it.");
  }

  return results;
}

function validateAppOrigins(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const appOrigins = parseOrigins(getEnv("APP_ORIGIN"));

  if (appOrigins.length === 0) {
    addResult(results, "error", "APP_ORIGIN must include at least one HTTPS origin so CORS resolves correctly.");
  } else {
    for (const origin of appOrigins) {
      if (!origin.startsWith("https://")) {
        addResult(
          results,
          "error",
          "Each APP_ORIGIN entry must use https://. Remove insecure origins before deploying to production."
        );
      }

      if (/localhost|127\.0\.0\.1/i.test(origin)) {
        addResult(results, "error", "APP_ORIGIN still references localhost. Replace it with the public production domain.");
      }
    }
  }

  return results;
}

function validateResendConfiguration(): ValidationResult[] {
  const results: ValidationResult[] = [];
  const apiKey = getEnv("RESEND_API_KEY");

  if (!apiKey) {
    addResult(results, "error", "RESEND_API_KEY is missing. Generate a production API key in the Resend dashboard so transactional email works.");
  } else if (!apiKey.startsWith("re_")) {
    addResult(results, "warning", "RESEND_API_KEY must start with the re_ prefix issued by Resend. Confirm you copied the production key.");
  } else if (!hasOnlyResendKeyCharacters(apiKey.slice(3))) {
    addResult(results, "warning", "RESEND_API_KEY contains unexpected characters. Production keys only include letters, numbers, hyphens, or underscores.");
  }

  const fromEmail = getEnv("RESEND_FROM_EMAIL");
  if (!fromEmail) {
    addResult(results, "warning", "RESEND_FROM_EMAIL is unset. Production email will fall back to onboarding@resend.dev; configure a verified sender.");
  } else if (!/^[^@]+@[^@]+\.[^@]+$/.test(fromEmail)) {
    addResult(results, "error", "RESEND_FROM_EMAIL must be a valid email address (e.g. German Verb Master <no-reply@example.com>).");
  }

  return results;
}

function validateAdminToken(): ValidationResult[] {
  const results: ValidationResult[] = [];
  if (!isAdminFeatureEnabled()) {
    return results;
  }
  const adminToken = getEnv("ADMIN_API_TOKEN");

  if (!adminToken) {
    addResult(results, "error", "ADMIN_API_TOKEN is missing. Production cron jobs and ingestion scripts need a shared secret to authenticate.");
  } else if (adminToken.length < 16) {
    addResult(results, "warning", "ADMIN_API_TOKEN is very short. Use a randomly generated string (16+ characters) to prevent brute force attempts.");
  }

  return results;
}

function main() {
  if (!isProductionLikeEnvironment()) {
    console.log("[env] Skipping production environment validation (set FORCE_ENV_VALIDATION=1 to override).");
    return;
  }

  const validations = [
    ...validateDatabaseUrl(),
    ...validateSupabaseAuthConfiguration(),
    ...validateAppOrigins(),
    ...validateResendConfiguration(),
    ...validateAdminToken(),
  ];

  const errors = validations.filter((item) => item.level === "error");
  const warnings = validations.filter((item) => item.level === "warning");

  if (errors.length > 0) {
    console.error("\n❌ Environment validation failed:\n");
    for (const error of errors) {
      console.error(`  • ${error.message}`);
    }

    if (warnings.length > 0) {
      console.error("\nWarnings:");
      for (const warning of warnings) {
        console.error(`  • ${warning.message}`);
      }
    }

    process.exit(1);
  }

  console.log("\n✅ Environment validation passed.\n");

  if (warnings.length > 0) {
    console.warn("Warnings:");
    for (const warning of warnings) {
      console.warn(`  • ${warning.message}`);
    }
    console.warn("");
  }
}

main();
