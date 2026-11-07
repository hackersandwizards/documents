import DocProposal from "../../../components/DocProposal.astro";
import { proposalDe, proposalDeNoPrice, proposalEn } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocProposal };

export const Angebot = onSheet(proposalDe, { pages: 3 });
export const Quote = onSheet(proposalEn, { pages: 2 });
export const Angebot_ohne_Preise = onSheet(proposalDeNoPrice, { pages: 3 });
