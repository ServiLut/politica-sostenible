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
            cn(
              "flex h-13 w-full !appearance-none rounded-2xl border-2 border-zinc-100 bg-zinc-50/30 px-5 py-3 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/5 focus-visible:border-zinc-900 focus-visible:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:ring-offset-zinc-950 dark:placeholder:text-zinc-500 dark:focus-visible:ring-zinc-300/5 dark:focus-visible:border-zinc-300 dark:focus-visible:bg-zinc-900 transition-all duration-200 [&::-ms-expand]:hidden ![background-image:none]",
              showIcon && "pr-12"
            ),
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {showIcon && (
          <ChevronDown className="absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400 pointer-events-none transition-transform group-focus-within:rotate-180 duration-200" />
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
