import { Icon } from "@/components/icons";
import { Inbox } from "@/components/inbox";

export default function DashboardPage() {
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Mercoledì, 16 settembre</span>
          <h1>Buongiorno, Demo</h1>
          <p>Hai 3 recensioni che richiedono attenzione.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="icon-button" aria-label="Notifiche">
            ●
          </button>
          <button type="button" className="primary-button">
            + Aggiungi sede
          </button>
        </div>
      </header>
      <section className="metrics-grid">
        <article className="metric-card accent">
          <div className="metric-icon">
            <Icon name="inbox" />
          </div>
          <div>
            <span>Da approvare</span>
            <strong>3</strong>
            <small>
              <b>+2</b> da ieri
            </small>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon green">
            <Icon name="check" />
          </div>
          <div>
            <span>Pubblicate</span>
            <strong>42</strong>
            <small>ultimi 30 giorni</small>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon amber">
            <Icon name="clock" />
          </div>
          <div>
            <span>Tempo medio</span>
            <strong>
              12<span> min</span>
            </strong>
            <small>
              <b>−18%</b> questo mese
            </small>
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-icon blue">
            <Icon name="shield" />
          </div>
          <div>
            <span>Copertura memoria</span>
            <strong>
              94<span>%</span>
            </strong>
            <small>2 fonti da rivedere</small>
          </div>
        </article>
      </section>
      <div className="overview-grid">
        <Inbox />
        <aside className="right-rail">
          <section className="panel health-card">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Sistema</span>
                <h2>Stato operativo</h2>
              </div>
              <span className="all-good">Tutto ok</span>
            </div>
            <ul className="health-list">
              <li>
                <span className="service-logo google">G</span>
                <div>
                  <strong>Google Business</strong>
                  <small>Connesso · sincronizzato 2m fa</small>
                </div>
                <i />
              </li>
              <li>
                <span className="service-logo ai">AI</span>
                <div>
                  <strong>OpenRouter</strong>
                  <small>ZDR · modello bloccato</small>
                </div>
                <i />
              </li>
              <li>
                <span className="service-logo memory">
                  <Icon name="brain" />
                </span>
                <div>
                  <strong>Memoria aziendale</strong>
                  <small>14 fonti approvate</small>
                </div>
                <i />
              </li>
            </ul>
          </section>
          <section className="panel calibration-card">
            <span className="eyebrow">Automazione protetta</span>
            <h2>Calibrazione sede</h2>
            <div className="calibration-ring">
              <strong>14</strong>
              <span>/ 20</span>
            </div>
            <p>Mancano 6 approvazioni manuali prima di poter attivare l’auto-invio.</p>
            <div className="progress">
              <i style={{ width: "70%" }} />
            </div>
            <small>Le regole restano disattivate fino al completamento.</small>
          </section>
        </aside>
      </div>
    </div>
  );
}
