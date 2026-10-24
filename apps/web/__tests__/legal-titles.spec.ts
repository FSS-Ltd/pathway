import { metadata as cookies } from "../app/(legal)/cookies/page";
import { metadata as privacy } from "../app/(legal)/privacy/page";
import { metadata as terms } from "../app/(legal)/terms/page";
import { metadata as userAgreement } from "../app/(legal)/user-agreement/page";

describe("legal page titles", () => {
  // The root layout's title template already appends "| Nexsteps"; repeating it
  // renders "Privacy Policy | Nexsteps | Nexsteps" in the tab and in search results.
  it.each([
    ["cookies", cookies],
    ["privacy", privacy],
    ["terms", terms],
    ["user-agreement", userAgreement],
  ])("%s does not repeat the brand suffix", (_name, metadata) => {
    expect(typeof metadata.title).toBe("string");
    expect(metadata.title as string).not.toMatch(/nexsteps/i);
  });
});
