"use client";

import type { ReviewCase } from "@reviewguard/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { demoReviews } from "@/lib/demo-data";
import { Icon } from "./icons";
import { StatusBadge } from "./status-badge";

export function Inbox() {
  const [reviews, setReviews] = useState<ReviewCase[]>(demoReviews);
  const [live, setLive] = useState(false);

  useEffect(() => {
    apiRequest<{ data: ReviewCase[] }>("/reviews")
      .then((result) => {
        setReviews(result.data);
        setLive(true);
      })
      .catch(() => setLive(false));
  }, []);

  return (
    <section className="panel inbox-panel" id="inbox">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Centro approvazioni</span>
          <h2>Recensioni da gestire</h2>
        </div>
        <div className="panel-actions">
          <span className={live ? "live-dot" : "demo-dot"} />
          <small>{live ? "API connessa" : "Dati dimostrativi"}</small>
          <button type="button" className="ghost-button">
            Filtra
          </button>
        </div>
      </div>
      <div className="review-list">
        {reviews.map((review) => (
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
        <button type="button" className="text-button">
          Vedi tutto <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}

function relativeTime(value: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000));
  return hours < 24 ? `${hours} ore fa` : `${Math.round(hours / 24)} giorni fa`;
}
