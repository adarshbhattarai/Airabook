"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

// Simple classnames helper (replace with your own if you have one)
function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Fullscreen, dark, slight blur, with open/close fade
      "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// We center Content by wrapping it in a fullscreen flex container
export const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    {/* Overlay behind */}
    <DialogOverlay />

    {/* Centering wrapper */}
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <DialogPrimitive.Content
        ref={ref}
        // Keep Content relative so absolute children (your X / nav buttons) position correctly
        className={cn(
          "relative w-full max-w-lg outline-none",
          // Subtle scale/opacity animation on open/close
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </div>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

export const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

export const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm opacity-80", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
