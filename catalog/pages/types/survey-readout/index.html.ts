import type { APIRoute } from "astro";
import { composeSurveyReadout } from "../../../../scripts/survey-readout";
import { surveyReadout } from "../../../../scripts/samples";

export const GET: APIRoute = () =>
  new Response(composeSurveyReadout(surveyReadout, "../../node_modules/@hackersandwizards/brand"));
