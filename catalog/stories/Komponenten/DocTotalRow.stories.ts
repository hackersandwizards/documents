// A total row is a table row: the story shows it closing DocPriceTable, as every type uses it.
import DocPriceTable from "../../../components/DocPriceTable.astro";
import { onSheet } from "../../sheet";

export default { component: DocPriceTable };

export const Summenzeile = onSheet({
  columns: [{ label: "Leistung" }, { label: "Betrag", num: true }],
  rows: [{ item: "Training Agentic Engineering", cells: ["X.XXX,XX €"] }],
  total: { label: "Summe netto", figure: "XX.XXX,XX €" },
});
