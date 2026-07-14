import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ChildGuardianContactType, prisma } from "@pathway/db";
import { PublicSignupService } from "../public-signup/public-signup.service";
import type {
  CreateGuestPassDto,
  GuestChildDto,
  GuestGuardianDto,
  PublicGuestPassSubmitDto,
} from "./dto/guest-pass.dto";

export const GUEST_PASS_DURATION_HOURS = 24;

export type GuestPassResult = {
  childId: string;
  guestExpiresAt: Date;
};

@Injectable()
export class GuestPassService {
  constructor(
    @Inject(PublicSignupService)
    private readonly publicSignupService: PublicSignupService,
  ) {}

  /**
   * Single write path for guest children: both the staff/kiosk quick-add and the
   * self-serve link call this, so isGuest/guestExpiresAt are only ever set here.
   */
  async createGuestChild(
    tenantId: string,
    child: GuestChildDto,
    guardian: GuestGuardianDto,
  ): Promise<GuestPassResult> {
    const now = new Date();
    const guestExpiresAt = new Date(
      now.getTime() + GUEST_PASS_DURATION_HOURS * 60 * 60 * 1000,
    );

    const dateOfBirth =
      child.dateOfBirth?.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(child.dateOfBirth.trim())
        ? new Date(child.dateOfBirth.trim())
        : null;

    const created = await prisma.child.create({
      data: {
        tenantId,
        firstName: child.firstName.trim(),
        lastName: child.lastName.trim(),
        dateOfBirth,
        allergies: child.allergies?.trim() || "unknown",
        additionalNeedsNotes: child.additionalNeedsNotes?.trim() || null,
        isGuest: true,
        guestExpiresAt,
      },
      select: { id: true },
    });

    await prisma.childGuardianContact.create({
      data: {
        childId: created.id,
        tenantId,
        fullName: guardian.fullName.trim(),
        phone: guardian.phone.trim(),
        relationshipToChild: guardian.relationshipToChild?.trim() || null,
        contactType: ChildGuardianContactType.PRIMARY_GUARDIAN,
        dataProcessingConsentAt: now,
      },
    });

    return { childId: created.id, guestExpiresAt };
  }

  async createForStaff(
    tenantId: string,
    dto: CreateGuestPassDto,
  ): Promise<GuestPassResult> {
    if (!dto.consentConfirmed) {
      throw new BadRequestException(
        "Guardian consent must be confirmed to issue a guest pass",
      );
    }
    return this.createGuestChild(tenantId, dto.child, dto.guardian);
  }

  async createForSelfServe(
    dto: PublicGuestPassSubmitDto,
  ): Promise<GuestPassResult> {
    if (!dto.dataProcessingConsent) {
      throw new BadRequestException("Data processing consent is required");
    }
    const link = await this.publicSignupService.resolveLink(dto.token);
    return this.createGuestChild(link.tenantId, dto.child, dto.guardian);
  }
}
