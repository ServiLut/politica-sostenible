import * as React from "react";
import { cn } from "./utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base leading-5 text-slate-900 shadow-sm ring-offset-white file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-slate-700 placeholder:text-slate-500 focus-visible:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70 aria-invalid:border-red-600 aria-invalid:focus-visible:ring-red-600/20 read-only:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:border-blue-400 dark:disabled:bg-slate-800 dark:read-only:bg-slate-800 transition-colors duration-150 motion-reduce:transition-none sm:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
