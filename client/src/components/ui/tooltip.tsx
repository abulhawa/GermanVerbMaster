import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"
import {
  type DebuggableComponentProps,
  debugForwardRef,
  getDevAttributes,
} from "@/lib/dev-attributes"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = debugForwardRef<
  unknown,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root> &
    DebuggableComponentProps
>("Tooltip", (props, _ref, devAttributes) => (
  <TooltipPrimitive.Root {...devAttributes} {...props} />
))

const TooltipTrigger = debugForwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> &
    DebuggableComponentProps
>("TooltipTrigger", (props, ref, devAttributes) => (
  <TooltipPrimitive.Trigger ref={ref} {...devAttributes} {...props} />
))

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> &
    DebuggableComponentProps
>(({ className, sideOffset = 4, debugId, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...getDevAttributes("TooltipContent", debugId)}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
