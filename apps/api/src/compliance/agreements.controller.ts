import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { z } from "zod";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { IndependentTransaction } from "../common/database/independent-transaction.decorator";
import { AgreementsService } from "./agreements.service";
import { AgreementPublicationService } from "./agreement-publication.service";
import { AgreementAcceptanceService } from "./agreement-acceptance.service";
import {
  agreementId,
  agreementVersionInput,
  agreementPublishInput,
  agreementAssignInput,
  agreementAcknowledgeInput,
  agreementSignedInput,
  agreementPageQuery,
  agreementAssignmentsQuery,
  agreementPeopleQuery,
} from "./agreements.dto";
function parse<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  return parsed.data;
}
function attachment(file: { bytes: Buffer; fileName: string }): StreamableFile {
  const fallback = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new StreamableFile(file.bytes, {
    type: "application/pdf",
    disposition: `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
    length: file.bytes.length,
  });
}
@UseGuards(AuthUserGuard)
@IndependentTransaction()
@Controller("compliance/agreements")
export class AgreementsController {
  constructor(
    @Inject(AgreementsService) private readonly service: AgreementsService,
    @Inject(AgreementPublicationService)
    private readonly publication: AgreementPublicationService,
    @Inject(AgreementAcceptanceService)
    private readonly acceptance: AgreementAcceptanceService,
    @Inject(PathwayRequestContext)
    private readonly context: PathwayRequestContext,
  ) {}
  private actor() {
    const context = this.context.requireContext();
    return {
      tenantId: context.tenant.tenantId,
      orgId: context.org.orgId,
      userId: context.user.userId,
    };
  }
  @Get("mine")
  @Header("Cache-Control", "private, no-store")
  mine(@Query() query: unknown) {
    return this.service.assignments(
      this.actor(),
      true,
      parse(agreementPageQuery, query).cursor,
    );
  }
  @Get("documents")
  @Header("Cache-Control", "private, no-store")
  documents(@Query() query: unknown) {
    return this.service.documents(
      this.actor(),
      parse(agreementPageQuery, query).cursor,
    );
  }
  @Post("documents")
  @Header("Cache-Control", "private, no-store")
  create(@Body() body: unknown) {
    return this.publication.publish(
      this.actor(),
      parse(agreementVersionInput, body),
    );
  }
  @Get("documents/:id/versions")
  @Header("Cache-Control", "private, no-store")
  versions(@Param("id") id: string, @Query() query: unknown) {
    return this.service.versions(
      this.actor(),
      parse(agreementId, id),
      parse(agreementPageQuery, query).cursor,
    );
  }
  @Post("documents/:id/versions")
  @Header("Cache-Control", "private, no-store")
  publish(@Param("id") id: string, @Body() body: unknown) {
    const input = parse(agreementPublishInput, body);
    return this.publication.publish(this.actor(), input, {
      id: parse(agreementId, id),
      expectedVersion: input.expectedVersion,
    });
  }
  @Get("people")
  @Header("Cache-Control", "private, no-store")
  people(@Query() query: unknown) {
    const input = parse(agreementPeopleQuery, query);
    return this.service.people(this.actor(), input.query, input.cursor);
  }
  @Post("versions/:id/assign")
  @Header("Cache-Control", "private, no-store")
  assign(@Param("id") id: string, @Body() body: unknown) {
    const input = parse(agreementAssignInput, body);
    return this.publication.assign(
      this.actor(),
      parse(agreementId, id),
      input.recipientUserIds,
    );
  }
  @Get("assignments")
  @Header("Cache-Control", "private, no-store")
  assignments(@Query() query: unknown) {
    const input = parse(agreementAssignmentsQuery, query);
    return this.service.assignments(
      this.actor(),
      false,
      input.cursor,
      input.documentId,
    );
  }
  @Get("assignments/:id")
  @Header("Cache-Control", "private, no-store")
  assignment(@Param("id") id: string) {
    return this.service.assignment(this.actor(), parse(agreementId, id));
  }
  @Post("assignments/:id/acknowledge")
  @Header("Cache-Control", "private, no-store")
  acknowledge(@Param("id") id: string, @Body() body: unknown) {
    return this.acceptance.acknowledge(
      this.actor(),
      parse(agreementId, id),
      parse(agreementAcknowledgeInput, body),
    );
  }
  @Post("assignments/:id/signed-copy")
  @Header("Cache-Control", "private, no-store")
  signedCopy(@Param("id") id: string, @Body() body: unknown) {
    return this.acceptance.signedCopy(
      this.actor(),
      parse(agreementId, id),
      parse(agreementSignedInput, body),
    );
  }
  @Get("versions/:id/file")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async original(@Param("id") id: string) {
    return attachment(
      await this.service.originalFile(this.actor(), parse(agreementId, id)),
    );
  }
  @Get("assignments/:id/signed-copy")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async signed(@Param("id") id: string) {
    return attachment(
      await this.service.signedFile(this.actor(), parse(agreementId, id)),
    );
  }
}
