import React from "react";
import { FolderOpen } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <FolderOpen className="w-8 h-8 text-slate-500" />,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
      <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 mb-3 shadow-inner">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
};

export default EmptyState;
