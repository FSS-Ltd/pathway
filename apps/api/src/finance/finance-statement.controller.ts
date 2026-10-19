import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import {
  financeIdempotencyKey,
  financeRequestActor,
  parseFinanceInput,
} from "./finance-controller-support";
import {
  financeStatementIdSchema,
  financeStatementListQuerySchema,
  financeStatementMonthSchema,
  financePayerStatementRequestSchema,
  financeStatementRequestSchema,
} from "./dto/finance-statement.dto";
import { FinanceStatementService } from "./finance-statement.service";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceStatementController {
  constructor(
    @Inject(FinanceStatementService)
    private readonly statements: FinanceStatementService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("statements")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.statements.read",
  })
  listForStaff(@Query() query: unknown) {
    return this.statements.listForStaff(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeStatementListQuerySchema, query),
    );
  }

  @Post("statements")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.statements.read",
  })
  requestForStaff(
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.statements.requestForStaff(
      financeRequestActor(this.requestContext),
      financeIdempotencyKey(key),
      parseFinanceInput(financeStatementRequestSchema, body),
    );
  }

  @Post("statements/month-end/:month")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.statements.read",
  })
  generateMonthEnd(@Param("month") month: string) {
    return this.statements.generateMonthEnd(
      financeRequestActor(this.requestContext),
      parseFinanceInput(financeStatementMonthSchema, month),
    );
  }

  @Get("statements/:statementId")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "READ_RECORDS",
    permission: "finance.statements.read",
  })
  getForStaff(@Param("statementId", ParseUUIDPipe) statementId: string) {
    parseFinanceInput(financeStatementIdSchema, statementId);
    return this.statements.getForStaff(
      financeRequestActor(this.requestContext),
      statementId,
    );
  }

  @Get("statements/:statementId/download")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.statements.read",
  })
  async downloadForStaff(
    @Param("statementId", ParseUUIDPipe) statementId: string,
  ) {
    const file = await this.statements.downloadForStaff(
      financeRequestActor(this.requestContext),
      statementId,
    );
    return statementFile(file);
  }

  @Get("payer-accounts/:payerAccountId/statements")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "READ_STATEMENTS",
    permission: "finance.family_statements.read",
  })
  listForPayer(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Query() query: unknown,
  ) {
    return this.statements.listForPayer(
      financeRequestActor(this.requestContext),
      payerAccountId,
      parseFinanceInput(
        financeStatementListQuerySchema.omit({ payerAccountId: true }),
        query,
      ),
    );
  }

  @Post("payer-accounts/:payerAccountId/statements")
  @HttpCode(HttpStatus.CREATED)
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "READ_STATEMENTS",
    permission: "finance.family_statements.read",
  })
  requestForPayer(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
  ) {
    const input = parseFinanceInput(financePayerStatementRequestSchema, body);
    return this.statements.requestForPayer(
      financeRequestActor(this.requestContext),
      payerAccountId,
      financeIdempotencyKey(key),
      input,
    );
  }

  @Get("payer-accounts/:payerAccountId/statements/:statementId")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "READ_STATEMENTS",
    permission: "finance.family_statements.read",
  })
  getForPayer(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("statementId", ParseUUIDPipe) statementId: string,
  ) {
    return this.statements.getForPayer(
      financeRequestActor(this.requestContext),
      payerAccountId,
      statementId,
    );
  }

  @Get("payer-accounts/:payerAccountId/statements/:statementId/download")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.family_statements.read",
  })
  async downloadForPayer(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("statementId", ParseUUIDPipe) statementId: string,
  ) {
    const file = await this.statements.downloadForPayer(
      financeRequestActor(this.requestContext),
      payerAccountId,
      statementId,
    );
    return statementFile(file);
  }
}

function statementFile(file: {
  bytes: Buffer;
  fileName: string;
}): StreamableFile {
  return new StreamableFile(file.bytes, {
    type: "application/pdf",
    disposition: `attachment; filename="${file.fileName}"`,
    length: file.bytes.byteLength,
  });
}
