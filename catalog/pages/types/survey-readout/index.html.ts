import type { APIRoute } from "astro";
import { composeSurveyReadout } from "../../../../scripts/survey-readout";
import { surveyReadout } from "../../../../scripts/samples";
import { BRAND_HREF } from "../../../brand";

export const GET: APIRoute = () => new Response(composeSurveyReadout(surveyReadout, BRAND_HREF));
