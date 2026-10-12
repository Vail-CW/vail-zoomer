import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required: icon-only buttons need an accessible name. */
  "aria-label": string;
  children: ReactNode;
  active?: boolean;
}

export function IconButton({
  children,
  active = false,
  className = "",
  type = "button",
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      title={title ?? rest["aria-label"]}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface2 hover:text-ink disabled:pointer-events-none disabled:opacity-50 ${
        active ? "bg-surface2 text-ink" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
