import { AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

export type AlertType = "success" | "error" | "warning" | "info";

interface AlertProps {
  type: AlertType;
  message: string;
  onClose?: () => void;
  duration?: number; // 自动消失时间（毫秒）
}

const alertConfig = {
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-300",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    icon: CheckCircle2,
  },
  error: {
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    text: "text-rose-400",
    iconBg: "bg-rose-500/10",
    iconColor: "text-rose-400",
    icon: AlertTriangle,
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-300",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    text: "text-sky-300",
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-400",
    icon: AlertCircle,
  },
};

export const Alert: React.FC<AlertProps> = ({
  type,
  message,
  onClose,
  duration,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const config = alertConfig[type];
  const IconComponent = config.icon;

  useEffect(() => {
    if (duration && isVisible) {
      const timer = setTimeout(() => setIsVisible(false), duration);
      return () => clearTimeout(timer);
    }
  }, [duration, isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className={`p-4 rounded-xl ${config.bg} ${config.border} ${config.text} text-sm flex items-center gap-2 animate-in fade-in duration-200`}
    >
      <IconComponent className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-black/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible-ring-white/50"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default Alert;
