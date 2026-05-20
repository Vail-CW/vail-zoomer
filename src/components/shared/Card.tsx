interface CardProps {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}

export function Card({ children, className = "", padded = true }: CardProps) {
  return (
    <div
      className={`bg-gray-800 rounded-2xl ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
