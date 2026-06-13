import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
  Optional,
} from "@nestjs/common";
import { createHash } from "crypto";
import { prisma, Role } from "@pathway/db";
import { MailerService } from "../mailer/mailer.service";
import { Auth0ManagementService } from "../auth/auth0-management.service";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { childPhotoKey } from "../common/storage/storage-key.util";
import type { PublicSignupConfigDto } from "./dto/public-signup-config.dto";
import type {
  PublicSignupSubmitDto,
  SubmitExistingUserDto,
  EmergencyContactDto,
} from "./dto/public-signup-submit.dto";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const FORM_VERSION = "1.0";
const REQUIRED_CONSENTS = [
  "data_processing",
  "photo_per_child",
  "emergency_contact",
];

type ResolvedLink = {
  id: string;
  tenantId: string;
  orgId: string;
  orgName: string;
  siteName: string;
  siteTimezone: string | null;
};

@Injectable()
export class PublicSignupService {
  constructor(
    @Inject(MailerService) private readonly mailerService: MailerService,
    @Optional()
    @Inject(Auth0ManagementService)
    private readonly auth0Management: Auth0ManagementService | null,
    @Optional()
    @Inject(SupabaseStorageService)
    storage?: SupabaseStorageService,
  ) {
    this.storage = storage ?? new SupabaseStorageService();
  }

  private readonly storage: SupabaseStorageService;

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Resolve and validate token; returns link context or throws.
   */
  async resolveLink(token: string): Promise<ResolvedLink> {
    const tokenHash = this.hashToken(token);
    const link = await prisma.publicSignupLink.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        tenant: { select: { name: true, timezone: true } },
        org: { select: { name: true } },
      },
    });

    if (!link) {
      throw new NotFoundException("Invalid or expired signup link");
    }

    return {
      id: link.id,
      tenantId: link.tenantId,
      orgId: link.orgId,
      orgName: link.org.name,
      siteName: link.tenant.name,
      siteTimezone: link.tenant.timezone ?? null,
    };
  }

  async getConfig(token: string): Promise<PublicSignupConfigDto> {
    const link = await this.resolveLink(token);
    return {
      orgName: link.orgName,
      siteName: link.siteName,
      siteTimezone: link.siteTimezone,
      requiredConsents: REQUIRED_CONSENTS,
      formVersion: FORM_VERSION,
    };
  }

  /**
   * Preflight check: does the email belong to an existing user?
   * Gated by valid invite token to avoid email enumeration.
   * Returns mode: EXISTING_USER (show password, stay on form) or NEW_USER (show password + confirm).
   * When user exists, returns displayName for pre-fill (prefer name if it does not look like email).
   */
  async signupPreflight(
    inviteToken: string,
    email: string,
  ): Promise<{
    email: string;
    userExists: boolean;
    mode: "EXISTING_USER" | "NEW_USER";
    displayName?: string;
  }> {
    await this.resolveLink(inviteToken);
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { id: true, name: true, displayName: true },
    });
    const userExists = !!user;
    let displayName: string | undefined;
    if (user) {
      const name = user.name?.trim();
      const disp = user.displayName?.trim();
      if (name && !name.includes("@")) {
        displayName = name;
      } else if (disp && !disp.includes("@")) {
        displayName = disp;
      } else if (name) {
        displayName = name;
      } else if (disp) {
        displayName = disp;
      }
    }
    return {
      email: normalized,
      userExists,
      mode: userExists ? "EXISTING_USER" : "NEW_USER",
      ...(displayName ? { displayName } : {}),
    };
  }

  /**
   * Link children to an authenticated existing user (staff account gaining family access).
   * Requires valid invite token. Sets hasFamilyAccess=true and upserts parent-child links (idempotent).
   * When childrenToCreate is provided, creates those children first then links.
   */
  async linkChildrenExistingUser(
    userId: string,
    inviteToken: string,
    childIds: string[],
    childrenToCreate?: Array<{
      firstName?: string;
      lastName?: string;
      preferredName?: string;
      dateOfBirth?: string;
      allergies?: string;
      photoConsent?: boolean;
    }>,
  ): Promise<{ success: true; linkedCount: number }> {
    const link = await this.resolveLink(inviteToken);
    const idsToLink = [...childIds];

    if (childrenToCreate && childrenToCreate.length > 0) {
      for (const c of childrenToCreate) {
        const firstName = (c.firstName ?? "").trim();
        const lastName = (c.lastName ?? "").trim();
        if (!firstName || !lastName) continue;
        const dateOfBirth =
          c.dateOfBirth?.trim() &&
          /^\d{4}-\d{2}-\d{2}$/.test(c.dateOfBirth.trim())
            ? new Date(c.dateOfBirth.trim())
            : null;
        const child = await prisma.child.create({
          data: {
            tenantId: link.tenantId,
            firstName,
            lastName,
            preferredName: c.preferredName?.trim() || null,
            dateOfBirth,
            allergies: (c.allergies ?? "").trim() || "none",
            photoConsent: c.photoConsent ?? false,
            guardians: { connect: { id: userId } },
          },
          select: { id: true },
        });
        idsToLink.push(child.id);
      }
    }

    if (idsToLink.length === 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { tenantId: link.tenantId, hasFamilyAccess: true },
      });
      const existingRole = await prisma.userTenantRole.findFirst({
        where: { userId, tenantId: link.tenantId, role: Role.PARENT },
      });
      if (!existingRole) {
        await prisma.userTenantRole.create({
          data: { userId, tenantId: link.tenantId, role: Role.PARENT },
        });
      }
      return { success: true, linkedCount: 0 };
    }

    const children = await prisma.child.findMany({
      where: { id: { in: idsToLink }, tenantId: link.tenantId },
      select: { id: true },
    });
    if (children.length !== idsToLink.length) {
      throw new BadRequestException(
        "one or more children not found or not in tenant",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          tenantId: link.tenantId,
          hasFamilyAccess: true,
          children: { connect: idsToLink.map((id) => ({ id })) },
        },
      });

      const existingRole = await tx.userTenantRole.findFirst({
        where: { userId, tenantId: link.tenantId, role: Role.PARENT },
      });
      if (!existingRole) {
        await tx.userTenantRole.create({
          data: { userId, tenantId: link.tenantId, role: Role.PARENT },
        });
      }
    });

    return { success: true, linkedCount: idsToLink.length };
  }

  /**
   * Submit for existing user: verify password, then link children and complete signup.
   * Keeps user on the same form - no redirect to Auth0.
   * Requires Auth0 "Password" grant type to be enabled.
   */
  async submitExistingUser(
    dto: SubmitExistingUserDto,
  ): Promise<{ success: true; message: string }> {
    const link = await this.resolveLink(dto.token);

    if (!dto.consents.dataProcessingConsent) {
      throw new BadRequestException("Data processing consent is required");
    }
    if (!dto.emergencyContacts?.length) {
      throw new BadRequestException(
        "At least one emergency contact is required",
      );
    }
    if (!dto.children?.length) {
      throw new BadRequestException("At least one child is required");
    }

    for (const child of dto.children) {
      if (
        (child.photoBase64 || child.photoContentType) &&
        !child.photoConsent
      ) {
        throw new BadRequestException(
          "Photo can only be set when photo consent is granted for that child",
        );
      }
    }

    const email = dto.parent.email.trim().toLowerCase();
    const auth0Sub = await this.auth0Management?.verifyPassword(
      email,
      dto.parent.password,
    );
    if (!auth0Sub) {
      throw new BadRequestException("Invalid email or password");
    }

    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "auth0",
          providerSubject: auth0Sub,
        },
      },
      include: { user: true },
    });
    if (!identity?.user) {
      throw new BadRequestException(
        "Account not found. Please sign in via the app first, or use a different email.",
      );
    }

    const user = identity.user;
    const fullName = dto.parent.fullName.trim();
    const safeName = fullName && !fullName.includes("@") ? fullName : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: safeName ?? user.name ?? fullName,
        displayName: safeName ?? user.displayName ?? fullName,
        tenantId: link.tenantId,
        hasFamilyAccess: true,
      },
    });

    const existingRole = await prisma.userTenantRole.findFirst({
      where: { userId: user.id, tenantId: link.tenantId, role: Role.PARENT },
    });
    if (!existingRole) {
      await prisma.userTenantRole.create({
        data: {
          userId: user.id,
          tenantId: link.tenantId,
          role: Role.PARENT,
        },
      });
    }

    const now = new Date();

    for (const c of dto.children) {
      const allergies = (c.allergies ?? "").trim() || "none";
      let photoBytes: Buffer | null = null;
      let photoContentType: string | null = null;
      if (c.photoConsent && c.photoBase64?.trim()) {
        const decoded = this.decodeAndValidatePhoto(
          c.photoBase64.trim(),
          c.photoContentType?.trim(),
        );
        photoBytes = decoded.buffer;
        photoContentType = decoded.contentType;
      }

      const dateOfBirth =
        c.dateOfBirth?.trim() &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.dateOfBirth.trim())
          ? new Date(c.dateOfBirth.trim())
          : null;

      const child = await prisma.child.create({
        data: {
          tenantId: link.tenantId,
          firstName: c.firstName.trim(),
          lastName: c.lastName.trim(),
          preferredName: c.preferredName?.trim() || null,
          dateOfBirth,
          allergies,
          additionalNeedsNotes: c.additionalNeedsNotes?.trim() || null,
          schoolName: c.schoolName?.trim() || null,
          yearGroup: c.yearGroup?.trim() || null,
          gpName: c.gpName?.trim() || null,
          gpPhone: c.gpPhone?.trim() || null,
          specialNeedsType: c.specialNeedsType?.trim() || null,
          specialNeedsOther:
            c.specialNeedsType === "other" && c.specialNeedsOther?.trim()
              ? c.specialNeedsOther.trim()
              : null,
          photoConsent: c.photoConsent,
          photoKey: null,
          photoBytes: photoBytes ?? undefined,
          photoContentType: photoContentType ?? undefined,
          groupId: c.groupId || null,
          guardians: { connect: { id: user.id } },
        },
      });
      await this.moveChildPhotoToStorage(
        child.id,
        link.tenantId,
        photoBytes,
        photoContentType,
      );
    }

    await prisma.emergencyContact.createMany({
      data: dto.emergencyContacts.map((ec: EmergencyContactDto) => ({
        userId: user.id,
        tenantId: link.tenantId,
        name: ec.name.trim(),
        phone: ec.phone.trim(),
        relationship: ec.relationship?.trim() || null,
      })),
    });

    await prisma.parentSignupConsent.create({
      data: {
        userId: user.id,
        tenantId: link.tenantId,
        dataProcessingConsentAt: now,
        firstAidConsentAt: dto.consents.firstAidConsent ? now : null,
        consentingAdultName: fullName,
        consentingAdultRelationship:
          dto.parent.relationshipToChild?.trim() || null,
      },
    });

    await prisma.publicSignupLink.update({
      where: { id: link.id },
      data: { lastUsedAt: now },
    });

    const adminUrl = process.env.ADMIN_URL || "https://app.nexsteps.dev";
    try {
      await this.mailerService.sendParentSignupCompleteEmail({
        to: email,
        parentName: fullName,
        siteName: link.siteName,
        orgName: link.orgName,
        loginUrl: `${adminUrl}/login`,
      });
    } catch {
      // Do not fail submit if email fails
    }

    return {
      success: true,
      message:
        "Registration complete. You can now sign in to access your account.",
    };
  }

  async submit(
    dto: PublicSignupSubmitDto,
  ): Promise<{ success: true; message: string }> {
    const link = await this.resolveLink(dto.token);

    if (!dto.consents.dataProcessingConsent) {
      throw new BadRequestException("Data processing consent is required");
    }
    if (!dto.emergencyContacts?.length) {
      throw new BadRequestException(
        "At least one emergency contact is required",
      );
    }
    if (!dto.children?.length) {
      throw new BadRequestException("At least one child is required");
    }

    for (const child of dto.children) {
      if (
        (child.photoBase64 || child.photoContentType) &&
        !child.photoConsent
      ) {
        throw new BadRequestException(
          "Photo can only be set when photo consent is granted for that child",
        );
      }
    }

    const email = dto.parent.email.trim().toLowerCase();
    const fullName = dto.parent.fullName.trim();
    const safeName = fullName && !fullName.includes("@") ? fullName : null;

    let user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: safeName ?? fullName,
          displayName: safeName ?? fullName,
          tenantId: link.tenantId,
          hasFamilyAccess: true,
        },
      });

      const auth0UserId = await this.auth0Management?.createUser({
        email,
        password: dto.parent.password,
        name: safeName ?? fullName,
        emailVerified: false,
      });

      if (auth0UserId) {
        await prisma.userIdentity.create({
          data: {
            userId: user.id,
            provider: "auth0",
            providerSubject: auth0UserId,
            email,
            displayName: safeName ?? fullName,
          },
        });
      }
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: safeName ?? user.name ?? fullName,
          displayName: safeName ?? user.displayName ?? fullName,
          tenantId: link.tenantId,
          hasFamilyAccess: true,
        },
      });
    }

    const existingRole = await prisma.userTenantRole.findFirst({
      where: { userId: user.id, tenantId: link.tenantId, role: Role.PARENT },
    });
    if (!existingRole) {
      await prisma.userTenantRole.create({
        data: {
          userId: user.id,
          tenantId: link.tenantId,
          role: Role.PARENT,
        },
      });
    }

    const now = new Date();
    const childIds: string[] = [];

    for (const c of dto.children) {
      const allergies = (c.allergies ?? "").trim() || "none";
      let photoBytes: Buffer | null = null;
      let photoContentType: string | null = null;
      if (c.photoConsent && c.photoBase64?.trim()) {
        const decoded = this.decodeAndValidatePhoto(
          c.photoBase64.trim(),
          c.photoContentType?.trim(),
        );
        photoBytes = decoded.buffer;
        photoContentType = decoded.contentType;
      }

      const dateOfBirth =
        c.dateOfBirth?.trim() &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.dateOfBirth.trim())
          ? new Date(c.dateOfBirth.trim())
          : null;

      const child = await prisma.child.create({
        data: {
          tenantId: link.tenantId,
          firstName: c.firstName.trim(),
          lastName: c.lastName.trim(),
          preferredName: c.preferredName?.trim() || null,
          dateOfBirth,
          allergies,
          additionalNeedsNotes: c.additionalNeedsNotes?.trim() || null,
          schoolName: c.schoolName?.trim() || null,
          yearGroup: c.yearGroup?.trim() || null,
          gpName: c.gpName?.trim() || null,
          gpPhone: c.gpPhone?.trim() || null,
          specialNeedsType: c.specialNeedsType?.trim() || null,
          specialNeedsOther:
            c.specialNeedsType === "other" && c.specialNeedsOther?.trim()
              ? c.specialNeedsOther.trim()
              : null,
          photoConsent: c.photoConsent,
          photoKey: null,
          photoBytes: photoBytes ?? undefined,
          photoContentType: photoContentType ?? undefined,
          groupId: c.groupId || null,
          guardians: { connect: { id: user.id } },
        },
      });
      await this.moveChildPhotoToStorage(
        child.id,
        link.tenantId,
        photoBytes,
        photoContentType,
      );
      childIds.push(child.id);
    }

    await prisma.emergencyContact.createMany({
      data: dto.emergencyContacts.map((ec: EmergencyContactDto) => ({
        userId: user!.id,
        tenantId: link.tenantId,
        name: ec.name.trim(),
        phone: ec.phone.trim(),
        relationship: ec.relationship?.trim() || null,
      })),
    });

    await prisma.parentSignupConsent.create({
      data: {
        userId: user.id,
        tenantId: link.tenantId,
        dataProcessingConsentAt: now,
        firstAidConsentAt: dto.consents.firstAidConsent ? now : null,
        consentingAdultName: fullName,
        consentingAdultRelationship:
          dto.parent.relationshipToChild?.trim() || null,
      },
    });

    await prisma.publicSignupLink.update({
      where: { id: link.id },
      data: { lastUsedAt: now },
    });

    const adminUrl = process.env.ADMIN_URL || "https://app.nexsteps.dev";
    try {
      await this.mailerService.sendParentSignupCompleteEmail({
        to: email,
        parentName: fullName,
        siteName: link.siteName,
        orgName: link.orgName,
        loginUrl: `${adminUrl}/login`,
      });
    } catch {
      // Do not fail submit if email fails
    }

    return {
      success: true,
      message: "Registration complete. Check your email to sign in.",
    };
  }

  /**
   * Decode base64 photo, validate size and type. Returns buffer and contentType for DB storage.
   */
  private decodeAndValidatePhoto(
    photoBase64: string,
    contentType?: string | null,
  ): { buffer: Buffer; contentType: string } {
    let data = photoBase64;
    let detectedType = contentType;
    if (data.startsWith("data:")) {
      const match = data.match(/^data:([^;]+);base64,/);
      if (match) {
        detectedType = match[1].trim().toLowerCase();
        data = data.replace(/^data:[^;]+;base64,/, "");
      }
    }
    const buffer = Buffer.from(data, "base64");
    if (buffer.length > MAX_PHOTO_BYTES) {
      throw new BadRequestException(
        `Photo must be at most ${MAX_PHOTO_BYTES / 1024 / 1024}MB`,
      );
    }
    if (buffer.length === 0) {
      throw new BadRequestException("Photo data is empty");
    }
    const type = detectedType || "image/jpeg";
    if (!ALLOWED_PHOTO_TYPES.includes(type)) {
      throw new BadRequestException(
        `Photo must be one of: ${ALLOWED_PHOTO_TYPES.join(", ")}`,
      );
    }
    return { buffer, contentType: type };
  }

  private async moveChildPhotoToStorage(
    childId: string,
    tenantId: string,
    photoBytes: Buffer | null,
    photoContentType: string | null,
  ): Promise<void> {
    if (!photoBytes) return;
    const contentType = photoContentType ?? "image/jpeg";
    const stored = await this.storage.uploadObject({
      bucket: "private",
      key: childPhotoKey(tenantId, childId, contentType),
      body: photoBytes,
      contentType,
    });
    if (!stored) return;

    await prisma.child.update({
      where: { id: childId },
      data: {
        photoKey: stored.key,
        photoBytes: null,
        photoContentType: contentType,
      },
    });
  }
}
