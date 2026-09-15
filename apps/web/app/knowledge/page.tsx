import { Icon } from "@/components/icons";
import { demoKnowledge } from "@/lib/demo-data";

export default function KnowledgePage() {
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Memoria controllata</span>
          <h1>Conoscenza aziendale</h1>
          <p>Solo le fonti approvate possono guidare le risposte pubbliche.</p>
        </div>
        <button type="button" className="primary-button">
          + Nuova fonte
        </button>
      </header>
      <section className="knowledge-hero">
        <div>
          <Icon name="brain" />
          <span>94%</span>
          <small>Copertura stimata</small>
        </div>
        <div>
          <h2>Una memoria verificabile, non una chat infinita</h2>
          <p>
            Ogni informazione ha versione, autore, validità e stato. Le correzioni suggeriscono
            miglioramenti, ma non modificano mai le regole senza approvazione.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Fonti</span>
            <h2>Contenuti approvati</h2>
          </div>
          <button type="button" className="ghost-button">
            Carica documento
          </button>
        </div>
        <div className="knowledge-grid">
          {demoKnowledge.map((entry) => (
            <article className="knowledge-card" key={entry.id}>
              <div>
                <span className={`kind kind-${entry.kind}`}>{entry.kind.replace("_", " ")}</span>
                <span className="approved-dot">Approvata</span>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.content}</p>
              <footer>
                <span>Versione {entry.version}</span>
                <button type="button">Apri →</button>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
