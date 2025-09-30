import * as React from "react";
import * as RadixLabel from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const labelStyles = cva("font-medium text-muted", {
  variants: {
    size: {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
    },
    tone: {
      default: "text-muted",
      primary: "text-primary",
      success: "text-success",
      warning: "text-warning",
      danger: "text-danger",
    },
  },
  defaultVariants: {
    size: "md",
    tone: "default",
  },
});

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof RadixLabel.Root>,
    VariantProps<typeof labelStyles> {}

export const Label = React.forwardRef<
  React.ElementRef<typeof RadixLabel.Root>,
  LabelProps
>(({ className, size, tone, ...props }, ref) => (
  <RadixLabel.Root
    ref={ref}
    className={cn("flex items-center gap-2", labelStyles({ size, tone }), className)}
    {...props}
  />
));
Label.displayName = RadixLabel.Root.displayName;
