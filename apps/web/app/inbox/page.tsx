import { Inbox } from "@/components/inbox";
export default function InboxPage() {
  return (
    <div className="page-wrap">
      <header className="topbar">
        <div>
          <span className="eyebrow">Centro approvazioni</span>
          <h1>Recensioni</h1>
          <p>Apri una recensione per generare, modificare e approvare la risposta.</p>
        </div>
      </header>
      <Inbox />
    </div>
  );
}
