import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const buttonStyles = cva(
  "focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-transform duration-200 disabled:pointer-events-none disabled:opacity-60 [&>svg]:size-4",
  {
    variants: {
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
      },
      tone: {
        default: "bg-muted text-fg hover:bg-muted/80",
        primary: "bg-primary text-primary-fg hover:bg-primary/90",
        success: "bg-success text-success-fg hover:bg-success/90",
        warning: "bg-warning text-warning-fg hover:bg-warning/90",
        danger: "bg-danger text-danger-fg hover:bg-danger/90",
      },
      variant: {
        solid: "shadow-sm",
        outline: "border border-border bg-transparent",
        ghost: "bg-transparent",
        link: "bg-transparent underline-offset-4",
      },
    },
    compoundVariants: [
      { variant: "outline", tone: "default", class: "text-fg hover:bg-card" },
      {
        variant: "outline",
        tone: "primary",
        class: "border-primary text-primary hover:bg-primary/10",
      },
      {
        variant: "outline",
        tone: "success",
        class: "border-success text-success hover:bg-success/10",
      },
      {
        variant: "outline",
        tone: "warning",
        class: "border-warning text-warning hover:bg-warning/10",
      },
      {
        variant: "outline",
        tone: "danger",
        class: "border-danger text-danger hover:bg-danger/10",
      },
      { variant: "ghost", tone: "default", class: "text-muted hover:bg-muted/60" },
      {
        variant: "ghost",
        tone: "primary",
        class: "text-primary hover:bg-primary/10",
      },
      {
        variant: "ghost",
        tone: "success",
        class: "text-success hover:bg-success/10",
      },
      {
        variant: "ghost",
        tone: "warning",
        class: "text-warning hover:bg-warning/10",
      },
      {
        variant: "ghost",
        tone: "danger",
        class: "text-danger hover:bg-danger/10",
      },
      { variant: "link", tone: "default", class: "text-fg hover:underline" },
      {
        variant: "link",
        tone: "primary",
        class: "text-primary hover:underline",
      },
      {
        variant: "link",
        tone: "success",
        class: "text-success hover:underline",
      },
      {
        variant: "link",
        tone: "warning",
        class: "text-warning hover:underline",
      },
      { variant: "link", tone: "danger", class: "text-danger hover:underline" },
    ],
    defaultVariants: {
      size: "md",
      tone: "primary",
      variant: "solid",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, tone, size, variant, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonStyles({ tone, size, variant }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export const buttonVariants = buttonStyles;
