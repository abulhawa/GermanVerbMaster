import * as React from "react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import {
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
} from "./config"
import { useSidebarKeyboardShortcut } from "./hooks/use-sidebar-keyboard-shortcut"
import {
  useSidebarState,
  type SidebarContextValue,
} from "./hooks/use-sidebar-state"

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>(({ defaultOpen = true, open: openProp, onOpenChange, className, style, children, ...props }, ref) => {
  const sidebarState = useSidebarState({
    defaultOpen,
    open: openProp,
    onOpenChange,
  })

  useSidebarKeyboardShortcut(
    SIDEBAR_KEYBOARD_SHORTCUT,
    sidebarState.toggleSidebar
  )

  return (
    <SidebarContext.Provider value={sidebarState}>
      <TooltipProvider delayDuration={0}>
        <div
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full text-sidebar-foreground has-[[data-variant=inset]]:bg-sidebar",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
})

SidebarProvider.displayName = "SidebarProvider"
