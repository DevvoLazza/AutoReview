"use client";

import type { KnowledgeSource, ReviewCase } from "@reviewguard/contracts";
import { useState } from "react";
import { apiRequest, reviewAction } from "@/lib/api";
import { useSession } from "./auth-gate";
import { Icon } from "./icons";
import { StatusBadge } from "./status-badge";

export function ReviewWorkbench({ initial }: { initial: ReviewCase }) {
  const [review, setReview] = useState(initial);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(initial.activeDraft?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState<KnowledgeSource | null>(null);
  const session = useSession();
  const canApprove = Boolean(
    session?.principal.mfaVerified && ["owner", "approver"].includes(session.principal.role),
  );

  async function execute(operation: () => Promise<ReviewCase>, message: string) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await operation();
      setReview(next);
      setDraft(next.activeDraft?.text ?? "");
      setNotice(
        next.status === "needs_attention"
          ? "La recensione è cambiata o ha già una risposta: serve una nuova verifica."
          : message,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workbench-grid">
      <section className="panel review-source-card">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Recensione originale</span>
            <h2>{review.snapshot.reviewerDisplayName}</h2>
          </div>
          <StatusBadge status={review.status} />
        </div>
        <div className="large-stars">
          {"★".repeat(review.snapshot.starRating)}
          <span>{"★".repeat(5 - review.snapshot.starRating)}</span>
        </div>
        <blockquote>{review.snapshot.comment || "Recensione senza testo"}</blockquote>
        <dl className="detail-list">
          <div>
            <dt>Lingua</dt>
            <dd>{review.snapshot.languageHint?.toUpperCase() ?? "AUTO"}</dd>
          </div>
          <div>
            <dt>Sede</dt>
            <dd>{review.snapshot.locationId}</dd>
          </div>
          <div>
            <dt>Aggiornata</dt>
            <dd>{new Date(review.snapshot.updateTime).toLocaleString("it-IT")}</dd>
          </div>
        </dl>
        {review.activeDraft?.riskFlags.length ? (
          <div className="risk-box">
            <Icon name="alert" />
            <div>
              <strong>Revisione umana obbligatoria</strong>
              <p>{review.activeDraft.riskFlags.join(", ")}</p>
            </div>
          </div>
        ) : null}
      </section>
      <section className="panel reply-card">
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Proposta AI</span>
            <h2>Risposta pubblica</h2>
          </div>
          <span className="model-chip">Proposta da verificare</span>
        </div>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() =>
            execute(() => apiRequest(`/reviews/${review.id}`), "Recensione aggiornata")
          }
        >
          Ricarica recensione
        </button>
        {draft ? (
          <textarea
            aria-label="Testo risposta"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={7}
            maxLength={4000}
            disabled={busy || ["published", "publishing"].includes(review.status)}
          />
        ) : (
          <div className="empty-draft">
            <Icon name="brain" />
            <p>Nessuna proposta ancora generata.</p>
          </div>
        )}
        <div className="source-pills">
          <span>Fonti usate</span>
          {review.activeDraft?.knowledgeSourceIds.map((id, index) => (
            <button
              type="button"
              key={id}
              onClick={async () => {
                try {
                  setSource(await apiRequest<KnowledgeSource>(`/knowledge/${id}`));
                } catch (error) {
                  setNotice(error instanceof Error ? error.message : "Fonte non disponibile");
                }
              }}
            >
              Fonte {index + 1}
            </button>
          ))}
        </div>
        {source && (
          <aside className="risk-box">
            <div>
              <strong>
                {source.title} · v{source.version} · {source.status}
              </strong>
              <p className="source-content">{source.content}</p>
              <button type="button" className="text-button" onClick={() => setSource(null)}>
                Chiudi fonte
              </button>
            </div>
          </aside>
        )}
        {!review.activeDraft &&
          ["received", "needs_attention", "rejected"].includes(review.status) && (
            <button
              type="button"
              className="primary-button"
              disabled={busy || Boolean(review.snapshot.existingReply)}
              onClick={() =>
                execute(
                  () =>
                    apiRequest(`/reviews/${review.id}/generate`, {
                      method: "POST",
                      body: JSON.stringify({ expectedVersion: review.version }),
                    }),
                  "Bozza generata",
                )
              }
            >
              Genera risposta
            </button>
          )}
        {review.status === "publishing" && (
          <div className="inline-notice">
            <p>
              L’esito dell’invio è in verifica. Attendi due minuti prima di riconciliarlo; non
              inviare manualmente da Google nel frattempo.
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !canApprove}
              onClick={() =>
                execute(
                  () => reviewAction(review, "approve"),
                  "Verifica della pubblicazione completata",
                )
              }
            >
              Verifica esito su Google
            </button>
          </div>
        )}
        {review.status === "scheduled_auto" && (
          <div className="inline-notice">
            <p>
              Invio previsto:{" "}
              {review.scheduledAt && new Date(review.scheduledAt).toLocaleString("it-IT")}
            </p>
            <button
              type="button"
              disabled={busy || !canApprove}
              className="reject-button"
              onClick={() =>
                execute(() => reviewAction(review, "cancel-schedule"), "Invio annullato")
              }
            >
              Annulla invio programmato
            </button>
          </div>
        )}
        <div className="revision-box">
          <label htmlFor="instruction">Come deve essere modificata?</label>
          <div>
            <input
              id="instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Es. Più breve e meno formale"
            />
            <button
              type="button"
              disabled={
                busy ||
                instruction.length < 2 ||
                ["published", "publishing", "generating"].includes(review.status) ||
                Boolean(review.snapshot.existingReply)
              }
              onClick={() =>
                execute(
                  () =>
                    apiRequest(`/reviews/${review.id}/revise`, {
                      method: "POST",
                      body: JSON.stringify({ instruction, expectedVersion: review.version }),
                    }),
                  "Nuova versione generata",
                )
              }
            >
              Rigenera
            </button>
          </div>
        </div>
        {notice ? (
          <div className="inline-notice" aria-live="polite">
            {notice}
          </div>
        ) : null}
        {!canApprove && (
          <p className="privacy-note">
            La pubblicazione richiede ruolo Owner/Approver e accesso con MFA.{" "}
            <a href="/mfa">Configura MFA</a>.
          </p>
        )}
        <div className="decision-bar">
          <button
            type="button"
            className="reject-button"
            disabled={
              busy ||
              !canApprove ||
              !["pending_approval", "scheduled_auto", "needs_attention"].includes(review.status)
            }
            onClick={() =>
              execute(
                () => reviewAction(review, "reject", "Rifiutata dal pannello"),
                "Risposta rifiutata",
              )
            }
          >
            Rifiuta
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={
              busy ||
              !draft ||
              draft === review.activeDraft?.text ||
              ["published", "publishing"].includes(review.status)
            }
            onClick={() =>
              execute(
                () =>
                  apiRequest(`/reviews/${review.id}/edit`, {
                    method: "POST",
                    body: JSON.stringify({ text: draft, expectedVersion: review.version }),
                  }),
                "Modifica salvata",
              )
            }
          >
            Salva modifica
          </button>
          <button
            type="button"
            className="approve-button"
            disabled={
              busy ||
              !canApprove ||
              !review.activeDraft ||
              review.status !== "pending_approval" ||
              draft !== review.activeDraft.text
            }
            onClick={() =>
              execute(() => reviewAction(review, "approve"), "Risposta pubblicata e verificata")
            }
          >
            {busy ? "Attendi…" : "Approva e pubblica"}
            <Icon name="check" />
          </button>
        </div>
      </section>
    </div>
  );
}
