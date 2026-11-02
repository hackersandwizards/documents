// The survey readout is a TypeScript module writing one standalone page of 1280x720 slides, the
// page a consumer prints: served as composeSurveyReadout writes it, the brand files linked beside it.
import type { APIRoute } from "astro";
import { composeSurveyReadout } from "../../../../scripts/survey-readout";
import { surveyReadout } from "../../../../scripts/samples";

export const GET: APIRoute = () =>
  new Response(composeSurveyReadout(surveyReadout, "../../node_modules/@hackersandwizards/brand"));
