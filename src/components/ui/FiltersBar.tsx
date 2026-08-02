import { useCallback } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./Input";

interface FilterChip {
  key: string;
  label: string;
  count?: number;
}

interface FiltersBarProps {
  searchPlaceholder?: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filters?: FilterChip[];
  activeFilter?: string;
  onFilterChange?: (filterKey: string) => void;
  showClearButton?: boolean;
  className?: string;
}

/**
 * 通用筛选栏组件 - 支持搜索和 filter chips
 * 
 * @param searchPlaceholder 搜索占位符
 * @param searchTerm 当前搜索词
 * @param onSearchChange 搜索输入变更回调
 * @param filters Filter chip 列表
 * @param activeFilter 当前选中的 filter
 * @param onFilterChange Filter 切换回调
 * @param showClearButton 是否显示清除按钮
 * @param className 额外样式类
 */
export const FiltersBar: React.FC<FiltersBarProps> = ({
  searchPlaceholder = "搜索...",
  searchTerm,
  onSearchChange,
  filters,
  activeFilter,
  onFilterChange,
  showClearButton = true,
  className = "",
}) => {
  // 🔥 PERFORMANCE: Memoize handlers
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const handleClear = useCallback(() => {
    onSearchChange("");
  }, [onSearchChange]);

  const handleFilterChange = useCallback(
    (filterKey: string) => {
      if (onFilterChange && filterKey !== activeFilter) {
        onFilterChange(filterKey);
      }
    },
    [activeFilter, onFilterChange]
  );

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search Bar */}
      <div className="flex-1 min-w-0">
        <Input
          icon={<Search className="w-4 h-4 text-slate-400" />}
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={handleSearchChange}
          rightElement={
            searchTerm && showClearButton ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label="清除搜索"
                className="p-0.5 rounded hover:bg-slate-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
              >
                <X className="w-4 h-4 text-slate-500 hover:text-slate-300" />
              </button>
            ) : undefined
          }
          className="w-full"
        />
      </div>

      {/* Filter Chips */}
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => handleFilterChange(filter.key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                activeFilter === filter.key
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                  : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80"
              }`}
            >
              {filter.label}
              {filter.count !== undefined && filter.count > 0 && (
                <span className="ml-1.5 text-[10px] opacity-90">
                  {filter.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
