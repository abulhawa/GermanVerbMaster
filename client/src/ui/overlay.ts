import type { ClassValue } from "clsx";

import { cn } from "@/lib/cn";

export const overlayBase =
  "surface-card z-50 border border-border bg-card text-fg shadow-md outline-none";

export function overlayClassName(...classNames: ClassValue[]) {
  return cn(overlayBase, ...classNames);
}
