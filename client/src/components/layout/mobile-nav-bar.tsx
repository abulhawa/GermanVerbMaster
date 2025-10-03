import { Link, useLocation } from "wouter";

import { cn } from "@/lib/utils";
import type { AppNavigationItem } from "./navigation";

interface MobileNavBarProps {
  items: AppNavigationItem[];
}

export function MobileNavBar({ items }: MobileNavBarProps) {
  const [location] = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="flex items-center justify-around gap-1"
    >
      {items.map((item) => {
        const isActive = item.exact ? location === item.href : location.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-medium transition",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon
              aria-hidden
              className={cn(
                "h-5 w-5 transition",
                isActive ? "text-accent" : "text-muted-foreground",
              )}
            />
            <span className="text-[11px] uppercase tracking-[0.18em]">{item.label}</span>
            <span
              className={cn(
                "mt-1 h-1 w-8 rounded-full bg-accent/70 transition-opacity",
                isActive ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
          </Link>
        );
      })}
    </nav>
  );
}
