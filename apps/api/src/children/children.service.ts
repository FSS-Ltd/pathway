import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Inject,
  Optional,
} from "@nestjs/common";
import { prisma, runTransaction, SiteRole } from "@pathway/db";
import { CreateChildDto } from "./dto/create-child.dto";
import { UpdateChildDto } from "./dto/update-child.dto";
import { InvitesService } from "../invites/invites.service";
import { getPlanDefinition } from "../billing/billing-plans";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { childPhotoKey } from "../common/storage/storage-key.util";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Common selection used by handlers
const childSelect = {
  id: true,
  firstName: true,
  lastName: true,
  photoKey: true,
  allergies: true,
  disabilities: true,
  tenantId: true,
  groupId: true,
  createdAt: true,
  updatedAt: true,
  preferredName: true,
  photoConsent: true,
  yearGroup: true,
  group: {
    select: { id: true, name: true },
  },
  guardians: {
    select: { id: true },
  },
  guardianContacts: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      relationshipToChild: true,
      contactType: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

@Injectable()
export class ChildrenService {
  constructor(
    @Inject(InvitesService) private readonly invitesService: InvitesService,
    @Optional()
    @Inject(SupabaseStorageService)
    storage?: SupabaseStorageService,
  ) {
    this.storage = storage ?? new SupabaseStorageService();
  }

  private readonly storage: SupabaseStorageService;

  async list(tenantId: string) {
    return prisma.child.findMany({
      where: { tenantId },
      select: childSelect,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }

  async getById(id: string, tenantId: string) {
    const child = await prisma.child.findFirst({
      where: { id, tenantId },
      select: childSelect,
    });
    if (!child) throw new NotFoundException("Child not found");
    return child;
  }

  /**
   * Returns the internal child profile photo used for attendance identification.
   * Organisation photo/video consent is tracked separately and does not gate this
   * private profile image.
   */
  async getPhoto(
    id: string,
    tenantId: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const child = await prisma.child.findFirst({
      where: { id, tenantId },
      select: {
        photoBytes: true,
        photoContentType: true,
        photoKey: true,
      },
    });
    if (!child) return null;
    if (child.photoKey) {
      const buffer = await this.storage.downloadObject(
        process.env.SUPABASE_STORAGE_PRIVATE_BUCKET ?? "",
        child.photoKey,
      );
      if (buffer) {
        return {
          buffer,
          contentType: child.photoContentType ?? "image/jpeg",
        };
      }
    }
    if (child.photoBytes && child.photoBytes.length > 0) {
      const buffer =
        child.photoBytes instanceof Buffer
          ? child.photoBytes
          : Buffer.from(child.photoBytes);
      const contentType = child.photoContentType ?? "image/jpeg";
      return { buffer, contentType };
    }
    return null;
  }

  /**
   * Create a child within a tenant and optionally link to a group and guardians (parents).
   * Guardrails:
   *  - tenantId must exist
   *  - if groupId provided, it must belong to the same tenant
   *  - all guardianIds must belong to the same tenant
   */
  async create(input: CreateChildDto, tenantId: string) {
    const resolvedTenantId = tenantId ?? input.tenantId;
    if (!resolvedTenantId) throw new BadRequestException("tenantId required");

    // Basic normalization (trim names)
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();

    // 1) Ensure tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: resolvedTenantId },
      select: { id: true, orgId: true },
    });
    if (!tenant) throw new BadRequestException("tenant not found");

    const maxChildrenCap = await this.resolveMaxChildrenCap(tenant.orgId);
    if (maxChildrenCap !== null) {
      const currentChildrenCount = await prisma.child.count({
        where: { tenant: { orgId: tenant.orgId } },
      });
      if (currentChildrenCount >= maxChildrenCap) {
        throw new BadRequestException(
          `children cap reached (${maxChildrenCap}) for current plan`,
        );
      }
    }

    // 2) If group provided, ensure it belongs to the same tenant
    if (input.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: input.groupId },
        select: { id: true, tenantId: true },
      });
      if (!group) throw new BadRequestException("group not found");
      if (group.tenantId !== resolvedTenantId)
        throw new BadRequestException("group does not belong to tenant");
    }

    // 3) If guardians provided, ensure all belong to same tenant
    let guardiansConnect: { id: string }[] | undefined;
    if (input.guardianIds && input.guardianIds.length > 0) {
      const guardians = await prisma.user.findMany({
        where: { id: { in: input.guardianIds } },
        select: { id: true, tenantId: true },
      });
      if (guardians.length !== input.guardianIds.length) {
        throw new BadRequestException("one or more guardians not found");
      }
      const invalid = guardians.find((g) => g.tenantId !== resolvedTenantId);
      if (invalid)
        throw new BadRequestException("guardian does not belong to tenant");
      guardiansConnect = guardians.map((g) => ({ id: g.id }));
    }

    // 4) Profile photo decode (when a profile photo is supplied)
    let photoBytes: Buffer | undefined;
    let photoContentType: string | null = null;
    if (input.photoBase64?.trim()) {
      const decoded = this.decodeAndValidatePhoto(
        input.photoBase64.trim(),
        input.photoContentType?.trim(),
      );
      photoBytes = decoded.buffer;
      photoContentType = decoded.contentType;
    }

    // 5) Date of birth
    const dateOfBirth =
      input.dateOfBirth?.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth.trim())
        ? new Date(input.dateOfBirth.trim())
        : null;

    // 6) Pickup permissions -> notes when provided
    const notes = input.pickupPermissions?.trim()
      ? `Authorised collectors: ${input.pickupPermissions.trim()}`
      : undefined;

    // 7) Create with DB-byte fallback, then move to Supabase Storage when configured.
    const child = await prisma.child.create({
      data: {
        firstName,
        lastName,
        preferredName: input.preferredName?.trim() || null,
        dateOfBirth,
        allergies: input.allergies,
        additionalNeedsNotes: input.additionalNeedsNotes?.trim() || null,
        schoolName: input.schoolName?.trim() || null,
        yearGroup: input.yearGroup?.trim() || null,
        gpName: input.gpName?.trim() || null,
        gpPhone: input.gpPhone?.trim() || null,
        specialNeedsType: input.specialNeedsType?.trim() || null,
        specialNeedsOther:
          input.specialNeedsType === "other" && input.specialNeedsOther?.trim()
            ? input.specialNeedsOther.trim()
            : null,
        photoConsent: input.photoConsent ?? false,
        photoKey: input.photoKey ?? null,
        photoBytes: photoBytes ?? undefined,
        photoContentType: photoContentType ?? undefined,
        notes,
        disabilities: input.disabilities ?? [],
        tenant: { connect: { id: resolvedTenantId } },
        ...(input.groupId ? { group: { connect: { id: input.groupId } } } : {}),
        ...(guardiansConnect
          ? { guardians: { connect: guardiansConnect } }
          : {}),
      },
      select: childSelect,
    });

    if (photoBytes && this.storage.isConfigured()) {
      const stored = await this.storage.uploadObject({
        bucket: "private",
        key: childPhotoKey(
          resolvedTenantId,
          child.id,
          photoContentType ?? "image/jpeg",
        ),
        body: photoBytes,
        contentType: photoContentType ?? "image/jpeg",
      });
      if (stored) {
        return prisma.child.update({
          where: { id: child.id },
          data: {
            photoKey: stored.key,
            photoBytes: null,
            photoContentType: photoContentType ?? "image/jpeg",
          },
          select: childSelect,
        });
      }
    }

    return child;
  }

  private async resolveMaxChildrenCap(orgId: string): Promise<number | null> {
    const [latestSnapshot, latestSubscription] = await Promise.all([
      prisma.orgEntitlementSnapshot.findFirst({
        where: { orgId },
        orderBy: [{ createdAt: "desc" }],
        select: { flagsJson: true },
      }),
      prisma.subscription.findFirst({
        where: { orgId },
        orderBy: [{ periodEnd: "desc" }],
        select: { planCode: true },
      }),
    ]);

    const flags = toRecord(latestSnapshot?.flagsJson);
    const capFromSnapshot = numberOrNull(flags?.maxChildrenIncluded);
    if (capFromSnapshot !== null) return capFromSnapshot;

    const planDefinition = getPlanDefinition(latestSubscription?.planCode);
    return planDefinition?.maxChildrenIncluded ?? null;
  }

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

  /**
   * Check if user can edit child: must be site admin or a linked guardian.
   */
  async assertCanEditChild(
    childId: string,
    tenantId: string,
    userId: string,
    isSiteAdmin: boolean,
  ): Promise<void> {
    if (isSiteAdmin) return;
    const child = await prisma.child.findFirst({
      where: { id: childId, tenantId },
      select: { guardians: { select: { id: true } } },
    });
    if (!child) throw new NotFoundException("Child not found");
    const isGuardian = child.guardians.some((g) => g.id === userId);
    if (!isGuardian) {
      throw new ForbiddenException(
        "Only admins and linked parents can edit this child",
      );
    }
  }

  /**
   * Upload internal profile photo for child. Only admin or linked parent can upload.
   */
  async uploadPhoto(
    childId: string,
    tenantId: string,
    userId: string,
    isSiteAdmin: boolean,
    photoBase64: string,
    contentType?: string | null,
  ): Promise<void> {
    await this.assertCanEditChild(childId, tenantId, userId, isSiteAdmin);

    const child = await prisma.child.findFirst({
      where: { id: childId, tenantId },
      select: { id: true },
    });
    if (!child) throw new NotFoundException("Child not found");

    const { buffer, contentType: type } = this.decodeAndValidatePhoto(
      photoBase64,
      contentType,
    );
    const stored = await this.storage.uploadObject({
      bucket: "private",
      key: childPhotoKey(tenantId, childId, type),
      body: buffer,
      contentType: type,
    });

    await prisma.child.update({
      where: { id: childId },
      data: {
        photoBytes: stored ? null : buffer,
        photoContentType: type,
        photoKey: stored?.key ?? null,
      },
    });
  }

  /**
   * Assert caller can invite a parent: must be ORG_ADMIN or a linked parent of the child.
   */
  private async assertCanInviteParent(
    childId: string,
    tenantId: string,
    callerUserId: string,
    isOrgAdmin: boolean,
  ): Promise<void> {
    if (isOrgAdmin) return;
    const child = await prisma.child.findFirst({
      where: { id: childId, tenantId },
      select: { guardians: { select: { id: true } } },
    });
    if (!child) throw new NotFoundException("Child not found");
    const isLinkedParent = child.guardians.some((g) => g.id === callerUserId);
    if (!isLinkedParent) {
      throw new ForbiddenException(
        "Only org admins and linked parents can invite another parent",
      );
    }
  }

  /**
   * Invite a parent to a child. If user exists: link and grant access. If not: create, invite, link.
   * Caller must be ORG_ADMIN or a linked parent.
   */
  async inviteParentToChild(
    childId: string,
    tenantId: string,
    callerUserId: string,
    isOrgAdmin: boolean,
    email: string,
    name?: string,
  ): Promise<
    | { linked: true; parentId: string }
    | { invited: true; parentId: string }
    | { userNotFound: true }
  > {
    await this.assertCanInviteParent(
      childId,
      tenantId,
      callerUserId,
      isOrgAdmin,
    );

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException("Email is required");
    }

    const child = await prisma.child.findFirst({
      where: { id: childId, tenantId },
      select: { id: true, tenantId: true, guardians: { select: { id: true } } },
    });
    if (!child) throw new NotFoundException("Child not found");

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { orgId: true },
    });
    if (!tenant) throw new NotFoundException("Tenant not found");

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true },
    });

    if (existingUser) {
      const alreadyLinked = child.guardians.some(
        (g) => g.id === existingUser.id,
      );
      if (alreadyLinked) {
        return { linked: true, parentId: existingUser.id };
      }

      await runTransaction(async (tx) => {
        await tx.user.update({
          where: { id: existingUser.id },
          data: { hasFamilyAccess: true },
        });
        await tx.siteMembership.upsert({
          where: {
            tenantId_userId: { tenantId, userId: existingUser.id },
          },
          create: {
            tenantId,
            userId: existingUser.id,
            role: SiteRole.VIEWER,
          },
          update: {},
        });
        await tx.child.update({
          where: { id: childId },
          data: {
            guardians: { connect: { id: existingUser.id } },
          },
        });
      });
      return { linked: true, parentId: existingUser.id };
    }

    await this.invitesService.createInvite(tenant.orgId, callerUserId, {
      email: normalizedEmail,
      name: name || undefined,
      siteAccess: {
        mode: "ALL_SITES",
        role: SiteRole.VIEWER,
      },
    });

    const newUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true },
    });
    if (!newUser) {
      return { userNotFound: true };
    }

    await runTransaction(async (tx) => {
      await tx.user.update({
        where: { id: newUser.id },
        data: { hasFamilyAccess: true },
      });
      await tx.child.update({
        where: { id: childId },
        data: {
          guardians: { connect: { id: newUser.id } },
        },
      });
    });
    return { invited: true, parentId: newUser.id };
  }

  /**
   * Link an existing parent (user with family access) to a child by email.
   * Caller must be a linked parent of the child.
   */
  async linkParentByEmail(
    childId: string,
    tenantId: string,
    callerUserId: string,
    email: string,
  ): Promise<{ linked: true; parentId: string } | { userNotFound: true }> {
    await this.assertCanEditChild(childId, tenantId, callerUserId, false);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException("Email is required");
    }

    const user = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: "insensitive" },
        hasFamilyAccess: true,
        OR: [{ tenantId }, { siteMemberships: { some: { tenantId } } }],
      },
      select: { id: true },
    });

    if (!user) {
      return { userNotFound: true };
    }

    const child = await prisma.child.findFirst({
      where: { id: childId, tenantId },
      select: { guardians: { select: { id: true } } },
    });
    if (!child) throw new NotFoundException("Child not found");
    const alreadyLinked = child.guardians.some((g) => g.id === user.id);
    if (alreadyLinked) {
      return { linked: true, parentId: user.id };
    }

    await prisma.child.update({
      where: { id: childId },
      data: {
        guardians: {
          connect: { id: user.id },
        },
      },
    });
    return { linked: true, parentId: user.id };
  }

  /**
   * Update fields; if guardianIds provided, replace the set (idempotent) after validations.
   * Only admin or linked parent can update. Parents cannot change guardianIds.
   */
  async update(
    id: string,
    input: UpdateChildDto,
    tenantId: string,
    userId?: string,
    isSiteAdmin?: boolean,
  ) {
    // Ensure child exists and capture its tenant for checks
    const current = await prisma.child.findFirst({
      where: { id, tenantId },
      select: { id: true, tenantId: true, guardians: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException("Child not found");

    // Permission: only admin or linked parent can update
    if (userId !== undefined && isSiteAdmin !== undefined) {
      await this.assertCanEditChild(id, tenantId, userId, isSiteAdmin);
      // Parents cannot change guardianIds
      if (!isSiteAdmin) {
        input = { ...input, guardianIds: undefined };
      }
    }

    // If group provided, ensure it belongs to the same tenant
    if (input.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: input.groupId },
        select: { id: true, tenantId: true },
      });
      if (!group) throw new BadRequestException("group not found");
      if (group.tenantId !== current.tenantId)
        throw new BadRequestException("group does not belong to tenant");
    }

    // If guardianIds provided, ensure all belong to same tenant and build `set`
    let guardiansSet: { id: string }[] | undefined;
    if (input.guardianIds) {
      if (input.guardianIds.length > 0) {
        const guardians = await prisma.user.findMany({
          where: { id: { in: input.guardianIds } },
          select: { id: true, tenantId: true },
        });
        if (guardians.length !== input.guardianIds.length) {
          throw new BadRequestException("one or more guardians not found");
        }
        const invalid = guardians.find((g) => g.tenantId !== current.tenantId);
        if (invalid)
          throw new BadRequestException("guardian does not belong to tenant");
        guardiansSet = guardians.map((g) => ({ id: g.id }));
      } else {
        guardiansSet = []; // explicit clear
      }
    }

    return prisma.child.update({
      where: { id },
      data: {
        ...(input.firstName ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName ? { lastName: input.lastName.trim() } : {}),
        ...(input.preferredName !== undefined
          ? { preferredName: input.preferredName }
          : {}),
        ...(input.photoKey !== undefined ? { photoKey: input.photoKey } : {}),
        ...(input.photoConsent !== undefined
          ? { photoConsent: input.photoConsent }
          : {}),
        ...(input.allergies !== undefined
          ? { allergies: input.allergies }
          : {}),
        ...(input.disabilities !== undefined
          ? { disabilities: input.disabilities }
          : {}),
        ...(input.groupId !== undefined
          ? input.groupId
            ? { group: { connect: { id: input.groupId } } }
            : { group: { disconnect: true } }
          : {}),
        ...(guardiansSet !== undefined
          ? { guardians: { set: guardiansSet } }
          : {}),
      },
      select: childSelect,
    });
  }
}

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" ? value : null;
