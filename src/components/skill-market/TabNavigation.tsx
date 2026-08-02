import GithubIcon from "../icons/GithubIcon";

interface Tab {
  key: string;
  icon: React.ElementType;
  count: number | null;
  label: string;
  highlight: boolean;
  /** 激活状态下额外显示琥珀色脉冲小圆点（如：有可更新技能） */
  pulse?: boolean;
}

interface TabNavigationProps {
  activeTab: string;
  onChange: (tab: string) => void;
  tabs: Tab[];
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onChange,
  tabs,
}) => {
  return (
    <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
            activeTab === tab.key
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {tab.icon === GithubIcon ? (
            <tab.icon className="w-3.5 h-3.5 text-slate-300" />
          ) : (
            <tab.icon className={`w-3.5 h-3.5 ${tab.highlight ? "text-emerald-300" : ""}`} />
          )}
          <span>{tab.label}</span>
          {tab.count !== null && tab.count > 0 && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key
                  ? "bg-emerald-700/80 text-white"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {tab.count}
            </span>
          )}
          {tab.pulse && activeTab === tab.key && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1" />
          )}
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;
