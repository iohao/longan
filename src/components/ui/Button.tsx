import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "amber";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  ...props
}) => {
  const baseClasses =
    "inline-flex cursor-pointer items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

  const variantClasses = {
    primary:
      "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 focus:ring-emerald-500 border border-emerald-500/30",
    secondary:
      "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 focus:ring-slate-500",
    danger:
      "bg-rose-600/90 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 border border-rose-500/30 focus:ring-rose-500",
    amber:
      "bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 border border-amber-500/30 focus:ring-amber-500",
    ghost:
      "bg-transparent hover:bg-slate-800/60 text-slate-300 hover:text-slate-100 focus:ring-slate-500",
    outline:
      "bg-transparent hover:bg-slate-800/40 text-slate-300 border border-slate-700 hover:border-slate-500 focus:ring-slate-500",
  };

  const sizeClasses = {
    sm: "text-xs px-2.5 py-1.5 gap-1.5",
    md: "text-sm px-3.5 py-2 gap-2",
    lg: "text-base px-5 py-2.5 gap-2.5",
  };

  const iconOnlyClasses = {
    sm: "text-xs p-1.5",
    md: "text-sm p-2",
    lg: "text-base p-2.5",
  };

  const sizeStyle = !children ? iconOnlyClasses[size] : sizeClasses[size];

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeStyle} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current motion-reduce:animate-none" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children && <span>{children}</span>}
    </button>
  );
};

export default Button;
