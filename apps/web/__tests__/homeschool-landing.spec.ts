import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.join(__dirname, "..");

function readSource(...segments: string[]): string {
  const filePath = path.join(webRoot, ...segments);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

describe("NexSteps Home landing page", () => {
  it("publishes complete search and answer-engine metadata", () => {
    const page = readSource("app", "(marketing)", "homeschool", "page.tsx");

    expect(page).toContain("Homeschool Planner App for UK Families | Nexsteps");
    expect(page).toContain("/homeschool");
    expect(page).toContain('"SoftwareApplication"');
    expect(page).toContain('"FAQPage"');
    expect(page).toContain("What is NexSteps Home?");
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
    const sitemap = readSource("app", "sitemap.ts");

    expect(header).toContain('{ label: "Homeschool", href: "/homeschool" }');
    expect(footer).toContain('{ label: "Homeschool", href: "/homeschool" }');
    expect(sitemap).toContain('url: `${baseUrl}/homeschool`');
  });
});
