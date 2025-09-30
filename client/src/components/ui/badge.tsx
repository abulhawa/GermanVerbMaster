import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const badgeStyles = cva(
  "inline-flex items-center justify-center rounded-full border font-medium transition-colors duration-200",
  {
    variants: {
      size: {
        sm: "px-2.5 py-0.5 text-xs",
        md: "px-3 py-1 text-sm",
        lg: "px-4 py-1.5 text-sm",
      },
      tone: {
        default: "border-border bg-surface text-fg",
        primary: "border-transparent bg-primary text-primary-fg",
        success: "border-transparent bg-success text-success-fg",
        warning: "border-transparent bg-warning text-warning-fg",
        danger: "border-transparent bg-danger text-danger-fg",
        info: "border-transparent bg-info text-info-fg",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeStyles> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, size, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeStyles({ size, tone }), className)} {...props} />
  )
);
Badge.displayName = "Badge";
