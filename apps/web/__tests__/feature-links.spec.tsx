import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FeatureCards from "../components/feature-cards";

describe("homepage feature journeys", () => {
  it("links every feature card to its detailed public page", () => {
    const html = renderToStaticMarkup(createElement(FeatureCards));

    expect(html).toContain('href="/features/attendance"');
    expect(html).toContain('href="/features/teams-scheduling"');
    expect(html).toContain('href="/features/family-communication"');
    expect(html).toContain('href="/features/safeguarding"');
    expect(html).toContain('href="/features/reporting"');
  });
});
