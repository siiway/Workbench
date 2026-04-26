import { useState, useEffect } from "react";
import type { PermissionsMe } from "../types";

export type PermissionsState = {
  data: PermissionsMe | null;
  error: string | null;
  loading: boolean;
};

export function usePermissions(teamId: string, setId?: string | null) {
  const [state, setState] = useState<PermissionsState>({
    data: null,
    error: null,
    loading: false,
  });

  useEffect(() => {
    if (!teamId) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const url = setId
      ? `/api/glint/teams/${teamId}/permissions/me?setId=${encodeURIComponent(setId)}`
      : `/api/glint/teams/${teamId}/permissions/me`;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetch(url)
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) {
          let msg = `${r.status}`;
          try {
            const j = JSON.parse(text);
            msg = j.error ?? msg;
          } catch {
            msg = `${r.status}: ${text.slice(0, 200)}`;
          }
          throw new Error(msg);
        }
        return JSON.parse(text) as PermissionsMe;
      })
      .then((d) => {
        if (!cancelled) setState({ data: d, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Network error";
        console.warn("[usePermissions] failed:", msg);
        setState({ data: null, error: msg, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, setId]);

  return state;
}
