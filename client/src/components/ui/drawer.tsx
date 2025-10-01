import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils"
import {
  type DebuggableComponentProps,
  debugForwardRef,
  getDevAttributes,
} from "@/lib/dev-attributes"

interface DrawerProps
  extends React.ComponentProps<typeof DrawerPrimitive.Root>,
    DebuggableComponentProps {}

const Drawer = ({
  shouldScaleBackground = true,
  debugId,
  ...props
}: DrawerProps) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...getDevAttributes("Drawer", debugId)}
    {...props}
  />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = debugForwardRef<
  React.ElementRef<typeof DrawerPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Trigger> &
    DebuggableComponentProps
>("DrawerTrigger", (props, ref, devAttributes) => (
  <DrawerPrimitive.Trigger ref={ref} {...devAttributes} {...props} />
))

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = debugForwardRef<
  React.ElementRef<typeof DrawerPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Close> &
    DebuggableComponentProps
>("DrawerClose", (props, ref, devAttributes) => (
  <DrawerPrimitive.Close ref={ref} {...devAttributes} {...props} />
))

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay> &
    DebuggableComponentProps
>(({ className, debugId, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...getDevAttributes("DrawerOverlay", debugId)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> &
    DebuggableComponentProps
>(({ className, children, debugId, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
        className
      )}
      {...getDevAttributes("DrawerContent", debugId)}
      {...props}
    >
      <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  debugId,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & DebuggableComponentProps) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...getDevAttributes("DrawerHeader", debugId)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  debugId,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & DebuggableComponentProps) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...getDevAttributes("DrawerFooter", debugId)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title> &
    DebuggableComponentProps
>(({ className, debugId, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...getDevAttributes("DrawerTitle", debugId)}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description> &
    DebuggableComponentProps
>(({ className, debugId, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...getDevAttributes("DrawerDescription", debugId)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
