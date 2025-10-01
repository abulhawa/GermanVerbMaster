import { type ComponentType } from "react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";

interface SidebarNavButtonProps extends DebuggableComponentProps {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
}

export function SidebarNavButton({
  href,
  label,
  icon: Icon,
  exact = false,
  debugId,
}: SidebarNavButtonProps) {
  const [location] = useLocation();
  const isActive = exact ? location === href : location.startsWith(href);

  const normalizedLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const resolvedDebugId =
    debugId && debugId.trim().length > 0 ? debugId : `sidebar-nav-${normalizedLabel || "link"}`;

  return (
    <div {...getDevAttributes("sidebar-navigation-button", resolvedDebugId)}>
      <Link href={href}>
        <Button
          debugId={`${resolvedDebugId}-button`}
          variant={isActive ? "default" : "secondary"}
          className="w-full justify-start rounded-2xl px-4 py-6 text-sm"
        >
          <Icon className="mr-3 h-5 w-5" aria-hidden />
          {label}
        </Button>
      </Link>
    </div>
  );
}
