import { useCallback, useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";
import { listDocuments } from "./api/client";
import ChatWindow from "./components/ChatWindow";
import DocList from "./components/DocList";
import UploadZone from "./components/UploadZone";
import LoginModal from "./components/LoginModal";

/**
 * @typedef {{ doc_id: string, filename: string, page_count?: number, chunk_count?: number, uploaded_at?: string }} Document
 * @typedef {{ doc_id: string, filename: string }} FocusedDoc
 */

export default function App() {
  /** @type {[Document[], Function]} */
  const [documents, setDocuments] = useState([]);
  /** @type {[FocusedDoc | null, Function]} */
  const [focusedDoc, setFocusedDoc] = useState(null);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [focusSelectionEpoch, setFocusSelectionEpoch] = useState(0);
  const [uploadCollapsed, setUploadCollapsed] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username, setUsername] = useState(() => {
    const token = localStorage.getItem("documind:token");
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split('.')[1])).sub;
    } catch {
      return null;
    }
  });

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);

      setFocusedDoc((current) => {
        if (current && docs.some((doc) => doc.doc_id === current.doc_id)) {
          return current;
        }
        if (docs.length === 0) {
          return null;
        }
        return {
          doc_id: docs[0].doc_id,
          filename: docs[0].filename,
        };
      });
      return docs;
    } catch (err) {
      console.error("Failed to load documents:", err);
      return [];
    } finally {
      setDocumentsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const handleUploadSuccess = useCallback(
    (result) => {
      setFocusedDoc({
        doc_id: result.doc_id,
        filename: result.filename,
      });
      setFocusSelectionEpoch((epoch) => epoch + 1);
      setUploadCollapsed(true);
      refreshDocuments();
    },
    [refreshDocuments],
  );

  const handleLoginSuccess = useCallback(() => {
    setIsLoginOpen(false);
    const token = localStorage.getItem("documind:token");
    if (token) {
      try {
        setUsername(JSON.parse(atob(token.split('.')[1])).sub);
      } catch {}
    }
    refreshDocuments();
  }, [refreshDocuments]);

  const handleSelectDocument = useCallback((doc) => {
    setFocusedDoc({ doc_id: doc.doc_id, filename: doc.filename });
    setFocusSelectionEpoch((epoch) => epoch + 1);
  }, []);

  const handleDocumentDeleted = useCallback(
    (docId) => {
      setDocuments((prev) => {
        const remaining = prev.filter((doc) => doc.doc_id !== docId);
        setFocusedDoc((current) => {
          if (current?.doc_id !== docId) {
            return current;
          }
          if (remaining.length === 0) {
            return null;
          }
          return {
            doc_id: remaining[0].doc_id,
            filename: remaining[0].filename,
          };
        });
        return remaining;
      });
      refreshDocuments();
    },
    [refreshDocuments],
  );

  return (
    <div className="flex min-h-screen lg:h-screen lg:overflow-hidden flex-col bg-white">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={() => setIsLoginOpen(false)} 
        onLoginSuccess={handleLoginSuccess} 
      />
      <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm">
            <span className="text-xl font-bold">D</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 leading-tight">DocuMind</h1>
            <p className="text-xs font-medium text-slate-500">
              Document Analysis and Q&A
            </p>
          </div>
        </div>
        {username && (
          <div className="text-sm font-medium text-slate-700 bg-slate-100 px-4 py-1.5 rounded-full border border-slate-200">
            Hi, {username}
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col lg:flex-row min-h-0 lg:overflow-hidden">
        <aside className="w-full shrink-0 border-b border-slate-200 lg:w-[280px] lg:border-b-0 lg:border-r h-[240px] lg:h-full flex flex-col min-h-0">
          <DocList
            documents={documents}
            focusedDocId={focusedDoc?.doc_id ?? null}
            loading={!documentsLoaded}
            onSelect={handleSelectDocument}
            onDeleted={handleDocumentDeleted}
          />
        </aside>

        <main className="min-w-0 flex-1 flex flex-col min-h-0 px-6 py-6 gap-6 lg:overflow-hidden">
          <div className="shrink-0">
            <UploadZone
              collapsed={uploadCollapsed}
              onCollapse={() => setUploadCollapsed(true)}
              onExpand={() => setUploadCollapsed(false)}
              onUploadSuccess={handleUploadSuccess}
              onRequireLogin={() => setIsLoginOpen(true)}
            />
          </div>
          <ChatWindow
            documents={documents}
            focusedDoc={focusedDoc}
            documentsReady={documentsLoaded}
            focusSelectionEpoch={focusSelectionEpoch}
            className="flex-1 h-[500px] lg:h-full min-h-0"
          />
        </main>
      </div>
    </div>
  );
}
