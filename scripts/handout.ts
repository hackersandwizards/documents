import { brandName } from "./root";

/** Every word DocHandout prints itself, per language. Its `labels` replaces any of them but `kind`,
 *  which its `kind` prop replaces; a consumer reads `kind` here for the page's `<title>`. */
const en = {
  /** The running header's left box. */
  runningBrand: brandName().name,
  /** The document kind in the header tag. */
  kind: "Training Handout",
  recipient: "For",
  date: "Training date",
  /** Stand in for the company or the date where only the other is given. */
  noCompany: "[COMPANY]",
  noDate: "[DATE]",
  contents: "Contents",
  /** The eyebrow before each chapter's number. */
  chapter: "Chapter ",
};
export type HandoutText = typeof en;

export const HANDOUT_TEXT = {
  en,
  de: {
    ...en,
    kind: "Trainings-Handout",
    recipient: "Für",
    date: "Trainingsdatum",
    noCompany: "[FIRMA]",
    noDate: "[DATUM]",
    contents: "Inhalt",
    chapter: "Kapitel ",
  },
} satisfies Record<string, HandoutText>;
export type HandoutLang = keyof typeof HANDOUT_TEXT;
