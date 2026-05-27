import { useEffect, useRef, useState } from "react";
import { AlertCircle, Send, Check, Copy, Download } from "lucide-react";
import { useChat } from "../hooks/useChat";
import { useCompare } from "../hooks/useCompare";
import SourceCard from "./SourceCard";
import { exportSessionPDF } from "../utils/exportPDF";
import { CompareToggle } from "./CompareToggle";
import { CompareView } from "./CompareView";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

function CopyButton({ text, className = "" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
      aria-label="Assistant is typing"
    >
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
    </div>
  );
}

/**
 * @param {{
 *   focusedDoc?: { doc_id: string, filename: string } | null,
 *   documentsReady?: boolean,
 *   focusSelectionEpoch?: number,
 * }} props
 */
export default function ChatWindow({
  documents = [],
  focusedDoc = null,
  documentsReady = true,
  focusSelectionEpoch = 0,
  className = "",
}) {
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("all");
  const { messages, askQuestion, isStreaming, error } = useChat();
  const { results, loading, loadedCount, error: compareError, activeTab, setActiveTab, runCompare, reset } = useCompare();
  const [compareMode, setCompareMode] = useState(
    () => localStorage.getItem("documind:compareMode") === "true"
  );
  const [lastQuestion, setLastQuestion] = useState(null);

  const handleCompareModeChange = (val) => {
    setCompareMode(val);
    localStorage.setItem("documind:compareMode", val);
    if (!val) reset();
  };

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const canFocusDoc = Boolean(focusedDoc);

  const selectFocusedScope = () => {
    if (!focusedDoc) {
      return;
    }
    setScope("focused");
  };

  useEffect(() => {
    if (focusSelectionEpoch > 0 && focusedDoc) {
      setScope("focused");
    }
  }, [focusSelectionEpoch, focusedDoc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || isStreaming) {
      return;
    }

    const docId =
      scope === "focused" && focusedDoc ? focusedDoc.doc_id : null;

    setInput("");
    setLastQuestion(question);
    
    if (compareMode) {
      await runCompare({ question, docId });
      inputRef.current?.focus();
      return;
    }

    await askQuestion(question, { docId });
    inputRef.current?.focus();
  };

  const lastMessage = messages[messages.length - 1];

  return (
    <div className={`flex flex-col rounded-xl border border-slate-200 bg-slate-50 shadow-sm ${className}`}>
      <div className="border-b border-slate-200 bg-white px-4 py-3 rounded-t-xl flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">Ask your documents</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScope("all")}
              disabled={isStreaming}
              aria-pressed={scope === "all"}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "all"
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                isStreaming ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              Ask about all documents
            </button>
            <button
              type="button"
              onClick={selectFocusedScope}
              disabled={isStreaming || !canFocusDoc || !documentsReady}
              aria-pressed={scope === "focused"}
              title={
                canFocusDoc
                  ? `Limit search to ${focusedDoc.filename}`
                  : "Upload a PDF first"
              }
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                scope === "focused"
                  ? "bg-primary text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                isStreaming || !canFocusDoc || !documentsReady
                  ? "cursor-not-allowed opacity-60"
                  : "",
              ].join(" ")}
            >
              {focusedDoc
                ? `Ask about ${focusedDoc.filename}`
                : "Ask about selected doc"}
            </button>
          </div>
          {scope === "focused" && focusedDoc && (
            <p className="mt-2 text-xs text-slate-500">
              Questions use only chunks from{" "}
              <span className="font-medium text-slate-700">
                {focusedDoc.filename}
              </span>
              .
            </p>
          )}
          {scope === "all" && (
            <p className="mt-2 text-xs text-slate-500">
              Questions search across every uploaded document.
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 self-end sm:self-start shrink-0">
          {messages.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const sourcesMap = {};
                messages.forEach((msg, idx) => {
                  if (msg.role === "assistant" && msg.sources) {
                    sourcesMap[idx] = msg.sources.map(src => ({
                      filename: src.filename,
                      chunkIndex: src.chunk_index,
                      score: src.score,
                      preview: src.text
                    }));
                  }
                });
                exportSessionPDF({
                  messages,
                  sources: sourcesMap,
                  documents: documents.map(d => d.filename)
                });
              }}
               className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:text-primary hover:border-primary-hover transition-colors font-medium bg-white hover:bg-slate-50 shadow-sm"
            >
              <Download size={13} />
              Export PDF
            </button>
          )}
          <CompareToggle enabled={compareMode} onChange={handleCompareModeChange} />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500">
            Upload a PDF, then ask a question about its content.
          </p>
        )}

        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="group flex items-center justify-end gap-2">
                <CopyButton
                  text={message.content}
                  className="opacity-70 md:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150"
                />
                <div className="max-w-[85%] rounded-xl bg-primary px-4 py-2.5 text-sm text-white shadow-sm">
                  {message.content}
                </div>
              </div>
            );
          }

          const isEmptyStreaming =
            isStreaming &&
            message.id === lastMessage?.id &&
            message.content.length === 0;

          if (isEmptyStreaming) {
            return (
              <div key={message.id} className="flex justify-start">
                <TypingIndicator />
              </div>
            );
          }

          return (
            <div key={message.id} className="group flex flex-col items-start gap-2 w-full">
              <div className="relative max-w-[90%] rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm leading-relaxed text-slate-900 shadow-sm">
                <div className="prose prose-sm prose-slate max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-100 prose-a:text-primary">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.content && (
                  <CopyButton
                    text={message.content}
                    className="absolute right-2 top-2 opacity-70 md:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150"
                  />
                )}
              </div>
              {message.sources?.length > 0 && (
                <div className="w-full max-w-[90%] space-y-2">
                  <p className="text-xs font-medium text-slate-500">Sources</p>
                  {message.sources.map((source, index) => (
                    <SourceCard
                      key={`${source.filename}-${source.chunk_index}-${index}`}
                      index={index}
                      filename={source.filename}
                      chunkIndex={source.chunk_index}
                      text={source.text}
                      score={source.score}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {compareMode && lastQuestion && (
          <div className="mb-4">
            <CompareView
              question={lastQuestion}
              results={results}
              loading={loading}
              loadedCount={loadedCount}
              error={compareError}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}


      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-200 bg-white p-4 rounded-b-xl"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your documents…"
            disabled={isStreaming}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden />
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
