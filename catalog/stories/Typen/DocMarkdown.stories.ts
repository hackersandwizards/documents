import DocMarkdown from "../../../components/DocMarkdown.astro";
import { deliveryBriefingHtml, proseHtml, trainerBriefingHtml } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocMarkdown };

export const DeliveryBriefing = onSheet({
  title: "Delivery Briefing: Musterwerk Training",
  kind: "Delivery Briefing",
  html: deliveryBriefingHtml,
});
export const TrainerBriefing = onSheet({
  title: "Trainer Briefing — Musterwerk AG",
  lang: "en",
  kind: "Trainer Briefing",
  meta: ["November 2, 2026"],
  html: trainerBriefingHtml,
});
export const Dokument = onSheet({
  title: "Probelauf und Ergebnis",
  kind: "Interne Notiz",
  legal: true,
  html: proseHtml,
});
