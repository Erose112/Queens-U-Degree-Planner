import { useCallback, useRef, useState } from "react";

/**
 * Hook for lazy-loading and caching data with automatic deduplication.
 * Prevents duplicate requests for the same key while one is in-flight.
 *
 * @param onSuccess - Callback to update parent state with fetched data
 * @returns Object with { isLoading, error, fetch } - call fetch(key, fetchFn)
 */
export function useCachedFetch<T>(
  onSuccess: (key: string | number, data: T) => void
): {
  isLoading: (key: string | number) => boolean;
  error: string | null;
  fetch: (key: string | number, fetchFn: () => Promise<T>) => void;
} {
  const fetchingKeys = useRef<Set<string | number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const isLoading = useCallback(
    (key: string | number) => fetchingKeys.current.has(key),
    []
  );

  const fetch = useCallback(
    async (key: string | number, fetchFn: () => Promise<T>) => {
      // Deduplicate: if already fetching this key, skip
      if (fetchingKeys.current.has(key)) return;

      fetchingKeys.current.add(key);
      try {
        const data = await fetchFn();
        onSuccess(key, data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
        // Call onSuccess with empty/fallback to prevent infinite retries
        // Caller can handle this in their onSuccess callback
      } finally {
        fetchingKeys.current.delete(key);
      }
    },
    [onSuccess]
  );

  return { isLoading, error, fetch };
}
