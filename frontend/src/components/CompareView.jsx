import { useState, useEffect } from "react"
import { AlertCircle, ThumbsUp, ThumbsDown } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

const STRATEGIES   = ["fixed", "sentence", "semantic"]
const STRATEGY_LABELS = { fixed: "Fixed", sentence: "Sentence", semantic: "Semantic" }
const STRATEGY_DESC = {
  fixed:    "Splits text every ~500 tokens with 10% overlap",
  sentence: "Splits on sentence boundaries using NLP",
  semantic: "Groups sentences by meaning similarity",
}

// ── Vote persistence ─────────────────────────────────────
function getVoteKey(question, strategy) {
  return `vote:${btoa(question.slice(0, 40))}:${strategy}`
}
function getVote(question, strategy) {
  return localStorage.getItem(getVoteKey(question, strategy))
}
function setVote(question, strategy, value) {
  localStorage.setItem(getVoteKey(question, strategy), value)
}

// ── Cosine score bar (reuse styling from existing chunk visualizer) ──
function ScoreBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-violet-400"
          style={{ width: `${Math.round(score * 100)}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 tabular-nums w-8">
        {score.toFixed(2)}
      </span>
    </div>
  )
}

// ── Source card ───────────────────────────────────────────
function SourceCard({ source }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-100 rounded-lg p-2.5 mb-1.5">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs text-slate-500">
          {source.filename} · chunk {source.chunk_index}
        </span>
        <ScoreBar score={source.score} />
      </div>
      {open && (
        <p className="mt-2 text-xs text-slate-400 italic leading-relaxed">
          "{source.preview}..."
        </p>
      )}
    </div>
  )
}

// ── Stats row (shown after ≥3 total votes) ────────────────
function VoteStats({ question }) {
  const counts = { fixed: 0, sentence: 0, semantic: 0 }
  STRATEGIES.forEach(s => {
    if (getVote(question, s) === "up") counts[s]++
  })
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total < 3) return null
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  return (
    <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
      <p className="text-xs text-slate-500 mb-1.5">Your votes across questions:</p>
      <div className="flex gap-3">
        {STRATEGIES.map(s => (
          <span key={s} className={`text-xs font-medium px-2 py-0.5 rounded
            ${s === winner
              ? "bg-violet-100 text-violet-700"
              : "text-slate-500"}`}>
            {STRATEGY_LABELS[s]}: {counts[s]}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────
export function CompareView({ question, results, loading, loadedCount, error, activeTab, setActiveTab }) {

  // Per-tab vote state — derived from localStorage, re-read on tab switch
  const [votes, setVotes] = useState({})
  useEffect(() => {
    const v = {}
    STRATEGIES.forEach(s => { v[s] = getVote(question, s) })
    setVotes(v)
  }, [question, activeTab])

  const handleVote = (strategy, value) => {
    setVote(question, strategy, value)
    setVotes(v => ({ ...v, [strategy]: value }))
  }

  // ── Loading state ─────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 mt-3">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i}
                className={`h-1.5 w-1.5 rounded-full animate-bounce
                  ${loadedCount > i ? "bg-violet-500" : "bg-slate-200"}`}
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <span className="text-xs text-slate-500">
            {loadedCount < 3
              ? `Fetching answers... (${loadedCount}/3 done)`
              : "Processing results..."}
          </span>
        </div>
        {/* Skeleton tabs */}
        <div className="flex gap-4 border-b border-slate-100 pb-2 mb-4">
          {STRATEGIES.map(s => (
            <div key={s} className="h-4 w-16 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 0.8, 0.6].map((w, i) => (
            <div key={i}
              className="h-3 bg-slate-100 rounded animate-pulse"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 mt-3 flex gap-2.5">
        <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-medium text-red-600">Compare failed</p>
          <p className="text-xs text-red-400 mt-0.5">{error}</p>
        </div>
      </div>
    )
  }

  if (!results) return null

  const activeResult = results[activeTab]

  return (
    <div className="rounded-xl border border-slate-200 bg-white mt-3 overflow-hidden">

      {/* ── Tab bar ─────────────────────────────────────── */}
      <div className="flex border-b border-slate-100 px-4 pt-3 gap-1 overflow-x-auto
                      scrollbar-none" /* mobile horizontal scroll */>
        {STRATEGIES.map(s => {
          const hasError = results[s]?.error
          const isActive = activeTab === s
          return (
            <button
              key={s}
              onClick={() => setActiveTab(s)}
              className={`pb-2.5 px-3 text-xs font-medium whitespace-nowrap
                          border-b-2 transition-colors
                          ${isActive
                            ? "border-violet-500 text-violet-600"
                            : "border-transparent text-slate-400 hover:text-slate-600"
                          }
                          ${hasError ? "opacity-50" : ""}`}
            >
              {STRATEGY_LABELS[s]}
              {hasError && <span className="ml-1 text-red-400">!</span>}
            </button>
          )
        })}
      </div>

      {/* ── Strategy description ─────────────────────────── */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
        <p className="text-xs text-slate-400">{STRATEGY_DESC[activeTab]}</p>
      </div>

      {/* ── Answer area ──────────────────────────────────── */}
      <div className="p-4">
        {activeResult?.error ? (
          <div className="flex gap-2 text-xs text-red-500">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>This strategy failed: {activeResult.error}</span>
          </div>
        ) : (
          <>
            {/* Answer text */}
            <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-100 prose-a:text-primary mb-4">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {activeResult?.answer || ""}
              </ReactMarkdown>
            </div>

            {/* Sources */}
            {activeResult?.sources?.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                  Sources
                </p>
                {activeResult.sources.map((src, i) => (
                  <SourceCard key={i} source={src} />
                ))}
              </div>
            )}

            {/* Vote buttons */}
            <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
              <span className="text-xs text-slate-400">Was this helpful?</span>
              <button
                onClick={() => handleVote(activeTab, "up")}
                className={`p-1.5 rounded-md transition-colors
                  ${votes[activeTab] === "up"
                    ? "bg-violet-100 text-violet-600"
                    : "text-slate-300 hover:text-violet-400"}`}
                aria-label="Upvote this strategy answer"
              >
                <ThumbsUp size={13} />
              </button>
              <button
                onClick={() => handleVote(activeTab, "down")}
                className={`p-1.5 rounded-md transition-colors
                  ${votes[activeTab] === "down"
                    ? "bg-red-100 text-red-500"
                    : "text-slate-300 hover:text-red-400"}`}
                aria-label="Downvote this strategy answer"
              >
                <ThumbsDown size={13} />
              </button>

              {/* Token count — subtle, for the curious */}
              {activeResult?.tokens_used && (
                <span className="ml-auto text-xs text-slate-300">
                  {activeResult.tokens_used} tokens
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Aggregate vote stats (after ≥3 votes) ───────── */}
      <div className="px-4 pb-4">
        <VoteStats question={question} />
      </div>
    </div>
  )
}
