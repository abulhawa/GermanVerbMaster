import type { LucideIcon } from "lucide-react";
import { Sparkles, History, Compass, Settings2 } from "lucide-react";

export interface AppNavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const primaryNavigationItems: AppNavigationItem[] = [
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
  },
];
