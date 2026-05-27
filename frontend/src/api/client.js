import axios from "axios";

/**
 * Base URL for the DocuMind backend.
 * Set VITE_API_BASE in .env.local (e.g. http://localhost:8000).
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 300000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("documind:token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Extract a user-facing error message from an Axios / FastAPI error.
 * @param {unknown} error
 * @returns {string}
 */
export function getErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail.map((item) => item.msg ?? JSON.stringify(item)).join(", ");
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

/**
 * Upload a PDF with chunking strategy (multipart form-data).
 * @param {File} file
 * @param {string} chunkingStrategy - fixed | sentence | semantic
 * @param {(progressEvent: import('axios').AxiosProgressEvent) => void} [onUploadProgress]
 */
export async function uploadDocument(file, chunkingStrategy, compareMode, onUploadProgress) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("chunking_strategy", chunkingStrategy);
  formData.append("compare_mode", compareMode);

  const response = await api.post("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });

  return response.data;
}

/**
 * List uploaded documents from Qdrant.
 * @returns {Promise<Array<{ doc_id: string, filename: string, chunk_count: number, uploaded_at: string }>>}
 */
export async function listDocuments() {
  const response = await api.get("/documents");
  return response.data;
}

/**
 * Delete a document and all its chunks from Qdrant.
 * @param {string} docId
 */
export async function deleteDocument(docId) {
  await api.delete(`/documents/${docId}`);
}

export async function compareQuery({ question, docId, topK = 4 }) {
  const token = localStorage.getItem("documind:token");
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/compare`, {
    method: "POST",
    headers,
    body: JSON.stringify({ question, doc_id: docId, top_k: topK }),
  })
  if (!res.ok) throw new Error(`Compare failed: ${res.status}`)
  return res.json()
}
