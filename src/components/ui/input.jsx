import React from "react"
import { cn } from "@/lib/utils"

export const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background " +
          "file:border-0 file:bg-transparent file:text-base file:font-medium " +
          "placeholder:text-muted-foreground focus-visible:outline-none " +
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
          "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})

Input.displayName = "Input"

export const AppInput = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      type={type}
      className={cn(
        "h-12 rounded-md border border-border bg-card px-4 py-2.5 text-base text-foreground " +
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-app-iris focus-visible:ring-offset-0",
        className
      )}
      {...props}
    />
  )
})

AppInput.displayName = "AppInput"
