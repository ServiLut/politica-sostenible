"use client";

import * as React from "react";
import { cn } from "./utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium leading-5 text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-slate-200",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
