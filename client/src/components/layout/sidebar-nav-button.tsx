import { type ComponentType } from "react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";
import { useSidebarCollapsed } from "./sidebar-collapsible-context";
import { cn } from "@/lib/utils";

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
  const { collapsed } = useSidebarCollapsed();

  const normalizedLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const resolvedDebugId =
    debugId && debugId.trim().length > 0 ? debugId : `sidebar-nav-${normalizedLabel || "link"}`;

  const button = (
    <Button
      debugId={`${resolvedDebugId}-button`}
      variant={isActive ? "default" : "secondary"}
      className={cn(
        "w-full rounded-2xl text-sm transition-all",
        collapsed ? "justify-center px-3 py-3" : "justify-start px-4 py-4",
      )}
    >
      <Icon className={cn("h-5 w-5", collapsed ? "" : "mr-3") } aria-hidden />
      <span className={cn(collapsed ? "sr-only" : "block")}>{label}</span>
    </Button>
  );

  return (
    <div {...getDevAttributes("sidebar-navigation-button", resolvedDebugId)}>
      <Link href={href}>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs font-medium">
              {label}
            </TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
      </Link>
    </div>
  );
}
