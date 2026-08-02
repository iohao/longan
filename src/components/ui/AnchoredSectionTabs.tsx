import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import SettingsSection from "./SettingsSection";

export interface AnchoredSection {
  /** 唯一标识,同时用于生成 section 的 DOM id(section-${id}) */
  id: string;
  label: string;
  icon: LucideIcon;
  /** 导航项右侧的提示圆点 */
  dot?: boolean;
  specialEffect?: "default" | "strong" | "doctor";
  content: ReactNode;
}

interface AnchoredSectionTabsProps {
  sections: AnchoredSection[];
}

/**
 * AnchoredSectionTabs - 侧边锚点导航 + 连续滚动内容区
 *
 * 导航 tab 和内容 section 由同一份 sections 配置渲染,
 * 新增条目时两者天然一一对应,不存在 id 失配导致点击不跳转的问题。
 * 内部封装了点击平滑滚动与 IntersectionObserver 滚动高亮同步。
 */
export default function AnchoredSectionTabs({
  sections,
}: AnchoredSectionTabsProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const isClickScrolling = useRef(false);

  const domId = (id: string) => `section-${id}`;

  // 以 id 序列为依赖,sections 数组每次渲染重建时不会反复重挂 observer
  const idsKey = sections.map((s) => s.id).join("|");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrolling.current) return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id.replace("section-", ""));
          }
        });
      },
      {
        rootMargin: "-15% 0px -65% 0px",
        threshold: 0,
      }
    );

    idsKey.split("|").forEach((id) => {
      const el = document.getElementById(domId(id));
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [idsKey]);

  const scrollToSection = (id: string) => {
    setActiveId(id);
    isClickScrolling.current = true;

    document
      .getElementById(domId(id))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

    setTimeout(() => {
      isClickScrolling.current = false;
    }, 600);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 items-start">
      {/* Sticky Vertical Sidebar Navigation */}
      <nav className="w-full md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none border-b md:border-b-0 border-slate-800/80 md:sticky md:top-6 self-start z-10 bg-slate-950/80 md:bg-transparent backdrop-blur-md md:backdrop-blur-none">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeId === section.id;
          return (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left shrink-0 ${
                isActive
                  ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? "text-emerald-400" : "text-slate-400"
                  }`}
                />
                <span className="truncate">{section.label}</span>
              </div>
              {section.dot && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Continuous Scroll Main Panel Area */}
      <main className="flex-1 min-w-0 space-y-6 w-full">
        {sections.map((section) => (
          <SettingsSection
            key={section.id}
            id={domId(section.id)}
            isActive={activeId === section.id}
            specialEffect={section.specialEffect}
          >
            {section.content}
          </SettingsSection>
        ))}
      </main>
    </div>
  );
}
