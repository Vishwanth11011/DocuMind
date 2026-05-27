import { useCallback, useRef, useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import { useUpload } from "../hooks/useUpload";

const CHUNKING_OPTIONS = [
  { value: "fixed", label: "Fixed" },
  { value: "sentence", label: "Sentence" },
  { value: "semantic", label: "Semantic" },
];

const PDF_MIME = "application/pdf";

/**
 * @param {{
 *   onUploadSuccess?: (result: import('../hooks/useUpload').UploadResult) => void,
 *   collapsed?: boolean,
 *   onExpand?: () => void,
 * }} props
 */
export default function UploadZone({
  onUploadSuccess,
  collapsed = false,
  onExpand,
  onCollapse,
  onRequireLogin,
}) {
  const fileInputRef = useRef(null);
  const [chunkingStrategy, setChunkingStrategy] = useState("fixed");
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const { upload, reset, isUploading, progress, error, result } = useUpload();
  const displayError = validationError || error;

  const validateFile = useCallback((file) => {
    if (!file) {
      return "No file selected.";
    }
    const isPdf =
      file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return "Only PDF files are supported.";
    }
    return null;
  }, []);

  const handleFile = useCallback(
    async (file) => {
      const message = validateFile(file);
      if (message) {
        setValidationError(message);
        return;
      }
      setValidationError(null);

      const data = await upload(file, chunkingStrategy, false);
      if (data && onUploadSuccess) {
        onUploadSuccess(data);
      }
    },
    [chunkingStrategy, onUploadSuccess, upload, validateFile],
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragging(false);
      
      const token = localStorage.getItem("documind:token");
      if (!token && onRequireLogin) {
        onRequireLogin();
        return;
      }

      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile, onRequireLogin],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileInputChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      event.target.value = "";
    },
    [handleFile],
  );

  if (collapsed && !isUploading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-colors">
        <button
          type="button"
          onClick={onExpand}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus:outline-none"
        >
          <div className="flex min-w-0 items-center gap-2">
            {result ? (
              <CheckCircle2
                className="h-5 w-5 shrink-0 text-green-600"
                aria-hidden
              />
            ) : (
              <FileUp className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            )}
            <span className="truncate text-sm font-medium text-slate-900">
              {result
                ? `${result.filename} — ${result.chunks_stored} chunks stored`
                : "Upload a new document"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </div>
    );
  }

  if (result && !isUploading && !collapsed) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-5 w-5 shrink-0 text-green-600"
              aria-hidden
            />
            <h3 className="text-sm font-semibold text-slate-900">Upload Status</h3>
          </div>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              title="Collapse"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-start gap-3 border-t border-slate-100 pt-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">
              {result.filename} — {result.chunks_stored} chunks stored
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {result.page_count} pages · processed in{" "}
              {result.processing_time_ms}ms
            </p>
            <button
              type="button"
              onClick={() => {
                setValidationError(null);
                reset();
              }}
              className="mt-4 text-sm font-medium text-primary hover:text-primary-hover"
            >
              Upload another document
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">
            {isUploading ? "Uploading..." : "Upload Document"}
          </h3>
        </div>
        {!isUploading && onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="Collapse"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label
            htmlFor="chunking-strategy"
            className="text-sm font-medium text-slate-700 flex flex-col"
          >
            <span>Primary chunking strategy</span>
            <span className="text-[10px] font-normal text-slate-400 mt-0.5">All strategies are processed automatically for Compare Mode.</span>
          </label>
          <select
            id="chunking-strategy"
            value={chunkingStrategy}
            onChange={(e) => setChunkingStrategy(e.target.value)}
            disabled={isUploading}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-48 self-start"
          >
            {CHUNKING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {displayError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{displayError}</span>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              fileInputRef.current?.click();
            }
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => {
            if (isUploading) return;
            const token = localStorage.getItem("documind:token");
            if (!token && onRequireLogin) {
              onRequireLogin();
              return;
            }
            fileInputRef.current?.click();
          }}
          className={[
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
            isDragging
              ? "border-primary bg-primary-light"
              : "border-slate-200 bg-slate-50 hover:border-primary/50 hover:bg-primary-light/50",
            isUploading ? "pointer-events-none opacity-80" : "",
          ].join(" ")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={PDF_MIME}
            className="hidden"
            onChange={onFileInputChange}
            disabled={isUploading}
          />

          {isUploading ? (
            <Loader2
              className="h-10 w-10 animate-spin text-primary"
              aria-hidden
            />
          ) : (
            <FileUp className="h-10 w-10 text-primary" aria-hidden />
          )}

          <p className="mt-4 text-center text-sm font-medium text-slate-900">
            {isUploading
              ? "Uploading and indexing your PDF…"
              : "Drag and drop a PDF here, or click to browse"}
          </p>
          <p className="mt-1 text-center text-xs text-slate-500">
            PDF only · max 50MB
          </p>
        </div>

        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <Upload className="h-3.5 w-3.5" aria-hidden />
                Upload progress
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
