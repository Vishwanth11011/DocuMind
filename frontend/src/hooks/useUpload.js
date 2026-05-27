import { useCallback, useState } from "react";
import { getErrorMessage, uploadDocument } from "../api/client";

/**
 * @typedef {Object} UploadResult
 * @property {string} doc_id
 * @property {string} filename
 * @property {number} page_count
 * @property {number} chunks_stored
 * @property {number} processing_time_ms
 */

/**
 * Hook for PDF upload state, progress, and API calls.
 */
export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  /** @type {[UploadResult | null, Function]} */
  const [result, setResult] = useState(null);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
    setResult(null);
  }, []);

  /**
   * @param {File} file
   * @param {string} chunkingStrategy
   * @returns {Promise<UploadResult | null>}
   */
  const upload = useCallback(async (file, chunkingStrategy = "fixed", compareMode = false) => {
    setIsUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const data = await uploadDocument(file, chunkingStrategy, compareMode, (event) => {
        if (event.total) {
          const percent = Math.round((event.loaded * 100) / event.total);
          setProgress(percent);
        }
      });
      setResult(data);
      setProgress(100);
      return data;
    } catch (err) {
      setError(getErrorMessage(err));
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  return {
    upload,
    reset,
    isUploading,
    progress,
    error,
    result,
  };
}
