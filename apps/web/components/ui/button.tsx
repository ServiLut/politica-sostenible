"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "./utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const variants = {
      default: "bg-zinc-900 text-zinc-50 hover:bg-zinc-950 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-xl shadow-zinc-200/50 dark:shadow-none",
      destructive: "bg-red-600 text-white hover:bg-red-700 dark:bg-red-900 dark:text-red-50 dark:hover:bg-red-800 shadow-xl shadow-red-200/50 dark:shadow-none",
      outline: "border-2 border-zinc-200 bg-transparent hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
      secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700",
      ghost: "hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
      link: "text-zinc-900 underline-offset-8 hover:underline dark:text-zinc-50 font-black uppercase tracking-widest text-[10px]",
    };

    const sizes = {
      default: "h-14 px-8 py-4 text-sm",
      sm: "h-10 rounded-xl px-4 text-xs",
      lg: "h-16 rounded-[1.5rem] px-10 text-base",
      icon: "h-14 w-14",
    };

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center rounded-[1.25rem] font-black uppercase tracking-[0.1em] ring-offset-white transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:ring-offset-zinc-950 dark:focus-visible:ring-zinc-300 active:scale-[0.95] hover:translate-y-[-2px] hover:shadow-2xl",
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
