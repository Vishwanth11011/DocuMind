import { useState, useCallback } from "react"
import { compareQuery } from "../api/client"

export function useCompare() {
  const [results, setResults]       = useState(null)   // null = no compare run yet
  const [loading, setLoading]       = useState(false)
  const [loadedCount, setLoadedCount] = useState(0)    // for "2/3 done" display
  const [error, setError]           = useState(null)
  const [activeTab, setActiveTab]   = useState("fixed")

  const runCompare = useCallback(async ({ question, docId }) => {
    setLoading(true)
    setResults(null)
    setError(null)
    setLoadedCount(0)

    try {
      // Simulate incremental progress (actual /compare returns all at once)
      // Show "1/3" immediately, "2/3" after 1s, "3/3" when done
      const t1 = setTimeout(() => setLoadedCount(1), 800)
      const t2 = setTimeout(() => setLoadedCount(2), 2000)

      const data = await compareQuery({ question, docId })

      clearTimeout(t1)
      clearTimeout(t2)
      setLoadedCount(3)
      setResults(data)
      setActiveTab("fixed")  // always start on Fixed tab
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResults(null)
    setError(null)
    setLoadedCount(0)
  }, [])

  return { results, loading, loadedCount, error, activeTab, setActiveTab, runCompare, reset }
}
