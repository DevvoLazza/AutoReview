"use client";

import type { ReviewCase } from "@reviewguard/contracts";
import { useState } from "react";
import { apiRequest, reviewAction } from "@/lib/api";
import { Icon } from "./icons";
import { StatusBadge } from "./status-badge";

export function ReviewWorkbench({ initial }: { initial: ReviewCase }) {
  const [review, setReview] = useState(initial);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(initial.activeDraft?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function execute(operation: () => Promise<ReviewCase>, message: string) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await operation();
      setReview(next);
      setDraft(next.activeDraft?.text ?? "");
      setNotice(message);
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
            <dd>Demo Location Milano</dd>
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
          <span className="model-chip">DeepSeek V4 Pro</span>
        </div>
        {draft ? (
          <textarea
            aria-label="Testo risposta"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={7}
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
            <button type="button" key={id}>
              Fonte {index + 1}
            </button>
          ))}
        </div>
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
              disabled={busy || instruction.length < 2}
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
        {notice ? <div className="inline-notice">{notice}</div> : null}
        <div className="decision-bar">
          <button
            type="button"
            className="reject-button"
            disabled={
              busy ||
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
            disabled={busy || !draft || draft === review.activeDraft?.text}
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
            disabled={busy || !review.activeDraft || review.status !== "pending_approval"}
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
