import type { ReactNode } from "react";

interface SkeletonProps {
  variant?: "text" | "line" | "rectangle" | "circle";
  width?: string | number;
  height?: string | number;
  className?: string;
  children?: ReactNode;
}

/**
 * 骨架屏组件 - 提供 loading 状态的视觉反馈
 * 
 * @param variant 样式变体
 * @param width 宽度 (Tailwind 类名或像素值)
 * @param height 高度 (Tailwind 类名或像素值)
 * @param className 额外样式类
 * @param children 可选的子内容 (用于自定义骨架屏)
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  variant = "text",
  width,
  height,
  className = "",
  children,
}) => {
  const baseClasses =
    "animate-pulse rounded bg-slate-700/50 dark:bg-slate-600/50";

  const variantClasses = {
    text: "h-4 w-full",
    line: "h-4 w-full",
    rectangle: "w-full",
    circle: "rounded-full h-8 w-8",
  };

  const currentVariant = variantClasses[variant];
  
  // Calculate dimensions based on provided values or defaults
  const style = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
  };

  return (
    <div
      className={`${baseClasses} ${currentVariant} ${className}`}
      style={style}
      role="status"
      aria-label="Loading..."
    >
      {children}
    </div>
  );
};
