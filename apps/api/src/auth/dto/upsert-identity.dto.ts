import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpsertIdentityDto {
  @IsString()
  provider!: string;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsString()
  name?: string;

  /** Internal User.id, when the caller already knows it (e.g. pre-created Clerk users). */
  @IsOptional()
  @IsString()
  externalId?: string;
}
