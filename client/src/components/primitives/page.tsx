import * as React from "react";

import { cn } from "@/lib/cn";

export function Page({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
        className
      )}
      {...props}
    />
  );
}
