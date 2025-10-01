import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import {
  type DebuggableComponentProps,
  debugForwardRef,
  getDevAttributes,
} from "@/lib/dev-attributes"

const Popover = debugForwardRef<
  React.ElementRef<typeof PopoverPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root> &
    DebuggableComponentProps
>("Popover", (props, ref, devAttributes) => (
  <PopoverPrimitive.Root ref={ref} {...devAttributes} {...props} />
))

const PopoverTrigger = debugForwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger> &
    DebuggableComponentProps
>("PopoverTrigger", (props, ref, devAttributes) => (
  <PopoverPrimitive.Trigger ref={ref} {...devAttributes} {...props} />
))

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> &
    DebuggableComponentProps
>(({ className, align = "center", sideOffset = 4, debugId, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-popover w-72 rounded-app border border-border bg-popover p-4 text-popover-foreground shadow-soft outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...getDevAttributes("PopoverContent", debugId)}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
