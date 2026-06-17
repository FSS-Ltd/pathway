import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class LinkChildDto {
  @IsUUID()
  childId!: string;
}

export class ChildToCreateDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @ValidateIf((o) => o.dateOfBirth != null && o.dateOfBirth !== "")
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsBoolean()
  @IsOptional()
  photoConsent?: boolean;

  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  photoContentType?: string;
}

export class LinkChildrenExistingUserDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  inviteToken!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LinkChildDto)
  @IsOptional()
  children?: LinkChildDto[];

  /** When provided, create these children first then link (for existing-user form flow). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildToCreateDto)
  @IsOptional()
  childrenToCreate?: ChildToCreateDto[];
}
