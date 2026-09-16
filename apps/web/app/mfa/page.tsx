"use client";
import type { TotpEnrollment } from "@reviewguard/core";
import Link from "next/link";
import { useState } from "react";

export default function MfaPage() {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function execute(action: "enroll-start" | "enroll-finish") {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionInfo: enrollment?.sessionInfo, code }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message);
      if (action === "enroll-start") setEnrollment(value);
      else {
        setEnrollment(null);
        setDone(true);
        setNotice(value.message);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="panel auth-card">
        <span className="eyebrow">Sicurezza</span>
        <h1>Attiva il secondo fattore</h1>
        <p>
          Usa un’app authenticator compatibile TOTP. Non condividere la chiave di configurazione.
        </p>
        {!enrollment && !done && (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => execute("enroll-start")}
          >
            Inizia configurazione
          </button>
        )}
        {enrollment && (
          <>
            <p>Aggiungi un account manualmente nell’app authenticator:</p>
            <label>
              Chiave segreta
              <input readOnly value={enrollment.sharedSecretKey} aria-label="Chiave segreta TOTP" />
            </label>
            <p>
              {enrollment.verificationCodeLength} cifre · {enrollment.periodSec} secondi ·{" "}
              {enrollment.hashingAlgorithm}
            </p>
            <label>
              Codice di verifica
              <input
                value={code}
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !/^\d{6}$/.test(code)}
              onClick={() => execute("enroll-finish")}
            >
              Conferma MFA
            </button>
          </>
        )}
        {notice && (
          <p aria-live="polite" className="inline-notice">
            {notice}
          </p>
        )}
        <Link className="text-button" href={done ? "/login" : "/settings"}>
          {done ? "Accedi nuovamente" : "Torna alle impostazioni"}
        </Link>
      </section>
    </main>
  );
}
