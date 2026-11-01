"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { SessionClaims } from "@/lib/jwt";
import { onUnauthorized } from "@/services/api/client";
import { clearLocalSession } from "@/services/auth";
import { useAdminStore } from "@/stores/admin";
import { useAnalysisStore } from "@/stores/analysis";
import { useCasesStore } from "@/stores/cases";
import { useExaminationsStore } from "@/stores/examinations";
import { useSessionStore } from "@/stores/session";
import { toast } from "@/stores/toast";

/** Clears every user-scoped store (mobile clearUserScopedState / clearAdminState). */
export function resetUserState() {
  useExaminationsStore.getState().reset();
  useCasesStore.getState().reset();
  useAnalysisStore.getState().reset();
  useAdminStore.getState().reset();
  useSessionStore.getState().reset();
}

/**
 * Seeds the client session from the server-read cookie claims and ends the
 * session everywhere when any API call returns 401.
 */
export function SessionProvider({
  claims,
  children,
  fallback = null,
}: {
  claims: SessionClaims;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const router = useRouter();
  const handling = useRef(false);
  // The stores are module singletons. On the server they would be shared by
  // every request, so they are only seeded in the browser, before children mount.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = useSessionStore.getState().claims;
    if (current && current.userId !== claims.userId) resetUserState();
    useSessionStore.getState().setClaims(claims);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [claims]);

  useEffect(() => {
    void useSessionStore.getState().loadProfile();
  }, [claims.userId]);

  useEffect(
    () =>
      onUnauthorized(() => {
        if (handling.current) return;
        handling.current = true;
        void clearLocalSession().finally(() => {
          resetUserState();
          toast.error("Your session has expired. Please sign in again.");
          router.replace(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
          handling.current = false;
        });
      }),
    [router],
  );

  return ready ? children : fallback;
}
