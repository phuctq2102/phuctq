import React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "v10-button",
        outline: "outline",
      },
      size: {
        default: "min-h-11",
        sm: "small",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

// shadcn/ui Button, adapted to the existing Kiểm Kê theme.
export const Button = React.forwardRef(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Component = asChild ? Slot : "button"
  return (
    <Component
      ref={ref}
      data-slot="button"
      className={twMerge(clsx(buttonVariants({ variant, size }), className))}
      {...props}
    />
  )
})
