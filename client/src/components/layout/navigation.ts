import type { LucideIcon } from "lucide-react";
import { Wand2 } from "lucide-react";

export interface AppNavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  requiresAdmin?: boolean;
}

const PRIMARY_NAVIGATION_ITEMS: AppNavigationItem[] = [
  {
    href: "/",
    label: "Enrichment",
    icon: Wand2,
    exact: true,
  },
];

export function getPrimaryNavigationItems(): AppNavigationItem[] {
  return PRIMARY_NAVIGATION_ITEMS;
}

function normalizePath(input: string | null | undefined): string {
  if (!input) {
    return "/";
  }

  const [path] = input.split("?");
  const trimmed = path?.trim() ?? "/";
  if (!trimmed.startsWith("/")) {
    return normalizePath(`/${trimmed}`);
  }

  const withoutTrailing = trimmed.replace(/\/+$/, "");
  return withoutTrailing.length > 0 ? withoutTrailing : "/";
}

export function isNavigationItemActive(
  currentPath: string,
  item: Pick<AppNavigationItem, "href" | "exact">,
): boolean {
  const normalizedPath = normalizePath(currentPath);
  const normalizedHref = normalizePath(item.href);

  if (item.exact) {
    return normalizedPath === normalizedHref;
  }

  if (normalizedPath === normalizedHref) {
    return true;
  }

  return normalizedPath.startsWith(`${normalizedHref}/`);
}
