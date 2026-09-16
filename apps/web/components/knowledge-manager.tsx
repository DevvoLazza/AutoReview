"use client";
import type { KnowledgeSource } from "@reviewguard/contracts";
import { type FormEvent, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import type { Workspace } from "@/lib/workspace";
import { useSession } from "./auth-gate";
import { ResourceState } from "./resource-state";

const initial = {
  title: "",
  content: "",
  kind: "faq",
  language: "it",
  locationId: "",
  validFrom: "",
  validUntil: "",
};
export function KnowledgeManager() {
  const { data, error, loading, refresh } = useResource<{ data: KnowledgeSource[] }>("/knowledge");
  const workspace = useResource<Workspace>("/workspace");
  const [form, setForm] = useState(initial);
  const [editing, setEditing] = useState<KnowledgeSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<KnowledgeSource | null>(null);
  const session = useSession();
  const canEdit = Boolean(session && ["owner", "admin", "editor"].includes(session.principal.role));
  const canApprove = Boolean(session && ["owner", "admin"].includes(session.principal.role));
  async function execute(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    setNotice("");
    try {
      await operation();
      setNotice(message);
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await execute(async () => {
      const body = {
        ...form,
        locationId: form.locationId || null,
        validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
        validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
        ...(editing ? { expectedVersion: editing.version } : {}),
      };
      await apiRequest(editing ? `/knowledge/${editing.id}/edit` : "/knowledge", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setEditing(null);
      setForm(initial);
    }, "Fonte salvata come bozza: richiede approvazione prima dell’utilizzo");
  }
  async function upload(file: File) {
    await execute(async () => {
      if (file.size > 4_000_000) throw new Error("Il documento deve essere inferiore a 4 MB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 32768)
        binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      await apiRequest("/knowledge/documents", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          base64: btoa(binary),
          language: form.language,
          locationId: form.locationId || null,
        }),
      });
    }, "Documento estratto come bozza. Controlla il testo e approvalo.");
  }
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Memoria controllata</span>
          <h1>Conoscenza aziendale</h1>
          <p>Solo fonti approvate, valide e pertinenti possono guidare le risposte.</p>
        </div>
      </header>
      {notice && (
        <p className="inline-notice" aria-live="polite">
          {notice}
        </p>
      )}
      {canEdit && (
        <section className="panel operational-panel">
          <h2>{editing ? "Modifica fonte" : "Nuova fonte"}</h2>
          <form className="operational-form" onSubmit={submit}>
            <label>
              Titolo
              <input
                required
                minLength={2}
                maxLength={200}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </label>
            <div className="operational-actions">
              <label>
                Tipo
                <select
                  value={form.kind}
                  onChange={(event) => setForm({ ...form, kind: event.target.value })}
                >
                  {[
                    "business_profile",
                    "service",
                    "opening_hours",
                    "contact",
                    "tone",
                    "faq",
                    "policy",
                    "forbidden_claim",
                    "document",
                  ].map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lingua
                <input
                  required
                  minLength={2}
                  maxLength={16}
                  value={form.language}
                  onChange={(event) => setForm({ ...form, language: event.target.value })}
                />
              </label>
              <label>
                Sede
                <select
                  value={form.locationId}
                  onChange={(event) => setForm({ ...form, locationId: event.target.value })}
                >
                  <option value="">Tutta l’attività</option>
                  {workspace.data?.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Informazioni verificate
              <textarea
                required
                rows={8}
                maxLength={250000}
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
              />
            </label>
            <div className="operational-actions">
              <label>
                Valida dal
                <input
                  type="datetime-local"
                  value={form.validFrom}
                  onChange={(event) => setForm({ ...form, validFrom: event.target.value })}
                />
              </label>
              <label>
                Valida fino al
                <input
                  type="datetime-local"
                  value={form.validUntil}
                  onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
                />
              </label>
              <button type="submit" className="primary-button" disabled={busy}>
                Salva bozza
              </button>
              {editing && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setEditing(null);
                    setForm(initial);
                  }}
                >
                  Annulla modifica
                </button>
              )}
            </div>
          </form>
          <label className="privacy-note">
            Oppure importa PDF testuale, DOCX, TXT o Markdown (massimo 4 MB)
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </label>
        </section>
      )}
      <section className="panel operational-panel">
        <h2>Fonti dell’attività</h2>
        <ResourceState loading={loading} error={error} retry={refresh} />
        {!loading && !error && !data?.data.length && (
          <p>Nessuna fonte. Inizia da servizi, contatti e regole di gestione dei reclami.</p>
        )}
        <div className="knowledge-grid">
          {data?.data.map((entry) => (
            <article className="knowledge-card" key={entry.id}>
              <div>
                <span className="kind">{entry.kind.replaceAll("_", " ")}</span>
                <span>
                  {entry.status === "approved"
                    ? "Approvata"
                    : entry.status === "draft"
                      ? "Bozza"
                      : "Ritirata"}
                </span>
              </div>
              <h3>{entry.title}</h3>
              <p>
                {entry.content.slice(0, 220)}
                {entry.content.length > 220 ? "…" : ""}
              </p>
              <footer>
                <span>
                  v{entry.version} · {entry.language.toUpperCase()}
                </span>
              </footer>
              <div className="operational-actions">
                <button type="button" className="text-button" onClick={() => setSelected(entry)}>
                  Leggi fonte
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(entry);
                      setForm({
                        title: entry.title,
                        content: entry.content,
                        kind: entry.kind,
                        language: entry.language,
                        locationId: entry.locationId ?? "",
                        validFrom: localInput(entry.validFrom),
                        validUntil: localInput(entry.validUntil),
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Modifica
                  </button>
                )}
                {canApprove && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      execute(
                        () =>
                          apiRequest(`/knowledge/${entry.id}/approve`, {
                            method: "POST",
                            body: JSON.stringify({ expectedVersion: entry.version }),
                          }),
                        "Fonte approvata",
                      )
                    }
                  >
                    {entry.status === "approved" ? "Reindicizza fonte" : "Approva fonte"}
                  </button>
                )}
                {canApprove && entry.status !== "retired" && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      execute(
                        () =>
                          apiRequest(`/knowledge/${entry.id}/retire`, {
                            method: "POST",
                            body: JSON.stringify({ expectedVersion: entry.version }),
                          }),
                        "Fonte ritirata",
                      )
                    }
                  >
                    Ritira
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      {selected && (
        <section className="panel operational-panel">
          <h2>
            {selected.title} · v{selected.version}
          </h2>
          <p className="source-content">{selected.content}</p>
          <button type="button" className="secondary-button" onClick={() => setSelected(null)}>
            Chiudi fonte
          </button>
        </section>
      )}
    </div>
  );
}
function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
