import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const textareaStyles = cva(
  "focus-ring w-full rounded-xl border bg-card text-fg placeholder:text-muted/80 transition-colors duration-200",
  {
    variants: {
      size: {
        sm: "min-h-[120px] p-3 text-sm",
        md: "min-h-[140px] p-4 text-sm",
        lg: "min-h-[160px] p-5 text-base",
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

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaStyles> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size, tone, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(textareaStyles({ size, tone }), className)}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
