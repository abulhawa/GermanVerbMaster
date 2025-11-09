const rawFlag = import.meta.env.VITE_ENABLE_ADMIN_FEATURES as string | undefined;
const normalizedFlag = typeof rawFlag === "string" ? rawFlag.trim().toLowerCase() : undefined;

const explicitTrue = normalizedFlag === "1" || normalizedFlag === "true" || normalizedFlag === "yes" || normalizedFlag === "on";
const explicitFalse =
  normalizedFlag === "0" || normalizedFlag === "false" || normalizedFlag === "no" || normalizedFlag === "off" || normalizedFlag === "disabled";

export const ADMIN_FEATURE_ENABLED = explicitTrue || (!explicitFalse && import.meta.env.DEV);

export function isAdminFeatureEnabled(): boolean {
  return ADMIN_FEATURE_ENABLED;
}
