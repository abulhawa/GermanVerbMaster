import { useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  THEME_STORAGE_KEY,
  applyThemeSetting,
  getInitialThemeSetting,
  resolveTheme,
  subscribeToSystemTheme,
  type ThemeSetting,
} from "@/lib/theme";
import { type DebuggableComponentProps } from "@/lib/dev-attributes";

interface ThemeToggleProps extends DebuggableComponentProps {
  className?: string;
}

export function ThemeToggle({ className, debugId }: ThemeToggleProps) {
  const [setting, setSetting] = useState<ThemeSetting>(() => getInitialThemeSetting());

  const resolvedTheme = useMemo(() => resolveTheme(setting), [setting]);

  useEffect(() => {
    applyThemeSetting(setting);

    if (typeof window === "undefined") return;

    window.localStorage.setItem(THEME_STORAGE_KEY, setting);

    if (setting !== "system") {
      return;
    }

    return subscribeToSystemTheme(() => applyThemeSetting("system"));
  }, [setting]);

  const handleChange = (nextSetting: ThemeSetting) => {
    setSetting(nextSetting);
    applyThemeSetting(nextSetting);
  };

  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "theme-toggle";

  return (
    <DropdownMenu debugId={resolvedDebugId}>
      <DropdownMenuTrigger
        debugId={`${resolvedDebugId}-trigger`}
        asChild
      >
        <Button
          debugId={`${resolvedDebugId}-button`}
          variant="outline"
          size="icon"
          className={cn(
            "relative h-10 w-10 rounded-full border border-border bg-card/80 text-fg shadow-sm transition hover:bg-muted/60",
            className,
          )}
          aria-label="Toggle theme"
        >
          <Sun
            className={cn(
              "h-4 w-4 transition-all",
              resolvedTheme === "dark" ? "scale-0 opacity-0" : "scale-100 opacity-100",
            )}
            aria-hidden
          />
          <Moon
            className={cn(
              "absolute h-4 w-4 transition-all",
              resolvedTheme === "dark" ? "scale-100 opacity-100" : "scale-0 opacity-0",
            )}
            aria-hidden
          />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        debugId={`${resolvedDebugId}-menu`}
        align="end"
        className="w-44"
      >
        <DropdownMenuLabel debugId={`${resolvedDebugId}-label`}>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={setting}
          onValueChange={(value) => handleChange(value as ThemeSetting)}
        >
          <DropdownMenuRadioItem
            debugId={`${resolvedDebugId}-light`}
            value="light"
            className="flex items-center gap-2"
          >
            <Sun className="h-4 w-4" aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            debugId={`${resolvedDebugId}-dark`}
            value="dark"
            className="flex items-center gap-2"
          >
            <Moon className="h-4 w-4" aria-hidden />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            debugId={`${resolvedDebugId}-system`}
            value="system"
            className="flex items-center gap-2"
          >
            <Monitor className="h-4 w-4" aria-hidden />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
