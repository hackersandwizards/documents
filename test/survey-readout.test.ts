import { expect, test } from "bun:test";
import { surveyReadout } from "../scripts/samples";
import { composeSurveyReadout } from "../scripts/survey-readout";

test("a mark colour cannot open an attribute", () => {
  const weak = surveyReadout.readout.weak;
  const html = composeSurveyReadout({
    ...surveyReadout,
    readout: { ...surveyReadout.readout, weakColors: weak.map(() => 'red" onmouseover="x') },
  });
  expect(html).not.toContain('" onmouseover=');
  expect(html).toContain("--mark:red&quot; onmouseover=&quot;x");
});
