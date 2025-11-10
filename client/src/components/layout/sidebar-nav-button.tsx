import { type ComponentType } from "react";
import { queryClient } from "@/lib/queryClient";
import { fetchPracticeTasks } from "@/lib/tasks";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";
import { useSidebarCollapsed } from "./sidebar-collapsible-context";
import { cn } from "@/lib/utils";
import { isNavigationItemActive } from "./navigation";

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
  const isActive = isNavigationItemActive(location, { href, exact });
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
      data-state={isActive ? "active" : "inactive"}
      variant={isActive ? "default" : "secondary"}
      className={cn(
        "w-full rounded-2xl text-sm transition-all",
        collapsed ? "justify-center px-3 py-3" : "justify-start px-4 py-4",
      )}
      onMouseEnter={href === '/' ? () => {
        // Prefetch a small set of tasks when hovering the Practice nav to warm the feed
        void queryClient.fetchQuery({
          queryKey: ['tasks', 'hover', 'home'],
          queryFn: async () => {
            try {
              return await fetchPracticeTasks({ limit: 5 });
            } catch (e) {
              return [] as unknown as ReturnType<typeof fetchPracticeTasks>;
            }
          },
          staleTime: 60_000,
        }).catch(() => undefined);
      } : undefined}
    >
      <Icon
        className={cn(
          "h-5 w-5 transition-colors",
          collapsed ? "" : "mr-3",
          isActive ? "text-primary-foreground" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <span className={cn(collapsed ? "sr-only" : "block")}>{label}</span>
    </Button>
  );

  return (
    <div {...getDevAttributes("sidebar-navigation-button", resolvedDebugId)}>
      <Link href={href} aria-current={isActive ? "page" : undefined}>
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
