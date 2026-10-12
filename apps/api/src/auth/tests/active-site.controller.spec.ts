import "reflect-metadata";
import { SELF_DECLARED_DEPS_METADATA } from "@nestjs/common/constants";
import { ActiveSiteController } from "../active-site.controller";
import { UserRolesService } from "../user-roles.service";

type DeclaredDependency = {
  index: number;
  param: unknown;
};

describe("ActiveSiteController", () => {
  it("declares UserRolesService as an explicit constructor dependency", () => {
    const dependencies = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      ActiveSiteController,
    ) as DeclaredDependency[] | undefined;

    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          param: UserRolesService,
        }),
      ]),
    );
  });
});
