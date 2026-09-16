"use client";
import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import type { Workspace } from "@/lib/workspace";
import { useSession } from "./auth-gate";
import { LocationPreferences } from "./location-preferences";
import { ResourceState } from "./resource-state";

type Discovery = {
  data: Array<{
    name: string;
    accountName: string;
    locations: Array<{ name: string; title: string }>;
  }>;
};
export function SettingsManager() {
  const { data, error, loading, refresh } = useResource<Workspace>("/workspace");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [preferences, setPreferences] = useState<Workspace["settings"] | null>(null);
  const [syncCursors, setSyncCursors] = useState<Record<string, string | undefined>>({});
  const session = useSession();
  const owner = session?.principal.role === "owner";
  async function execute(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      await operation();
      if (message) setNotice(message);
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }
  const settings = preferences ?? data?.settings;
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Configurazione</span>
          <h1>Impostazioni e collegamenti</h1>
          <p>Lo stato mostrato proviene dal backend, non da dati dimostrativi locali.</p>
        </div>
      </header>
      <ResourceState loading={loading} error={error} retry={refresh} />
      {notice && (
        <p className="inline-notice" aria-live="polite">
          {notice}
        </p>
      )}
      {data && (
        <>
          <section className="panel operational-panel">
            <h2>Google Business Profile</h2>
            <p>
              {data.integration.googleMode !== "live"
                ? "Adapter simulato: non legge né pubblica su Google."
                : data.integration.googleConnected
                  ? "Account collegato. Seleziona e importa le sedi autorizzate."
                  : "Account da collegare."}
            </p>
            <p className="privacy-note">
              Per l’uso reale serve un progetto Google approvato per Business Profile APIs. L’owner
              autorizza l’accesso offline e la gestione delle recensioni delle sedi selezionate.
            </p>
            {owner && (
              <div className="operational-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() =>
                    execute(async () => {
                      const result = await apiRequest<{ authorizationUrl: string }>(
                        "/integrations/google/start",
                      );
                      window.location.assign(result.authorizationUrl);
                    }, "Autorizzazione Google in apertura")
                  }
                >
                  {data.integration.googleConnected ? "Ricollega Google" : "Collega Google"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    busy ||
                    (data.integration.googleMode === "live" && !data.integration.googleConnected)
                  }
                  onClick={() =>
                    execute(
                      async () =>
                        setDiscovery(await apiRequest<Discovery>("/integrations/google/discover")),
                      "Sedi autorizzate caricate",
                    )
                  }
                >
                  Trova sedi autorizzate
                </button>
                <button
                  type="button"
                  className="reject-button"
                  disabled={busy || !data.integration.googleConnected}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Disconnettere Google e cancellare recensioni, bozze e token temporanei?",
                      )
                    )
                      void execute(async () => {
                        const result = await apiRequest<{ remoteCleanupPending: boolean }>(
                          "/integrations/google/disconnect",
                          { method: "POST", body: "{}" },
                        );
                        setDiscovery(null);
                        if (result.remoteCleanupPending)
                          throw new Error(
                            "Disconnessione locale completata. Revoca anche l’accesso dal tuo account Google: la pulizia remota non è stata confermata.",
                          );
                      }, "Google disconnesso e dati temporanei cancellati");
                  }}
                >
                  Disconnetti e cancella dati
                </button>
              </div>
            )}
            {discovery && (
              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />{" "}
                  Autorizzo lettura delle recensioni, notifiche e pubblicazione delle risposte che
                  approvo per le sedi selezionate.
                </label>
                {discovery.data.map((account) => (
                  <div key={account.name}>
                    <h3>{account.accountName}</h3>
                    {account.locations.map((location) => (
                      <div className="operational-actions" key={location.name}>
                        <span>{location.title}</span>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy || !consent}
                          onClick={() =>
                            execute(
                              () =>
                                apiRequest("/integrations/google/import-location", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    accountName: account.name,
                                    locationName: location.name,
                                    consent: true,
                                  }),
                                }),
                              "Sede collegata. Importa ora le recensioni.",
                            )
                          }
                        >
                          Collega sede
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel operational-panel">
            <h2>Sedi e importazione recensioni</h2>
            {!data.locations.length && (
              <p>Nessuna sede. Collega Google e scegli una sede autorizzata.</p>
            )}
            {data.locations.map((location) => (
              <div key={location.id}>
                <h3>{location.displayName}</h3>
                <p>
                  {location.active ? "Attiva" : "Disconnessa"} · {location.manualApprovalCount}/20
                  approvazioni di calibrazione
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    busy || !location.active || !["owner", "admin"].includes(data.principal.role)
                  }
                  onClick={() =>
                    execute(async () => {
                      let nextPageToken = syncCursors[location.id];
                      let total = 0;
                      do {
                        const result = await apiRequest<{
                          imported: number;
                          nextPageToken: string | null;
                        }>("/integrations/google/sync", {
                          method: "POST",
                          body: JSON.stringify({
                            locationId: location.id,
                            pageToken: nextPageToken,
                          }),
                        });
                        total += result.imported;
                        nextPageToken = result.nextPageToken ?? undefined;
                        setSyncCursors((current) => ({ ...current, [location.id]: nextPageToken }));
                      } while (nextPageToken && total < 5000);
                      setNotice(
                        `${total} recensioni importate. ${nextPageToken ? "Clicca Riprendi importazione per continuare." : "Le nuove bozze richiedono approvazione."}`,
                      );
                    }, "")
                  }
                >
                  {syncCursors[location.id] ? "Riprendi importazione" : "Importa recensioni"}
                </button>
                {["owner", "admin"].includes(data.principal.role) && (
                  <LocationPreferences
                    key={`${location.id}/${location.tone}/${location.defaultLanguage}`}
                    location={location}
                    disabled={busy}
                    save={(value) =>
                      void execute(
                        () =>
                          apiRequest(`/locations/${location.id}/settings`, {
                            method: "POST",
                            body: JSON.stringify(value),
                          }),
                        "Preferenze della sede salvate",
                      )
                    }
                  />
                )}
              </div>
            ))}
          </section>
          <section className="panel operational-panel">
            <h2>Accesso e MFA</h2>
            <p>
              Ruolo: {data.principal.role} ·{" "}
              {data.principal.mfaVerified
                ? "secondo fattore verificato"
                : "secondo fattore da configurare o utilizzare nell’accesso"}
            </p>
            {!session?.demo && (
              <Link href="/mfa" className="secondary-button">
                Configura authenticator
              </Link>
            )}
            <p className="privacy-note">
              Gli account del pilot vengono creati e assegnati tramite il comando di provisioning
              dell’amministratore. Non sono consentiti accessi pubblici non autorizzati.
            </p>
          </section>
          {owner && settings && (
            <section className="panel operational-panel">
              <h2>Preferenze aziendali</h2>
              <form
                className="operational-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void execute(
                    () =>
                      apiRequest("/workspace/settings", {
                        method: "POST",
                        body: JSON.stringify(settings),
                      }),
                    "Preferenze salvate",
                  );
                }}
              >
                <label>
                  Lingua predefinita
                  <input
                    required
                    minLength={2}
                    maxLength={16}
                    value={settings.defaultLanguage}
                    onChange={(event) =>
                      setPreferences({ ...settings, defaultLanguage: event.target.value })
                    }
                  />
                </label>
                <label>
                  Tono di voce
                  <textarea
                    required
                    minLength={3}
                    maxLength={1000}
                    value={settings.tone}
                    onChange={(event) => setPreferences({ ...settings, tone: event.target.value })}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.killSwitch}
                    disabled={!data.integration.automationReleased}
                    onChange={(event) =>
                      setPreferences({ ...settings, killSwitch: event.target.checked })
                    }
                  />{" "}
                  Blocca tutte le automazioni (kill switch)
                </label>
                <p className="privacy-note">
                  Il rilascio degli invii automatici resta bloccato finché non vengono completati
                  pilot, calibrazione e autorizzazioni.
                </p>
                <button className="primary-button" type="submit" disabled={busy}>
                  Salva preferenze
                </button>
              </form>
            </section>
          )}
          <section className="panel operational-panel">
            <h2>AI e archiviazione</h2>
            <p>Modello: {data.integration.model}</p>
            <p>
              AI: {data.integration.aiMode} · Archivio: {data.integration.storageMode}
            </p>
            <p className="privacy-note">
              Le chiavi, lo snapshot e i provider consentiti sono configurati dall’amministratore
              tramite ambiente e Secret Manager, mai nel browser.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
