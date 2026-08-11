import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { SELF_DECLARED_DEPS_METADATA } from "@nestjs/common/constants";
import { CommonModule } from "../../common/common.module";
import { OutboxService } from "../../common/outbox/outbox.service";
import { AceSettingsService } from "../ace-settings.service";

describe("AceSettingsService provider wiring", () => {
  it("resolves through CommonModule's exported OutboxService provider", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      providers: [AceSettingsService],
    }).compile();

    try {
      expect(
        Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, AceSettingsService),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ index: 0, param: OutboxService }),
        ]),
      );
      expect(moduleRef.get(AceSettingsService)).toBeInstanceOf(AceSettingsService);
      expect(moduleRef.get(OutboxService)).toBeInstanceOf(OutboxService);
    } finally {
      await moduleRef.close();
    }
  });
});
