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
      <div className="relative w-full min-w-0">
        <select
          className={cn(
            cn(
              "flex min-h-11 w-full min-w-0 appearance-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base leading-5 text-slate-900 shadow-sm ring-offset-white focus-visible:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70 aria-invalid:border-red-600 aria-invalid:focus-visible:ring-red-600/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:ring-offset-slate-950 dark:focus-visible:border-blue-400 dark:disabled:bg-slate-800 transition-colors duration-150 motion-reduce:transition-none sm:text-sm",
              showIcon && "pr-11"
            ),
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {showIcon && (
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
