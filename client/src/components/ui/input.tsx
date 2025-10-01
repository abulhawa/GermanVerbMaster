import * as React from "react"

import { cn } from "@/lib/utils"
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    DebuggableComponentProps {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, debugId, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-app border border-border bg-card px-4 text-base font-medium text-fg shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 placeholder:text-muted-foreground",
          className
        )}
        {...getDevAttributes("Input", debugId)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
