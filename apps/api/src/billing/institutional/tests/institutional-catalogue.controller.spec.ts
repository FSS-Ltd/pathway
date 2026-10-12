import { BadRequestException } from "@nestjs/common";
import { InstitutionalCatalogueController } from "../institutional-catalogue.controller";

describe("public institutional estimate", () => {
  const controller = new InstitutionalCatalogueController();

  it("lists the three monthly plans without enabling checkout", () => {
    const catalogue = controller.catalogue();
    expect(catalogue.plans).toHaveLength(3);
    expect(catalogue.plans.every((plan) => !plan.checkoutEnabled)).toBe(true);
  });

  it("prices zero and the 250 boundary in integer pence", () => {
    expect(
      controller.estimate({
        planCode: "INSTITUTIONAL_STARTER_MONTHLY",
        enrolledChildren: 0,
      }),
    ).toMatchObject({ kind: "priced", subtotalPence: 4900 });
    expect(
      controller.estimate({
        planCode: "INSTITUTIONAL_STARTER_MONTHLY",
        enrolledChildren: 250,
      }),
    ).toMatchObject({ kind: "priced", subtotalPence: 23650 });
    expect(
      controller.estimate({
        planCode: "INSTITUTIONAL_STARTER_MONTHLY",
        enrolledChildren: 251,
      }),
    ).toMatchObject({ kind: "contact_sales", reason: "OVER_250_CHILDREN" });
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid count %p",
    (enrolledChildren) => {
      expect(() =>
        controller.estimate({
          planCode: "INSTITUTIONAL_STARTER_MONTHLY",
          enrolledChildren,
        }),
      ).toThrow(BadRequestException);
    },
  );
});
