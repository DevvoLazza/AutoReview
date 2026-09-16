"use client";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api";
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiRequest<T>(path));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Caricamento non riuscito");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { data, error, loading, refresh };
}
