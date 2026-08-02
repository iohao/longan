import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  header,
  footer,
  hoverEffect = true,
  className = "",
  ...props
}) => {
  return (
    <div
      className={`glass-card rounded-xl overflow-hidden ${
        hoverEffect ? "transition-all duration-200" : ""
      } ${className}`}
      {...props}
    >
      {header && <div className="px-5 py-4 border-b border-slate-800/80">{header}</div>}
      <div className="p-5">{children}</div>
      {footer && <div className="px-5 py-3 bg-slate-900/40 border-t border-slate-800/80">{footer}</div>}
    </div>
  );
};

export default Card;
