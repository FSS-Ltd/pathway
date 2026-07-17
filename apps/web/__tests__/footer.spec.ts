import { readFileSync } from "node:fs";
import path from "node:path";

describe("Footer", () => {
  it("imports and renders the app version", () => {
    const source = readFileSync(
      path.join(__dirname, "../components/footer.tsx"),
      "utf8",
    );

    expect(source).toContain('from "@pathway/util"');
    expect(source).toContain("APP_VERSION");
  });
});
