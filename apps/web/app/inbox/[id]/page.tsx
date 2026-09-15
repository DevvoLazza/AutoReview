import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { ReviewWorkbench } from "@/components/review-workbench";
import { demoReviews } from "@/lib/demo-data";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = demoReviews.find((item) => item.id === id);
  if (!review) notFound();
  return (
    <div className="page-wrap">
      <header className="detail-header">
        <Link href="/#inbox" className="back-link">
          ← Torna alle recensioni
        </Link>
        <div>
          <div>
            <span className="eyebrow">Revisione assistita</span>
            <h1>Controlla prima di pubblicare</h1>
          </div>
          <div className="safety-copy">
            <Icon name="shield" />
            <span>Il modello non può pubblicare direttamente</span>
          </div>
        </div>
      </header>
      <ReviewWorkbench initial={review} />
    </div>
  );
}
