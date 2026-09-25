"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "./utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    const variants = {
      default:
        "bg-blue-700 text-white shadow-sm hover:bg-blue-800 active:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500",
      destructive:
        "bg-red-700 text-white shadow-sm hover:bg-red-800 active:bg-red-900 dark:bg-red-600 dark:hover:bg-red-500",
      outline:
        "border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
      secondary:
        "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
      ghost:
        "text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-slate-800",
      link: "text-blue-700 underline-offset-4 hover:underline dark:text-blue-300",
    };

    const sizes = {
      default: "min-h-11 px-5 py-2.5 text-sm",
      sm: "min-h-11 px-3.5 py-2 text-sm",
      lg: "min-h-12 rounded-2xl px-6 py-3 text-base",
      icon: "h-11 w-11 shrink-0 p-2.5",
    };

    return (
      <Comp
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-semibold leading-5 tracking-normal ring-offset-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress dark:ring-offset-slate-950 dark:focus-visible:ring-blue-400 motion-reduce:transition-none [&_svg]:shrink-0",
          variants[variant],
          sizes[size],
          className,
        )}
        ref={ref}
        {...(!asChild ? { type } : {})}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
