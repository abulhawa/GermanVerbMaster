import { cn } from "@/lib/utils"
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes"

function Skeleton({
  className,
  debugId,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & DebuggableComponentProps) {
  return (
    <div
      {...getDevAttributes("Skeleton", debugId)}
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
