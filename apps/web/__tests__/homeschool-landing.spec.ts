import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { metadata } from "../app/(marketing)/homeschool/page";
import { homeschoolStructuredData } from "../lib/homeschool-seo";
import { buildStaticSitemap, SITE_ORIGIN } from "../lib/seo";

const webRoot = path.join(__dirname, "..");

function readSource(...segments: string[]): string {
  const filePath = path.join(webRoot, ...segments);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

describe("NexSteps Home landing page", () => {
  it("publishes complete search and answer-engine metadata", () => {
    const schemaTypes = JSON.stringify(homeschoolStructuredData);

    expect(metadata.title).toBe(
      "NexSteps Home: Home Education Planning and Records",
    );
    expect(metadata.alternates).toEqual({
      canonical: `${SITE_ORIGIN}/homeschool`,
    });
    expect(schemaTypes).toContain('"SoftwareApplication"');
    expect(schemaTypes).toContain('"FAQPage"');
    expect(schemaTypes).toContain("What is NexSteps Home?");
  });

  it("uses the five approved product screens", () => {
    const content = readSource(
      "components",
      "homeschool",
      "homeschool-content.ts",
    );

    expect(content).toContain("week-home.png");
    expect(content).toContain("today.png");
    expect(content).toContain("progress-overview.png");
    expect(content).toContain("community-home.png");
    expect(content).toContain("regulations-overview.png");
  });

  it("collects the approved fields through a dedicated lead endpoint", () => {
    const client = readSource("lib", "leads-client.ts");
    const form = readSource("components", "homeschool", "waitlist-form.tsx");

    expect(client).toContain("/leads/homeschool");
    expect(form).toContain('name="firstName"');
    expect(form).toContain('name="email"');
    expect(form).toContain('name="region"');
    expect(form).toContain('name="stage"');
    expect(form).toContain('name="consentMarketing"');
    expect(form).not.toMatch(/child(name|age|date)/i);
  });

  it("links the route from navigation, footer, and sitemap", () => {
    const header = readSource("components", "header-nav.tsx");
    const footer = readSource("components", "footer.tsx");
    const sitemap = buildStaticSitemap();

    expect(header).toContain('{ label: "Homeschool", href: "/homeschool" }');
    expect(footer).toContain('{ label: "Homeschool", href: "/homeschool" }');
    expect(sitemap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: `${SITE_ORIGIN}/homeschool` }),
      ]),
    );
  });

  it("keeps split-screen layouts for wide viewports where copy and imagery do not collide", () => {
    const landing = readSource(
      "components",
      "homeschool",
      "homeschool-landing-page.tsx",
    );
    const reveal = readSource("components", "homeschool", "product-reveal.tsx");

    expect(landing).toContain("xl:grid-cols-[1.02fr_0.98fr]");
    expect(landing).toContain("sm:min-h-[60rem]");
    expect(landing).toContain("xl:grid-cols-[0.9fr_1.1fr]");
    expect(reveal).toContain("xl:grid-cols-[0.85fr_1.15fr]");
  });
});
