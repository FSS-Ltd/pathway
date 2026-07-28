import { createHash } from "node:crypto";
import { PrismaClient, Role, OrgRole } from "@prisma/client";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// prisma/ → db → packages → repo root
config({ path: path.resolve(__dirname, "../../../.env") });

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  console.log("Seeding PathWay suite demo data…");

  // Deterministic IDs so dev JWTs can target them
  const ORG_ID = "00000000-0000-0000-0000-000000000001";
  const TENANT_ID = "00000000-0000-0000-0000-000000000002";

  // 0) Org (billing owner / suite)
  const org = await prisma.org.upsert({
    where: { slug: "demo-org" },
    update: {},
    create: {
      id: ORG_ID,
      name: "Demo Organisation",
      slug: "demo-org",
      planCode: "trial",
      isSuite: false,
    },
  });

  // 1) First Tenant (site) under the Org
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-church" },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Demo Church",
      slug: "demo-church",
      orgId: org.id,
    },
  });

  // 2) Age Groups (Group)
  await prisma.group.createMany({
    data: [
      { name: "0-3", minAge: 0, maxAge: 3, tenantId: tenant.id },
      { name: "4-5", minAge: 4, maxAge: 5, tenantId: tenant.id },
      { name: "6-7", minAge: 6, maxAge: 7, tenantId: tenant.id },
      { name: "8-11", minAge: 8, maxAge: 11, tenantId: tenant.id },
    ],
    skipDuplicates: true,
  });

  const group45 = await prisma.group.findFirstOrThrow({
    where: { tenantId: tenant.id, name: "4-5" },
  });

  // 3) Users (Admin, Parent, Volunteer, Both)
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.church" },
    update: {},
    create: {
      email: "admin@demo.church",
      name: "Demo Admin",
      tenantId: tenant.id, // default tenant for backward compatibility
      hasFamilyAccess: true,
      hasServeAccess: true,
    },
  });

  // Org-level role for suite administration
  await prisma.userOrgRole.upsert({
    where: {
      userId_orgId_role: {
        userId: admin.id,
        orgId: org.id,
        role: OrgRole.ORG_ADMIN,
      },
    },
    update: {},
    create: { userId: admin.id, orgId: org.id, role: OrgRole.ORG_ADMIN },
  });

  const parentOnly = await prisma.user.upsert({
    where: { email: "parent@demo.church" },
    update: {},
    create: {
      email: "parent@demo.church",
      name: "Paula Parent",
      tenantId: tenant.id,
      hasFamilyAccess: true,
      hasServeAccess: false,
    },
  });

  const volunteerOnly = await prisma.user.upsert({
    where: { email: "volunteer@demo.church" },
    update: {},
    create: {
      email: "volunteer@demo.church",
      name: "Victor Volunteer",
      tenantId: tenant.id,
      hasFamilyAccess: false,
      hasServeAccess: true,
    },
  });

  const bothSpaces = await prisma.user.upsert({
    where: { email: "both@demo.church" },
    update: {},
    create: {
      email: "both@demo.church",
      name: "Casey Both",
      tenantId: tenant.id,
      hasFamilyAccess: true,
      hasServeAccess: true,
    },
  });

  // 4) Roles per tenant (site-level roles)
  await prisma.userTenantRole.createMany({
    data: [
      { userId: admin.id, tenantId: tenant.id, role: Role.ADMIN },
      { userId: volunteerOnly.id, tenantId: tenant.id, role: Role.TEACHER },
      { userId: bothSpaces.id, tenantId: tenant.id, role: Role.TEACHER },
      { userId: parentOnly.id, tenantId: tenant.id, role: Role.PARENT },
    ],
    skipDuplicates: true,
  });

  // 4b) Site memberships (new auth model for tenant access)
  await prisma.siteMembership.createMany({
    data: [
      { userId: admin.id, tenantId: tenant.id, role: "SITE_ADMIN" },
      { userId: volunteerOnly.id, tenantId: tenant.id, role: "STAFF" },
      { userId: bothSpaces.id, tenantId: tenant.id, role: "STAFF" },
      { userId: parentOnly.id, tenantId: tenant.id, role: "VIEWER" },
    ],
    skipDuplicates: true,
  });

  // 5) Child + guardianship (many-to-many)
  const child = await prisma.child.create({
    data: {
      firstName: "Avery",
      lastName: "Parent",
      tenantId: tenant.id,
      groupId: group45.id,
      guardians: {
        connect: [{ id: parentOnly.id }, { id: bothSpaces.id }],
      },
      allergies: "none",
      disabilities: [],
      photoConsent: false,
    },
  });

  // 5b) Public signup link for demo tenant (invite-only parent signup)
  // Token for testing: use this in URL /signup?token=<PUBLIC_SIGNUP_DEMO_TOKEN>
  const PUBLIC_SIGNUP_DEMO_TOKEN =
    "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456";
  const signupTokenHash = createHash("sha256")
    .update(PUBLIC_SIGNUP_DEMO_TOKEN)
    .digest("hex");
  await prisma.publicSignupLink.upsert({
    where: {
      tenantId_tokenHash: { tenantId: tenant.id, tokenHash: signupTokenHash },
    },
    update: {},
    create: {
      orgId: org.id,
      tenantId: tenant.id,
      tokenHash: signupTokenHash,
      createdByUserId: admin.id,
      expiresAt: null,
      revokedAt: null,
    },
  });
  console.log(
    "  Demo public signup URL: /signup?token=" + PUBLIC_SIGNUP_DEMO_TOKEN,
  );

  // 6) Attendance (simple demo record)
  await prisma.attendance.create({
    data: {
      childId: child.id,
      groupId: group45.id,
      present: true,
    },
  });

  // 7) Example Concern
  await prisma.concern.create({
    data: {
      childId: child.id,
      summary: "Safety gate left open",
      details:
        "Volunteer reported the side safety gate was left open after session.",
    },
  });

  console.log("✅ Suite seed complete.");
}
