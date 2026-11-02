import DocPriceTable from "../../../components/DocPriceTable.astro";
import { onSheet } from "../../sheet";

export default { component: DocPriceTable };

const columns = [{ label: "Leistung" }, { label: "Basis" }, { label: "Betrag", num: true }];

export const Preise = onSheet({
  columns,
  rows: [
    {
      item: "Training Agentic Engineering",
      detail: "Zwei Tage vor Ort",
      cells: ["2 Tage", "X.XXX,XX €"],
    },
    { item: "Vorbereitung", cells: ["Pauschal", { list: "X.XXX,XX €", offer: "XXX,XX €" }] },
  ],
  total: { label: "Summe netto", figure: "XX.XXX,XX €" },
  foot: [{ label: "zzgl. Umsatzsteuer", figure: "X.XXX,XX €" }],
});
export const Saetze = onSheet({
  columns: [{ label: "Leistung" }, { label: "Satz", num: true }],
  rows: [
    { item: "Trainingstag", cells: ["X.XXX,XX €"] },
    { item: "Beratungstag", cells: ["X.XXX,XX €"] },
  ],
  sums: true,
});
