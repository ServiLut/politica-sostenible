import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  showIcon?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, showIcon = true, ...props }, ref) => {
    return (
      <div className="relative w-full group">
        <select
          className={cn(
            "flex h-13 w-full !appearance-none rounded-2xl border-2 border-l-[3px] border-zinc-200/90 bg-zinc-50/40 px-5 py-3 text-sm font-medium text-zinc-900 ring-offset-white shadow-xs transition-all duration-200 ease-in-out",
            "hover:border-blue-200/80 hover:bg-gradient-to-r hover:from-white hover:via-blue-50/25 hover:to-indigo-50/30",
            "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:border-blue-500/80 focus-visible:border-l-[3px] focus-visible:border-l-blue-600 focus-visible:bg-white focus-visible:shadow-lg focus-visible:shadow-blue-500/10",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:border-zinc-800 dark:border-l-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-500",
            "dark:hover:border-zinc-700 dark:hover:from-zinc-900/90 dark:hover:via-zinc-900 dark:hover:to-blue-950/30",
            "dark:focus-visible:border-blue-400/80 dark:focus-visible:border-l-blue-400 dark:focus-visible:bg-zinc-900 dark:focus-visible:ring-blue-400/20 dark:focus-visible:shadow-[0_8px_20px_-4px_rgba(59,130,246,0.25)]",
            "[&>option]:font-medium [&>option]:text-zinc-900 [&>option]:bg-white dark:[&>option]:bg-zinc-900 dark:[&>option]:text-zinc-100",
            "[&::-ms-expand]:hidden ![background-image:none]",
            showIcon && "pr-12",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {showIcon && (
          <ChevronDown className="pointer-events-none absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 transition-all duration-200 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 group-focus-within:rotate-180 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-400" />
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
