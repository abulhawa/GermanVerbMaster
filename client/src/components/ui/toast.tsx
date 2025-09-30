import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

export const ToastProvider = ToastPrimitive.Provider;
export const ToastViewport = ToastPrimitive.Viewport;
export type ToastActionElement = React.ReactElement<typeof ToastPrimitive.Action>;

const toastStyles = cva(
  "focus-ring pointer-events-auto flex w-full max-w-sm gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-fg shadow-md",
  {
    variants: {
      tone: {
        default: "border-border",
        primary: "border-primary",
        success: "border-success",
        warning: "border-warning",
        danger: "border-danger",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
);

export interface ToastProps
  extends ToastPrimitive.ToastProps,
    VariantProps<typeof toastStyles> {
  children?: React.ReactNode;
}

export const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, tone, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      toastStyles({ tone }),
      "data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className
    )}
    {...props}
  />
));
Toast.displayName = ToastPrimitive.Root.displayName;

export const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold text-fg", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

export const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

export const ToastClose = ToastPrimitive.Close;
export const ToastAction = ToastPrimitive.Action;
