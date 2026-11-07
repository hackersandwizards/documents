import DocCertificate from "../../../components/DocCertificate.astro";
import { certificate, certificateDe } from "../../../scripts/samples";
import { onSheet } from "../../sheet";

export default { component: DocCertificate };

export const Certificate = onSheet(certificate);
export const Zertifikat = onSheet(certificateDe);
