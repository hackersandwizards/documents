import type { APIRoute } from "astro";
import { composeSurveyReadout } from "../../../../scripts/survey-readout";
import { surveyReadout } from "../../../../scripts/samples";
import { brandHref, NOINDEX } from "../../../brand";

export const GET: APIRoute = () =>
  new Response(
    composeSurveyReadout(surveyReadout, brandHref).replace("</head>", `${NOINDEX}</head>`),
  );
