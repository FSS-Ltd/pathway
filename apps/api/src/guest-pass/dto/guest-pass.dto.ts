import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class GuestChildDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  /** ISO date string YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @ValidateIf((o) => o.dateOfBirth != null && o.dateOfBirth !== "")
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Date of birth must be in YYYY-MM-DD format",
  })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalNeedsNotes?: string;
}

export class GuestGuardianDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationshipToChild?: string;
}

/** Staff/kiosk quick-add: consent is confirmed in person, no signed form step. */
export class CreateGuestPassDto {
  @ValidateNested()
  @Type(() => GuestChildDto)
  child!: GuestChildDto;

  @ValidateNested()
  @Type(() => GuestGuardianDto)
  guardian!: GuestGuardianDto;

  @IsBoolean()
  consentConfirmed!: boolean;
}

/** Self-serve: reuses the site's existing public signup token. */
export class PublicGuestPassSubmitDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @ValidateNested()
  @Type(() => GuestChildDto)
  child!: GuestChildDto;

  @ValidateNested()
  @Type(() => GuestGuardianDto)
  guardian!: GuestGuardianDto;

  @IsBoolean()
  dataProcessingConsent!: boolean;
}
