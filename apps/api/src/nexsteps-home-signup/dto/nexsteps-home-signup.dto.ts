import { IsEmail, MaxLength, MinLength } from "class-validator";

export class NexstepsHomeSignupDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
