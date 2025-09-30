import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const inputStyles = cva(
  "focus-ring flex w-full rounded-xl border bg-card text-fg placeholder:text-muted/80 transition-colors duration-200",
  {
    variants: {
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-5 text-base",
      },
      tone: {
        default: "border-border",
        primary: "border-primary",
        success: "border-success",
        warning: "border-warning",
        danger: "border-danger",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "default",
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputStyles> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, tone, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(inputStyles({ size, tone }), className)}
      {...props}
    />
  )
);
Input.displayName = "Input";
