import { Icon } from "@/components/icons";

export default function SettingsPage() {
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Configurazione</span>
          <h1>Impostazioni</h1>
          <p>Integrazioni, sicurezza e preferenze della sede.</p>
        </div>
      </header>
      <div className="settings-grid">
        <section className="panel setting-card">
          <div className="setting-icon google">G</div>
          <div>
            <span className="eyebrow">Integrazione</span>
            <h2>Google Business Profile</h2>
            <p>
              Collega un account autorizzato per ricevere recensioni e pubblicare risposte
              approvate.
            </p>
            <div className="connection-status">
              <i />
              Ambiente demo connesso
            </div>
          </div>
          <button type="button" className="secondary-button">
            Gestisci connessione
          </button>
        </section>
        <section className="panel setting-card">
          <div className="setting-icon">
            <Icon name="shield" />
          </div>
          <div>
            <span className="eyebrow">Sicurezza</span>
            <h2>Accesso e MFA</h2>
            <p>
              Owner e Approver devono completare il secondo fattore prima delle azioni sensibili.
            </p>
            <div className="connection-status">
              <i />
              MFA attiva
            </div>
          </div>
          <button type="button" className="secondary-button">
            Gestisci team
          </button>
        </section>
        <section className="panel setting-card">
          <div className="setting-icon ai">AI</div>
          <div>
            <span className="eyebrow">Modello</span>
            <h2>DeepSeek V4 Pro 0813</h2>
            <p>
              Snapshot bloccato tramite OpenRouter, ZDR richiesto e fallback limitato ai provider
              approvati.
            </p>
            <div className="connection-status">
              <i />
              Prompt logging disattivato
            </div>
          </div>
          <button type="button" className="secondary-button">
            Verifica provider
          </button>
        </section>
      </div>
    </div>
  );
}
