import DocAgreement from "../../../components/DocAgreement.astro";
import { agreementNda, agreementOrder } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocAgreement };

export const Geheimhaltung = onSheet(agreementNda, { pages: 2 });
export const Auftragsbestaetigung = onSheet(agreementOrder);
