import { FileText, Loader2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { deleteDocument, getErrorMessage } from "../api/client";
import { formatRelativeTime } from "../utils/formatRelativeTime";

/**
 * @typedef {Object} Document
 * @property {string} doc_id
 * @property {string} filename
 * @property {number} page_count
 * @property {number} chunk_count
 * @property {string} uploaded_at
 */

/**
 * @param {{
 *   documents: Document[],
 *   focusedDocId?: string | null,
 *   loading?: boolean,
 *   onSelect: (doc: Document) => void,
 *   onDeleted: (docId: string) => void,
 * }} props
 */
export default function DocList({
  documents,
  focusedDocId = null,
  loading = false,
  onSelect,
  onDeleted,
}) {
  const handleDelete = (doc) => {
    toast(
      (t) => (
        <div className="flex max-w-xs flex-col gap-3">
          <p className="text-sm font-medium text-slate-900">
            Delete &ldquo;{doc.filename}&rdquo;?
          </p>
          <p className="text-xs text-slate-500">
            This removes all {doc.chunk_count} chunks from search. This cannot
            be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                toast.dismiss(t.id);
                try {
                  await deleteDocument(doc.doc_id);
                  onDeleted(doc.doc_id);
                  toast.success(`Deleted ${doc.filename}`);
                } catch (err) {
                  toast.error(getErrorMessage(err));
                }
              }}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ),
      { duration: Infinity },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Documents</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Click to focus questions on one file
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading…
          </div>
        )}

        {!loading && documents.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            No documents yet. Upload a PDF to get started.
          </p>
        )}

        <ul className="space-y-2">
          {documents.map((doc) => {
            const isFocused = doc.doc_id === focusedDocId;
            return (
              <li key={doc.doc_id}>
                <div
                  className={[
                    "group flex items-start gap-2 rounded-xl border p-3 transition-colors",
                    isFocused
                      ? "border-primary bg-primary-light"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(doc)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <FileText
                      className={[
                        "mt-0.5 h-4 w-4 shrink-0",
                        isFocused ? "text-primary" : "text-slate-400",
                      ].join(" ")}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p
                        className={[
                          "truncate text-sm font-medium",
                          isFocused ? "text-primary" : "text-slate-900",
                        ].join(" ")}
                        title={doc.filename}
                      >
                        {doc.filename}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {doc.page_count > 0
                          ? `${doc.page_count} pages · `
                          : ""}
                        {doc.chunk_count} chunks ·{" "}
                        {formatRelativeTime(doc.uploaded_at)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    className="rounded-lg p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Delete ${doc.filename}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
