import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./utils";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

/** One predictable heading and action area across workspaces, including narrow screens. */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("page-heading", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
        {Icon && (
          <span className="page-heading-icon" aria-hidden="true">
            <Icon size={23} strokeWidth={1.7} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {description && <div className="page-description">{description}</div>}
          {meta && <div className="page-meta">{meta}</div>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
