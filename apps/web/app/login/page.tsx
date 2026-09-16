"use client";
import type { MfaChallenge } from "@reviewguard/core";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          challenge ? { action: "mfa", ...challenge, code } : { action: "signin", email, password },
        ),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setPassword("");
      if (result.challenge) {
        setChallenge(result.challenge);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Accesso non riuscito");
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", email }),
      });
      const result = await response.json();
      setNotice(result.message);
    } catch {
      setNotice("Servizio non disponibile: riprova");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <form className="panel auth-card" onSubmit={submit}>
        <span className="eyebrow">AutoReview · Accesso protetto</span>
        <h1>{challenge ? "Verifica il tuo accesso" : "Le recensioni, sotto controllo"}</h1>
        <p>
          {challenge
            ? "Inserisci il codice della tua app authenticator."
            : "Accedi con l’account assegnato alla tua attività."}
        </p>
        {challenge ? (
          <label>
            Codice MFA
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </>
        )}
        {notice && (
          <p className="inline-notice" aria-live="polite">
            {notice}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Attendi…" : challenge ? "Verifica e accedi" : "Accedi"}
        </button>
        {challenge ? (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setChallenge(null);
              setCode("");
            }}
          >
            Cambia account
          </button>
        ) : (
          <button type="button" className="text-button" disabled={busy || !email} onClick={reset}>
            Password dimenticata?
          </button>
        )}
        <p className="privacy-note">
          Nessuna registrazione pubblica: gli account vengono autorizzati dall’amministratore del
          pilot.
        </p>
      </form>
    </main>
  );
}
