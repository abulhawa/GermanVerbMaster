import type { ClassValue } from "clsx";

import { cn } from "@/lib/cn";

export const overlayBase =
  "z-50 border border-border bg-[hsl(var(--card))] bg-white text-fg shadow-md outline-none dark:bg-slate-950";

export function overlayClassName(...classNames: ClassValue[]) {
  return cn(overlayBase, ...classNames);
}
