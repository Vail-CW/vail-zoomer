interface InfoBoxProps {
  variant: "warning" | "info" | "success" | "error";
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function InfoBox({
  variant,
  title,
  children,
  className = "",
}: InfoBoxProps) {
  const variantStyles = {
    warning: {
      container: "bg-yellow-900/40 border-yellow-600",
      icon: "text-yellow-400",
      title: "text-yellow-300",
    },
    info: {
      container: "bg-blue-900/40 border-blue-600",
      icon: "text-blue-400",
      title: "text-blue-300",
    },
    success: {
      container: "bg-green-900/40 border-green-600",
      icon: "text-green-400",
      title: "text-green-300",
    },
    error: {
      container: "bg-red-900/40 border-red-600",
      icon: "text-red-400",
      title: "text-red-300",
    },
  };

  const icons = {
    warning: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    success: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    error: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  const styles = variantStyles[variant];

  return (
    <div className={`rounded-xl border-2 p-5 ${styles.container} ${className}`}>
      <div className="flex gap-4">
        <div className={`flex-shrink-0 ${styles.icon}`}>{icons[variant]}</div>
        <div className="flex-1">
          {title && (
            <h4 className={`text-xl font-bold mb-2 ${styles.title}`}>{title}</h4>
          )}
          <div className="text-lg text-gray-200 leading-relaxed">{children}</div>
        </div>
      </div>
    </div>
  );
}
