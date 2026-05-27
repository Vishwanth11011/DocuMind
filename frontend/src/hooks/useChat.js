import { useCallback, useRef, useState } from "react";
import { API_BASE } from "../api/client";

/**
 * @typedef {Object} Source
 * @property {string} filename
 * @property {number} chunk_index
 * @property {string} text
 * @property {number} score
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {'user' | 'assistant'} role
 * @property {string} content
 * @property {Source[]} [sources]
 */

/**
 * @param {string} buffer
 * @returns {{ remaining: string, events: object[] }}
 */
function parseNdjsonBuffer(buffer) {
  const lines = buffer.split("\n");
  const remaining = lines.pop() ?? "";
  const events = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      console.warn("Skipping invalid NDJSON line:", trimmed);
    }
  }

  return { remaining, events };
}

/**
 * Apply streaming events to the assistant message.
 * @param {object[]} events
 * @param {string} assistantId
 * @param {Function} setMessages
 */
function applyStreamEvents(events, assistantId, setMessages) {
  for (const data of events) {
    if (data.error) {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : "Streaming error from server.",
      );
    }
    if (data.token) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: msg.content + data.token }
            : msg,
        ),
      );
    }
    if (data.sources) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, sources: data.sources } : msg,
        ),
      );
    }
  }
}

/** Streaming chat via POST /ask (fetch + ReadableStream). */
export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const streamingRef = useRef(false);

  const askQuestion = useCallback(async (question, { docId = null, topK = 4 } = {}) => {
    const trimmed = question.trim();
    if (!trimmed || streamingRef.current) {
      return;
    }

    setError(null);
    streamingRef.current = true;
    setIsStreaming(true);

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    const assistantId = crypto.randomUUID();
    const assistantPlaceholder = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

    try {
      const token = localStorage.getItem("documind:token");
      const headers = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: trimmed,
          doc_id: docId,
          top_k: topK,
        }),
      });

      if (!response.ok) {
        let detail = `Request failed (${response.status})`;
        try {
          const body = await response.json();
          if (typeof body.detail === "string") {
            detail = body.detail;
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      if (!response.body) {
        throw new Error("No response body from server.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjsonBuffer(buffer);
        buffer = parsed.remaining;
        applyStreamEvents(parsed.events, assistantId, setMessages);
      }

      const finalParsed = parseNdjsonBuffer(`${buffer}\n`);
      applyStreamEvents(finalParsed.events, assistantId, setMessages);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to get an answer.";
      setError(message);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: message } : msg,
        ),
      );
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    askQuestion,
    isStreaming,
    error,
    clearMessages,
  };
}
