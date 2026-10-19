import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { PermissionGuard } from "../access-control/permission.guard";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { FinanceAccessGuard } from "./access/finance-access.guard";
import { RequireFinanceAccess } from "./access/finance-access.decorator";
import { financeRequestActor } from "./finance-controller-support";
import { FinanceDocumentService } from "./finance-document.service";

@Controller("finance")
@UseGuards(AuthUserGuard, FinanceAccessGuard, PermissionGuard)
export class FinanceDocumentController {
  constructor(
    @Inject(FinanceDocumentService)
    private readonly documents: FinanceDocumentService,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  @Get("invoices/:invoiceId/document")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.invoices.read",
  })
  async invoiceForStaff(@Param("invoiceId", ParseUUIDPipe) invoiceId: string) {
    return pdfFile(
      await this.documents.invoiceForStaff(
        financeRequestActor(this.requestContext),
        invoiceId,
      ),
    );
  }

  @Get("payer-accounts/:payerAccountId/invoices/:invoiceId/document")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.family_invoices.read",
  })
  async invoiceForPayer(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("invoiceId", ParseUUIDPipe) invoiceId: string,
  ) {
    return pdfFile(
      await this.documents.invoiceForPayer(
        financeRequestActor(this.requestContext),
        payerAccountId,
        invoiceId,
      ),
    );
  }

  @Get("credit-notes/:creditNoteId/document")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.invoices.read",
  })
  async creditForStaff(
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
  ) {
    return pdfFile(
      await this.documents.creditForStaff(
        financeRequestActor(this.requestContext),
        creditNoteId,
      ),
    );
  }

  @Get("payer-accounts/:payerAccountId/credit-notes/:creditNoteId/document")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.family_invoices.read",
  })
  async creditForPayer(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("creditNoteId", ParseUUIDPipe) creditNoteId: string,
  ) {
    return pdfFile(
      await this.documents.creditForPayer(
        financeRequestActor(this.requestContext),
        payerAccountId,
        creditNoteId,
      ),
    );
  }

  @Get("receipts/:receiptId/document")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "staff",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.payments.read",
  })
  async receiptForStaff(@Param("receiptId", ParseUUIDPipe) receiptId: string) {
    return pdfFile(
      await this.documents.receiptForStaff(
        financeRequestActor(this.requestContext),
        receiptId,
      ),
    );
  }

  @Get("payer-accounts/:payerAccountId/receipts/:receiptId/document")
  @Header("Cache-Control", "private, no-store")
  @RequireFinanceAccess({
    kind: "payer",
    accountParam: "payerAccountId",
    action: "DOWNLOAD_DOCUMENT",
    permission: "finance.family_statements.read",
  })
  async receiptForPayer(
    @Param("payerAccountId", ParseUUIDPipe) payerAccountId: string,
    @Param("receiptId", ParseUUIDPipe) receiptId: string,
  ) {
    return pdfFile(
      await this.documents.receiptForPayer(
        financeRequestActor(this.requestContext),
        payerAccountId,
        receiptId,
      ),
    );
  }
}

function pdfFile(file: { bytes: Buffer; fileName: string }): StreamableFile {
  return new StreamableFile(file.bytes, {
    type: "application/pdf",
    disposition: `attachment; filename="${file.fileName}"`,
    length: file.bytes.byteLength,
  });
}
