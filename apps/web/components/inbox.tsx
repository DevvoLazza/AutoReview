"use client";

import type { ReviewCase } from "@reviewguard/contracts";
import Link from "next/link";
import { useState } from "react";
import { useResource } from "@/lib/use-resource";
import { Icon } from "./icons";
import { ResourceState } from "./resource-state";
import { StatusBadge } from "./status-badge";

export function Inbox() {
  const [status, setStatus] = useState("");
  const { data, error, loading, refresh } = useResource<{ data: ReviewCase[] }>(
    `/reviews?limit=100${status ? `&status=${status}` : ""}`,
  );
  const reviews = data?.data ?? [];

  return (
    <section className="panel inbox-panel" id="inbox">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Centro approvazioni</span>
          <h2>Recensioni da gestire</h2>
        </div>
        <div className="panel-actions">
          <select
            aria-label="Filtra recensioni per stato"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Tutti gli stati</option>
            <option value="received">Da generare</option>
            <option value="pending_approval">Da approvare</option>
            <option value="needs_attention">Da verificare</option>
            <option value="scheduled_auto">Programmate</option>
            <option value="publishing">Invio in corso</option>
            <option value="published">Pubblicate</option>
            <option value="rejected">Rifiutate</option>
          </select>
          <button type="button" className="ghost-button" disabled={loading} onClick={refresh}>
            Aggiorna
          </button>
        </div>
      </div>
      <div className="review-list">
        <ResourceState loading={loading} error={error} retry={refresh} />
        {!loading && !error && reviews.length === 0 && (
          <p className="operational-panel">
            Nessuna recensione. Collega Google dalle impostazioni e importa una sede, oppure cambia
            filtro.
          </p>
        )}
        {!loading &&
          !error &&
          reviews.map((review) => (
            <Link href={`/inbox/${review.id}`} className="review-row" key={review.id}>
              <div className={`rating-orb rating-${review.snapshot.starRating}`}>
                {review.snapshot.starRating}
                <span>★</span>
              </div>
              <div className="review-main">
                <div className="review-meta">
                  <strong>{review.snapshot.reviewerDisplayName}</strong>
                  <span>·</span>
                  <span>{relativeTime(review.snapshot.createTime)}</span>
                </div>
                <p>{review.snapshot.comment || "Recensione senza testo"}</p>
                {review.activeDraft ? (
                  <small className="draft-preview">
                    <span>AI</span>
                    {review.activeDraft.text}
                  </small>
                ) : null}
              </div>
              <div className="review-tail">
                <StatusBadge status={review.status} />
                <Icon name="arrow" />
              </div>
            </Link>
          ))}
      </div>
      <div className="panel-footer">
        <span>Mostrate {reviews.length} recensioni operative</span>
        <small>Le nuove recensioni restano nell’inbox anche senza notifica push.</small>
      </div>
    </section>
  );
}

function relativeTime(value: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 24 ? `${hours} ore fa` : `${Math.round(hours / 24)} giorni fa`;
}
