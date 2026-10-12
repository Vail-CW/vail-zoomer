import type { ButtonHTMLAttributes, ReactNode } from "react";
import { SpinnerIcon } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** sm = 32px, md = 36px (primary actions). */
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg font-semibold hover:bg-accent-hover border border-transparent",
  secondary: "bg-surface2 text-ink font-medium border border-line-strong hover:bg-surface3",
  ghost: "bg-transparent text-ink font-medium border border-transparent hover:bg-surface2",
  danger: "bg-danger/10 text-danger-fg font-medium border border-danger/30 hover:bg-danger/20",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-base gap-1.5",
  md: "h-9 px-4 text-base gap-2",
};

export function Button({
  variant = "secondary",
  size = "sm",
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded transition-colors disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {loading ? <SpinnerIcon /> : icon}
      {children}
      {iconRight}
    </button>
  );
}
