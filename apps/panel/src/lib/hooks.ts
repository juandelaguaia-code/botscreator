import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Carga datos de la API y, opcionalmente, los refresca cada `intervalMs` (la bandeja necesita ver
 * mensajes nuevos sin recargar). `key` identifica los parámetros: al cambiar, se descarta lo
 * anterior y se ignoran respuestas que lleguen tarde.
 */
export function useApi<T>(
  loader: () => Promise<T>,
  key: string,
  intervalMs?: number,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const version = useRef(0);
  const lastKey = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const current = ++version.current;
    try {
      const result = await loaderRef.current();
      if (current === version.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lastKey.current !== key) {
      if (lastKey.current !== null) setData(null);
      lastKey.current = key;
    }
    setLoading(true);
    void reload();
    if (!intervalMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [key, reload, intervalMs]);

  return { data, error, loading, reload };
}

let keySeq = 0;
const newKey = () => `row-${++keySeq}`;

/** Claves estables para filas editables que no tienen id propio (servicios, preguntas…). */
export function useRowKeys() {
  const [keys, setKeys] = useState<string[]>([]);
  return {
    keys,
    reset: useCallback((length: number) => setKeys(Array.from({ length }, newKey)), []),
    add: () => setKeys((k) => [...k, newKey()]),
    remove: (index: number) => setKeys((k) => k.filter((_, i) => i !== index)),
  };
}
