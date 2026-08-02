import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { reportFrontendError } from "../logging";

interface PageIdBadgeProps {
  pageId: string;
}

export default function PageIdBadge({ pageId }: PageIdBadgeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      reportFrontendError("Failed to copy page ID", err, "PageIdBadge");
    }
  };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 transition-colors hover:border-slate-700">
      <span className="text-slate-500 select-none">ID:</span>
      <span className="font-semibold text-slate-200 select-all">{pageId}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="ml-1 p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800/80 rounded transition-colors focus:outline-none"
        title="Copy Page ID"
      >
        {copied ? (
          <span className="flex items-center gap-1 text-emerald-400 font-medium font-sans">
            <Check className="w-3.5 h-3.5" />
            <span className="text-[11px]">Copied</span>
          </span>
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
