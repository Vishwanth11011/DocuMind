import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const BORDER_COLORS = [
  "border-violet-500",
  "border-indigo-500",
  "border-purple-500",
  "border-fuchsia-500",
  "border-blue-500",
  "border-cyan-500",
];

/**
 * @param {{
 *   index: number,
 *   filename: string,
 *   chunkIndex: number,
 *   text: string,
 *   score?: number,
 * }} props
 */
export default function SourceCard({
  index,
  filename,
  chunkIndex,
  text,
  score,
}) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = BORDER_COLORS[index % BORDER_COLORS.length];
  const preview =
    text.length > 150 ? `${text.slice(0, 150)}…` : text;

  return (
    <div
      className={`overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ${borderColor} border border-slate-200`}
    >
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900">
            [{index + 1}] {filename}
            <span className="font-normal text-slate-500">
              {" "}
              · chunk {chunkIndex}
            </span>
          </p>
          {!expanded && (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {preview}
            </p>
          )}
        </div>
        {typeof score === "number" && (
          <span className="shrink-0 text-[10px] font-medium text-slate-400">
            {(score * 100).toFixed(0)}%
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2.5 text-xs leading-relaxed text-slate-700 prose prose-sm prose-slate max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
