import * as React from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const trackStyles = cva(
  "focus-ring inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 data-[state=unchecked]:bg-muted",
  {
    variants: {
      size: {
        sm: "h-5 w-9",
        md: "h-6 w-11",
        lg: "h-7 w-14",
      },
      tone: {
        default: "data-[state=checked]:bg-fg",
        primary: "data-[state=checked]:bg-primary",
        success: "data-[state=checked]:bg-success",
        warning: "data-[state=checked]:bg-warning",
        danger: "data-[state=checked]:bg-danger",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "primary",
    },
  }
);

const thumbStyles = cva(
  "pointer-events-none block rounded-full bg-card shadow-sm transition-transform duration-200",
  {
    variants: {
      size: {
        sm: "h-4 w-4 translate-x-1 data-[state=checked]:translate-x-4",
        md: "h-5 w-5 translate-x-1 data-[state=checked]:translate-x-5",
        lg: "h-6 w-6 translate-x-1.5 data-[state=checked]:translate-x-6",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof RadixSwitch.Root>,
    VariantProps<typeof trackStyles> {}

export const Switch = React.forwardRef<
  React.ElementRef<typeof RadixSwitch.Root>,
  SwitchProps
>(({ className, size, tone, ...props }, ref) => (
  <RadixSwitch.Root
    ref={ref}
    className={cn(trackStyles({ size, tone }), className)}
    {...props}
  >
    <RadixSwitch.Thumb className={thumbStyles({ size })} />
  </RadixSwitch.Root>
));
Switch.displayName = RadixSwitch.Root.displayName;
