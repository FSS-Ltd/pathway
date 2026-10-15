import { z } from "zod";
import { financeIdempotencyKeySchema } from "./finance-invoice.dto";

const creditLineSchema = z
  .object({
    sourceInvoiceLineId: z.string().uuid(),
    quantity: z
      .string()
      .regex(
        /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/,
        "Use up to three decimal places",
      ),
  })
  .strict();

export const financeCreditNoteDraftSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    lines: z.array(creditLineSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.lines.map(
      ({ sourceInvoiceLineId }) => sourceInvoiceLineId,
    );
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each invoice line can appear only once",
        path: ["lines"],
      });
    }
  });

export const financeCreditNoteListQuerySchema = z
  .object({
    status: z.enum(["DRAFT", "IN_REVIEW", "ISSUED", "VOID"]).optional(),
    invoiceId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const financeCreditNoteIdSchema = z.string().uuid();

export const financeCreditNoteVoidSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export { financeIdempotencyKeySchema };
export type FinanceCreditNoteDraftInput = z.infer<
  typeof financeCreditNoteDraftSchema
>;
export type FinanceCreditNoteListQuery = z.infer<
  typeof financeCreditNoteListQuerySchema
>;
