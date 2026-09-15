import { Icon } from "@/components/icons";
import { demoRules } from "@/lib/demo-data";

export default function RulesPage() {
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Governance</span>
          <h1>Regole di automazione</h1>
          <p>Il motore applica condizioni deterministiche; l’AI non decide mai di pubblicare.</p>
        </div>
        <button type="button" className="primary-button">
          + Crea regola
        </button>
      </header>
      <div className="safety-banner">
        <Icon name="shield" />
        <div>
          <strong>Kill switch globale attivo in modalità sicura</strong>
          <p>
            Tutte le nuove regole nascono disattivate e richiedono MFA, consenso versionato e 20
            approvazioni manuali.
          </p>
        </div>
        <button type="button">Gestisci</button>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Configurazione</span>
            <h2>Regole della sede</h2>
          </div>
          <span className="count-chip">{demoRules.length} regola</span>
        </div>
        {demoRules.map((rule) => (
          <article className="rule-row" key={rule.id}>
            <div className="rule-icon">
              <Icon name="bolt" />
            </div>
            <div className="rule-main">
              <div>
                <h3>{rule.name}</h3>
                <span className={rule.enabled ? "rule-on" : "rule-off"}>
                  {rule.enabled ? "Attiva" : "Disattivata"}
                </span>
              </div>
              <p>
                {rule.starRatings.map((rating) => `${rating}★`).join(", ")} ·{" "}
                {rule.languages.join(", ").toUpperCase()} · attesa {rule.delayMinutes} minuti
              </p>
              <div className="guardrail-list">
                <span>✓ Hard stop</span>
                <span>✓ Limite {rule.dailyLimit}/giorno</span>
                <span>✓ MFA richiesta</span>
              </div>
            </div>
            <button type="button" className="ghost-button">
              Configura
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}
