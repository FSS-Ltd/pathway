import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

const GP_PHONE_PATTERN = /^[\d\s+.() -]{10,25}$/;
const SPECIAL_NEEDS_TYPES = ["none", "sen_support", "ehcp", "other"] as const;
/** At least 8 chars, one letter and one number (Auth0-compatible). */
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export class ParentGuardianDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters" })
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, {
    message: "Password must include at least one letter and one number",
  })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationshipToChild?: string;
}

/**
 * Same as ParentGuardianDto but with no password - the client authenticates
 * with Auth0/Clerk separately before submitting (VerifiedPrincipalGuard on
 * the controller route resolves who this is; email comes from that
 * verified principal, not this field).
 */
export class ParentGuardianExistingUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationshipToChild?: string;
}

export class ParentGuardianContactOnlyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationshipToChild?: string;
}

export class EmergencyContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string;
}

export class ChildSignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredName?: string;

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
  @IsUUID()
  groupId?: string;

  /** Comma or newline separated, or single string; stored as trimmed list. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  allergies?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalNeedsNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  schoolName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  yearGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  gpName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  @ValidateIf((o) => o.gpPhone != null && o.gpPhone !== "")
  @Matches(GP_PHONE_PATTERN, {
    message: "Please enter a valid phone number (10-25 characters)",
  })
  gpPhone?: string;

  @IsOptional()
  @IsString()
  @IsIn(SPECIAL_NEEDS_TYPES)
  specialNeedsType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  specialNeedsOther?: string;

  @IsBoolean()
  photoConsent!: boolean;

  /** Base64-encoded internal profile picture for attendance identification. */
  @IsOptional()
  @IsString()
  photoBase64?: string;

  /** Content type of photoBase64, e.g. image/jpeg. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  photoContentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pickupPermissions?: string;
}

export class ConsentsDto {
  @IsBoolean()
  dataProcessingConsent!: boolean;

  @IsOptional()
  @IsBoolean()
  firstAidConsent?: boolean;
}

export class PublicSignupSubmitDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @ValidateNested()
  @Type(() => ParentGuardianDto)
  parent!: ParentGuardianDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts!: EmergencyContactDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildSignupDto)
  children!: ChildSignupDto[];

  @ValidateNested()
  @Type(() => ConsentsDto)
  consents!: ConsentsDto;
}

/** Submit for existing users: password rules relaxed (they already have a password). */
export class SubmitExistingUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @ValidateNested()
  @Type(() => ParentGuardianExistingUserDto)
  parent!: ParentGuardianExistingUserDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts!: EmergencyContactDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildSignupDto)
  children!: ChildSignupDto[];

  @ValidateNested()
  @Type(() => ConsentsDto)
  consents!: ConsentsDto;
}

export class PublicSignupContactOnlySubmitDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  token!: string;

  @ValidateNested()
  @Type(() => ParentGuardianContactOnlyDto)
  parent!: ParentGuardianContactOnlyDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts!: EmergencyContactDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildSignupDto)
  children!: ChildSignupDto[];

  @ValidateNested()
  @Type(() => ConsentsDto)
  consents!: ConsentsDto;
}
