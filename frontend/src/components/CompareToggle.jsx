import { GitCompare } from "lucide-react"

export function CompareToggle({ enabled, onChange }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg
                    border border-slate-200 bg-white select-none">
      <GitCompare size={14} className={enabled ? "text-violet-600" : "text-slate-400"} />
      <span className="text-xs text-slate-600 font-medium">Compare strategies</span>
      {/* Toggle switch */}
      <button
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full
                    transition-colors duration-200 focus:outline-none
                    ${enabled ? "bg-violet-600" : "bg-slate-200"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white
                          transition-transform duration-200
                          ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  )
}
