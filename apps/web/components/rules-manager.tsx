"use client";
import type { AutomationDecision, AutomationRule, ReviewCase } from "@reviewguard/contracts";
import { type FormEvent, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import type { Workspace } from "@/lib/workspace";
import { ResourceState } from "./resource-state";

export function RulesManager() {
  const { data, error, loading, refresh } = useResource<{ data: AutomationRule[] }>(
    "/automation-rules",
  );
  const workspace = useResource<Workspace>("/workspace");
  const reviews = useResource<{ data: ReviewCase[] }>("/reviews?limit=100");
  const [name, setName] = useState("");
  const [ratings, setRatings] = useState([5]);
  const [languages, setLanguages] = useState("");
  const [categories, setCategories] = useState("");
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [commentMode, setCommentMode] = useState("any");
  const [action, setAction] = useState("require_approval");
  const [delay, setDelay] = useState(10);
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewId, setReviewId] = useState("");
  const owner = workspace.data?.principal.role === "owner";
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
  async function create(event: FormEvent) {
    event.preventDefault();
    await execute(async () => {
      await apiRequest("/automation-rules", {
        method: "POST",
        body: JSON.stringify({
          name,
          locationIds,
          starRatings: ratings,
          languages: languages
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          categories: categories
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          commentMode,
          action,
          delayMinutes: delay,
          dailyLimit: limit,
          enabled: false,
        }),
      });
      setName("");
    }, "Regola salvata disattivata");
  }
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Governance</span>
          <h1>Regole di automazione</h1>
          <p>L’AI propone. Soltanto il motore controllato può programmare un invio.</p>
        </div>
      </header>
      <section className="safety-banner">
        <div>
          <strong>
            {workspace.data?.settings.killSwitch ? "Kill switch attivo" : "Kill switch disattivato"}
          </strong>
          <p>
            {workspace.data?.integration.automationReleased
              ? "Ogni invio ricontrolla consenso, calibrazione, rischi e limiti."
              : "Invio automatico non rilasciato: il pilot resta ad approvazione manuale."}
          </p>
          <a href="/settings" className="text-button">
            Gestisci impostazioni
          </a>
        </div>
      </section>
      {notice && (
        <p className="inline-notice" aria-live="polite">
          {notice}
        </p>
      )}
      {workspace.data && ["owner", "admin"].includes(workspace.data.principal.role) && (
        <section className="panel operational-panel">
          <h2>Nuova regola</h2>
          <form className="operational-form" onSubmit={create}>
            <label>
              Nome
              <input
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <fieldset>
              <legend>Valutazioni</legend>
              <div className="operational-actions">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <label key={rating}>
                    <input
                      type="checkbox"
                      checked={ratings.includes(rating)}
                      onChange={(event) =>
                        setRatings(
                          event.target.checked
                            ? [...ratings, rating]
                            : ratings.filter((item) => item !== rating),
                        )
                      }
                    />
                    {rating} ★
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Lingue (codici separati da virgola; vuoto = tutte)
              <input
                value={languages}
                onChange={(event) => setLanguages(event.target.value)}
                placeholder="it, en"
              />
            </label>
            <label>
              Categorie (vuoto = tutte)
              <input
                value={categories}
                onChange={(event) => setCategories(event.target.value)}
                placeholder="praise, complaint"
              />
            </label>
            <fieldset>
              <legend>Sedi (nessuna selezione = tutte)</legend>
              {workspace.data.locations.map((location) => (
                <label key={location.id}>
                  <input
                    type="checkbox"
                    checked={locationIds.includes(location.id)}
                    onChange={(event) =>
                      setLocationIds(
                        event.target.checked
                          ? [...locationIds, location.id]
                          : locationIds.filter((id) => id !== location.id),
                      )
                    }
                  />
                  {location.displayName}
                </label>
              ))}
            </fieldset>
            <label>
              Testo recensione
              <select value={commentMode} onChange={(event) => setCommentMode(event.target.value)}>
                <option value="any">Qualsiasi</option>
                <option value="with_text">Con testo</option>
                <option value="rating_only">Solo valutazione</option>
              </select>
            </label>
            <label>
              Azione
              <select value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="require_approval">Richiedi approvazione</option>
                <option value="schedule_auto">Programma invio controllato</option>
              </select>
            </label>
            <div className="operational-actions">
              <label>
                Attesa in minuti
                <input
                  type="number"
                  min={10}
                  max={10080}
                  value={delay}
                  onChange={(event) => setDelay(Number(event.target.value))}
                />
              </label>
              <label>
                Limite giornaliero
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                />
              </label>
            </div>
            <button type="submit" className="primary-button" disabled={busy || !ratings.length}>
              Salva regola disattivata
            </button>
          </form>
        </section>
      )}
      <section className="panel operational-panel">
        <h2>Regole dell’attività</h2>
        <ResourceState loading={loading} error={error} retry={refresh} />
        {!loading && !error && !data?.data.length && (
          <p>Nessuna regola: tutte le risposte richiedono approvazione.</p>
        )}
        {data?.data.map((rule) => (
          <article className="rule-row" key={rule.id}>
            <div className="rule-main">
              <h3>{rule.name}</h3>
              <p>
                {rule.starRatings.map((rating) => `${rating}★`).join(", ")} ·{" "}
                {rule.languages.join(", ") || "tutte le lingue"} ·{" "}
                {rule.enabled ? "attiva" : "disattivata"}
              </p>
              <small>
                {rule.delayMinutes} minuti · limite {rule.dailyLimit}/giorno · {rule.commentMode} ·{" "}
                {rule.action}
              </small>
            </div>
            {owner && (
              <button
                type="button"
                className="secondary-button"
                disabled={
                  busy ||
                  (!rule.enabled &&
                    (!workspace.data?.integration.automationReleased ||
                      !workspace.data.principal.mfaVerified))
                }
                onClick={() => {
                  if (rule.enabled)
                    void execute(
                      () =>
                        apiRequest(`/automation-rules/${rule.id}/disable`, {
                          method: "POST",
                          body: "{}",
                        }),
                      "Regola disattivata",
                    );
                  else if (
                    window.confirm(
                      "Autorizzi espressamente gli invii automatici nelle condizioni di questa regola? Consenso automation-consent-v1.",
                    )
                  )
                    void execute(
                      () =>
                        apiRequest(`/automation-rules/${rule.id}/enable`, {
                          method: "POST",
                          body: JSON.stringify({
                            expectedConsentVersion: "automation-consent-v1",
                            mfaVerified: true,
                          }),
                        }),
                      "Regola attivata con consenso",
                    );
                }}
              >
                {rule.enabled ? "Disattiva" : "Attiva con consenso"}
              </button>
            )}
          </article>
        ))}
      </section>
      <section className="panel operational-panel">
        <h2>Simulazione senza invio</h2>
        <div className="operational-actions">
          <select
            aria-label="Recensione da simulare"
            value={reviewId}
            onChange={(event) => setReviewId(event.target.value)}
          >
            <option value="">Scegli una recensione con bozza</option>
            {reviews.data?.data
              .filter((review) => review.activeDraft)
              .map((review) => (
                <option key={review.id} value={review.id}>
                  {review.snapshot.reviewerDisplayName} · {review.snapshot.starRating}★
                </option>
              ))}
          </select>
          <button
            type="button"
            className="secondary-button"
            disabled={busy || !reviewId}
            onClick={() =>
              execute(async () => {
                const result = await apiRequest<AutomationDecision>("/automation-rules/simulate", {
                  method: "POST",
                  body: JSON.stringify({ reviewId }),
                });
                setNotice(
                  `${result.action === "schedule_auto" ? "Programmabile" : "Approvazione richiesta"}: ${result.reason}`,
                );
              }, "")
            }
          >
            Simula regole
          </button>
        </div>
      </section>
    </div>
  );
}
