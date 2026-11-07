import type { APIRoute } from "astro";
import { composeSurveyReadout } from "../../../../scripts/survey-readout";
import { surveyReadout } from "../../../../scripts/samples";
import { NOINDEX } from "@hackersandwizards/scaffolding/catalog/robots.ts";
import { brandHref } from "../../../brand";

export const GET: APIRoute = () =>
  new Response(
    composeSurveyReadout(surveyReadout, brandHref).replace("</head>", `${NOINDEX}</head>`),
  );
