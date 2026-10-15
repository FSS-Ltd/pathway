import { IsUUID } from "class-validator";

export class CreateFinancePayerGrantDto {
  @IsUUID()
  payerUserId!: string;
}
