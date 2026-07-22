import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold tracking-tight whitespace-nowrap transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[var(--shadow-brand)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-brand-hover)] active:translate-y-0",
        destructive:
          "bg-destructive text-white shadow-[0_12px_24px_rgba(220,38,38,0.25)] hover:brightness-110",
        outline:
          "border border-brand-200 bg-white text-ink shadow-[0_10px_22px_rgba(0,107,255,0.10)] hover:border-brand-300 hover:bg-brand-50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-brand-50",
        accent:
          "bg-gradient-to-b from-accent-300 to-accent-400 text-ink shadow-[0_12px_24px_rgba(255,212,0,0.30)] hover:-translate-y-0.5 active:translate-y-0",
        ghost: "hover:bg-brand-50 hover:text-brand-700",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 has-[>svg]:px-4",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-3.5 has-[>svg]:px-3",
        lg: "h-12 px-6 text-base has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
