import type { ReactNode } from "react";

declare module "next-themes" {
  export interface ThemeProviderProps {
    attribute?: string;
    defaultTheme?: string;
    enableSystem?: boolean;
    storageKey?: string;
    disableTransitionOnChange?: boolean;
    children?: ReactNode;
  }

  export const ThemeProvider: (props: ThemeProviderProps) => ReactNode;

  export type Theme = string;

  export interface UseThemeReturn {
    theme?: Theme;
    resolvedTheme?: Theme;
    systemTheme?: Theme;
    setTheme: (theme: Theme) => void;
  }

  export function useTheme(): UseThemeReturn;
}
