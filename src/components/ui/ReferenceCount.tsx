import { Link } from "lucide-react";

interface ReferenceCountProps {
  count?: number;
  countLabel: string;
  viewLabel: string;
  onView: () => void;
}

export default function ReferenceCount({
  count,
  countLabel,
  viewLabel,
  onView,
}: ReferenceCountProps) {
  if (count === undefined) return null;

  if (count > 0) {
    return (
      <button
        type="button"
        title={viewLabel}
        aria-label={viewLabel}
        onClick={(event) => {
          event.stopPropagation();
          onView();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        className="group/reference flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs text-emerald-400 transition-[background-color,color,transform] hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-95 active:bg-emerald-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Link
          aria-hidden="true"
          className="h-3 w-3 transition-transform group-hover/reference:scale-110 motion-reduce:transition-none"
        />
        <span aria-hidden="true">{count}</span>
      </button>
    );
  }

  return (
    <span
      title={countLabel}
      className="flex shrink-0 items-center gap-1 px-1 text-xs text-slate-500"
    >
      <Link aria-hidden="true" className="h-3 w-3" />
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">{countLabel}</span>
    </span>
  );
}
