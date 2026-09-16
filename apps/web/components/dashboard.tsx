"use client";
import Link from "next/link";
import { useResource } from "@/lib/use-resource";
import type { Workspace } from "@/lib/workspace";
import { Inbox } from "./inbox";
import { ResourceState } from "./resource-state";
export function Dashboard() {
  const { data, error, loading, refresh } = useResource<Workspace>("/workspace");
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Operazioni recensioni</span>
          <h1>La tua attività, sotto controllo</h1>
          <p>Genera proposte e verifica ogni risposta prima della pubblicazione.</p>
        </div>
        <Link className="primary-button" href="/settings">
          Collega o gestisci una sede
        </Link>
      </header>
      <ResourceState loading={loading} error={error} retry={refresh} />
      {data && (
        <>
          <section className="metrics-grid">
            {[
              ["Da approvare", data.metrics.pending],
              ["Da verificare", data.metrics.attention],
              ["Pubblicate in archivio", data.metrics.published],
              ["Fonti approvate", data.metrics.approvedSources],
            ].map(([label, value]) => (
              <article className="metric-card" key={label}>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>Dati dell’attività corrente</small>
                </div>
              </article>
            ))}
          </section>
          <section className="panel operational-panel">
            <h2>Stato reale dei servizi</h2>
            <div className="operational-actions">
              <span>
                Google:{" "}
                {data.integration.googleMode !== "live"
                  ? "simulato — nessun invio reale"
                  : data.integration.googleConnected
                    ? "collegato"
                    : "da collegare"}
              </span>
              <span>
                AI: {data.integration.aiMode === "mock" ? "simulata" : data.integration.model}
              </span>
              <span>
                Dati:{" "}
                {data.integration.storageMode === "postgres" ? "PostgreSQL" : "temporanei — demo"}
              </span>
              <span>
                Automazione:{" "}
                {data.settings.killSwitch || !data.integration.automationReleased
                  ? "bloccata"
                  : "controllata dalle regole"}
              </span>
            </div>
          </section>
          {data.locations.map((location) => (
            <section key={location.id} className="panel operational-panel">
              <h2>{location.displayName}</h2>
              <p>
                {location.active ? "Sede attiva" : "Sede disconnessa"} ·{" "}
                {location.manualApprovalCount}/20 approvazioni manuali di calibrazione
              </p>
            </section>
          ))}
        </>
      )}
      <Inbox />
    </div>
  );
}
