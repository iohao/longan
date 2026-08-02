import React from "react";

interface SettingsSectionProps {
  id: string;
  isActive: boolean;
  children: React.ReactNode;
  specialEffect?: "default" | "strong" | "doctor";
}

/**
 * SettingsSection - 设置页面板块的通用组件
 * 
 * 提供统一的视觉效果模板，包括：
 * - 边框高亮（当板块激活时）
 * - 顶部流光动画
 * - 渐变背景光晕
 * - 可选的特殊特效变体
 */
export default function SettingsSection({
  id,
  isActive,
  children,
  specialEffect = "default",
}: SettingsSectionProps) {
  // 根据特效类型选择不同的高亮强度
  const getShadowClass = () => {
    switch (specialEffect) {
      case "strong":
        return "shadow-[0_0_48px_-12px_rgba(16,185,129,0.6)]";
      case "doctor":
        return "shadow-[0_0_56px_-12px_rgba(16,185,129,0.7)]";
      case "default":
      default:
        return "shadow-[0_0_32px_-8px_rgba(16,185,129,0.4)]";
    }
  };

  const getHeightClass = () => {
    switch (specialEffect) {
      case "strong":
        return "h-1.5";
      case "default":
      case "doctor":
      default:
        return "h-1";
    }
  };

  return (
    <div id={id} className="scroll-mt-6">
      <div
        className={`relative overflow-hidden transition-all duration-500 ${
          isActive ? `border-emerald-500 ${getShadowClass()}` : ""
        }`}
      >
        {/* Active glow effect */}
        {isActive && (
          <>
            <div
              className={`absolute top-0 left-0 right-0 ${getHeightClass()} bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-75 animate-shimmer`}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
            {specialEffect === "doctor" && (
              <div className="absolute bottom-0 left-0 right-0 h-px bg-emerald-500/30" />
            )}
          </>
        )}
        
        {children}
      </div>
    </div>
  );
}
