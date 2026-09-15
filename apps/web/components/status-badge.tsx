import type { ReviewWorkflowStatus } from "@reviewguard/contracts";
import { Icon } from "./icons";

const labels: Record<ReviewWorkflowStatus, string> = {
  received: "Da generare",
  generating: "Generazione",
  pending_approval: "Da approvare",
  scheduled_auto: "Programmato",
  publishing: "Invio",
  published: "Pubblicata",
  rejected: "Rifiutata",
  needs_attention: "Attenzione",
};

export function StatusBadge({ status }: { status: ReviewWorkflowStatus }) {
  const icon =
    status === "published"
      ? "check"
      : status === "scheduled_auto"
        ? "clock"
        : status === "needs_attention"
          ? "alert"
          : "clock";
  return (
    <span className={`status status-${status}`}>
      <Icon name={icon} />
      {labels[status]}
    </span>
  );
}
