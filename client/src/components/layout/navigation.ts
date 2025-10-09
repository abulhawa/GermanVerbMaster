import type { LucideIcon } from "lucide-react";
import { Sparkles, History, Compass, Settings2, Wand2 } from "lucide-react";

export interface AppNavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  requiresAdmin?: boolean;
}

const BASE_PRIMARY_NAVIGATION_ITEMS: AppNavigationItem[] = [
  {
    href: "/",
    label: "Practice",
    icon: Sparkles,
    exact: true,
  },
  {
    href: "/answers",
    label: "Answer history",
    icon: History,
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: Compass,
  },
  {
    href: "/admin",
    label: "Admin tools",
    icon: Settings2,
    requiresAdmin: true,
  },
  {
    href: "/admin/enrichment",
    label: "Enrichment",
    icon: Wand2,
    requiresAdmin: true,
  },
];

export function getPrimaryNavigationItems(role: string | null | undefined): AppNavigationItem[] {
  const normalizedRole = role?.trim().toLowerCase();
  const isAdmin = normalizedRole === "admin";
  return BASE_PRIMARY_NAVIGATION_ITEMS.filter((item) => !item.requiresAdmin || isAdmin);
}
