import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/* ------------------------------------------------------------------ */
/*  GlassPanel — full-viewport modal with clean header bar            */
/* ------------------------------------------------------------------ */

function GlassPanel({
  open,
  onClose,
  title,
  side: _side = "right",
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  side?: "left" | "right"
  className?: string
  children: React.ReactNode
}) {
  /* Close on Escape */
  React.useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open, onClose])

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 transition-all duration-300",
          "bg-black/25 dark:bg-black/55",
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none",
        )}
      />

      {/* ── Modal ── */}
      <div
        data-slot="glass-panel"
        data-state={open ? "open" : "closed"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "fixed z-50",
          /* Responsive insets: snug on mobile, generous on larger screens */
          "inset-2 sm:inset-4 md:inset-6 lg:inset-8",
          /* Layout */
          "flex flex-col",
          /* Surface: solid, always legible */
          "bg-background",
          "border border-border",
          "rounded-xl overflow-hidden",
          /* Depth */
          "shadow-[0_8px_40px_-8px_rgb(0_0_0_/_0.18),0_2px_8px_-2px_rgb(0_0_0_/_0.08)]",
          "dark:shadow-[0_8px_40px_-8px_rgb(0_0_0_/_0.6),0_2px_8px_-2px_rgb(0_0_0_/_0.4)]",
          /* Entry animation: scale + fade */
          "transition-all duration-200 ease-out",
          open
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-[0.98] translate-y-1 pointer-events-none",
          className,
        )}
      >
        {/* ── Header bar ── */}
        <div className={cn(
          "flex-none flex items-center justify-between",
          "px-5 py-3.5",
          "border-b border-border",
          "bg-card",
        )}>
          {title ? (
            <div className="flex items-center gap-2.5">
              {/* Accent pip */}
              <span className="block h-3.5 w-0.5 rounded-full bg-foreground/30" />
              <span className="text-[13px] font-semibold tracking-tight text-foreground">
                {title}
              </span>
            </div>
          ) : (
            <span />
          )}

          <button
            onClick={onClose}
            aria-label="Close panel"
            className={cn(
              "grid place-items-center size-7 rounded-md",
              "text-muted-foreground",
              "hover:bg-muted hover:text-foreground",
              "transition-colors duration-150",
              "focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1",
            )}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        {/* ── Content — flex-1 + min-h-0 so scroll areas work ── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    </>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  GlassPanel,
}
