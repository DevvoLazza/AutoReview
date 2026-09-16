"use client";
import type { RequestPrincipal } from "@reviewguard/contracts";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { AppShell } from "./app-shell";

const SessionContext = createContext<{ principal: RequestPrincipal; demo: boolean } | null>(null);
export function useSession() {
  return useContext(SessionContext);
}
export function SiteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/mfa") return children;
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ principal: RequestPrincipal; demo: boolean } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    fetch("/api/session", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (result) => {
        if (!result.authenticated) {
          router.replace("/login");
          return;
        }
        const value = await apiRequest<{ principal: RequestPrincipal; demo: boolean }>("/session");
        if (active) setSession(value);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Accesso non disponibile");
      });
    return () => {
      active = false;
    };
  }, [router]);
  if (error)
    return (
      <main className="auth-page">
        <section className="panel auth-card">
          <h1>Accesso da verificare</h1>
          <p role="alert">{error}</p>
          <p>
            Verifica l’email e assicurati che l’amministratore ti abbia assegnato un’azienda e un
            ruolo.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={async () => {
              await fetch("/api/session", { method: "DELETE" });
              router.replace("/login");
            }}
          >
            Torna all’accesso
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={async () => {
              const response = await fetch("/api/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify-email" }),
              });
              const result = await response.json();
              setError(result.message);
            }}
          >
            Invia verifica email
          </button>
        </section>
      </main>
    );
  if (!session)
    return (
      <main className="auth-page" aria-busy="true">
        <p>Verifica della sessione…</p>
      </main>
    );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
