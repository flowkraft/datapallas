import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-content hover:bg-primary/80",
        secondary:
          "border-transparent bg-base-200 text-base-content hover:bg-base-300",
        destructive:
          "border-transparent bg-error text-error-content hover:bg-error/80",
        outline: "text-base-content",
        success:
          "border-transparent bg-success text-success-content hover:bg-success/80",
        warning:
          "border-transparent bg-warning text-warning-content hover:bg-warning/80",
        info:
          "border-transparent bg-info text-info-content hover:bg-info/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
