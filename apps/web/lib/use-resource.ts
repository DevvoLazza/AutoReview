"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "./api";
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<T>(path);
      if (request === sequence.current) setData(result);
    } catch (reason) {
      if (request === sequence.current)
        setError(reason instanceof Error ? reason.message : "Caricamento non riuscito");
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    return () => {
      sequence.current++;
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
