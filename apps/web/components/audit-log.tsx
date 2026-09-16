"use client";
import type { AuditEvent } from "@reviewguard/contracts";
import { useResource } from "@/lib/use-resource";
import { ResourceState } from "./resource-state";
export function AuditLog() {
  const { data, error, loading, refresh } = useResource<{ data: AuditEvent[] }>("/audit");
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Tracciabilità</span>
          <h1>Registro attività</h1>
          <p>
            Decisioni, modello, provider e versioni delle fonti. Nessun testo di recensione nei
            metadati.
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={refresh}>
          Aggiorna
        </button>
      </header>
      <section className="panel operational-panel">
        <ResourceState loading={loading} error={error} retry={refresh} />
        {!loading && !error && !data?.data.length && <p>Nessun evento registrato.</p>}
        {data?.data.slice(0, 200).map((event) => (
          <details className="operational-panel" key={event.id}>
            <summary>
              {new Date(event.createdAt).toLocaleString("it-IT")} · {event.action}
            </summary>
            <p>
              Attore: {event.actorId} · {event.entityType}: {event.entityId}
            </p>
            <pre className="source-content">{JSON.stringify(event.metadata, null, 2)}</pre>
          </details>
        ))}
      </section>
    </div>
  );
}
