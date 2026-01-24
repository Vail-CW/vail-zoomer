interface BigButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "success";
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export function BigButton({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  fullWidth = false,
  className = "",
}: BigButtonProps) {
  const baseStyles =
    "min-h-[60px] px-8 py-4 text-xl font-semibold rounded-xl transition-colors focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-gray-900";

  const variantStyles = {
    primary:
      "bg-amber-500 hover:bg-amber-400 text-gray-900 focus:ring-amber-500 disabled:bg-gray-600 disabled:text-gray-400",
    secondary:
      "bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500 disabled:bg-gray-800 disabled:text-gray-500",
    success:
      "bg-green-600 hover:bg-green-500 text-white focus:ring-green-500 disabled:bg-gray-600 disabled:text-gray-400",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
