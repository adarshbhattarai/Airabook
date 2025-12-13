import * as React from "react"

// Actually, checking package.json in previous step, I didn't see @radix-ui/react-avatar.
// I should use a simpler implementation if the dependency isn't there, OR check if I can add it.
// Wait, listing dependencies in Step 270:
// "@radix-ui/react-dialog": "^1.1.15",
// "@radix-ui/react-dropdown-menu": "^2.1.16",
// "@radix-ui/react-label": "^2.0.2",
// "@radix-ui/react-slot": "^1.0.2",
// "@radix-ui/react-switch": "^1.2.6",
// "@radix-ui/react-toast": "^1.1.5",
// "@radix-ui/react-toggle-group": "^1.1.11",
// NO avatar.

// I will implement a CSS-only version or install the package.
// Since I can't easily install packages reliably without user permission and internet, and standard shadcn uses the primitive...
// I will implement a non-Radix version that mimics the API.

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
            className
        )}
        {...props}
    />
))
Avatar.displayName = "Avatar"

const AvatarImage = React.forwardRef(({ className, src, alt, ...props }, ref) => {
    if (!src) return null;
    return (
        <img
            ref={ref}
            src={src}
            alt={alt}
            className={cn("aspect-square h-full w-full", className)}
            {...props}
        />
    )
})
AvatarImage.displayName = "AvatarImage"

const AvatarFallback = React.forwardRef(({ className, children, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "flex h-full w-full items-center justify-center rounded-full bg-muted",
            className
        )}
        {...props}
    >
        {children}
    </div>
))
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }
