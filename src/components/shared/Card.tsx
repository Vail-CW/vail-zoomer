import type { ReactNode } from "react";

/** Small uppercase section label (13px, tracking). */
export function SectionHeader({
  children,
  action,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-[1.5rem] items-center justify-between gap-2 ${className}`}>
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">{children}</h3>
      {action}
    </div>
  );
}

interface CardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set false when children supply their own padding (e.g. divided rows). */
  padded?: boolean;
}

/** Flat card: 1px border, 12px padding, optional title and description. */
export function Card({ title, description, action, children, className = "", padded = true }: CardProps) {
  return (
    <section className={`rounded-md border border-line bg-surface ${padded ? "p-3" : ""} ${className}`}>
      {(title || action) && (
        <div className={padded ? "mb-2" : "px-3 pb-1 pt-3"}>
          <SectionHeader action={action}>{title}</SectionHeader>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
