# Purchase Flow with Auth0 User Creation

> **Superseded by the Auth0 -> Clerk migration**, on top of already being
> stale for the `/buy` page reference (see
> `docs/NexStepsV2/06-cutover.md`'s own stale-flag on this file). Under
> `getAuthProviderMode()` !== `"auth0"`, `apps/api/src/billing/webhook.controller.ts`
> creates the user via `ClerkManagementService.createUser()` instead of
> `Auth0ManagementService.createUser()` - same shape (email, name,
> password), different provider. This document stays accurate for the
> Auth0 path while `AUTH_PROVIDER_MODE` includes `auth0`/`dual`; it will be
> removed once Auth0 support is fully retired.

This document explains how the purchase flow creates users in both the database and Auth0.

## Overview

When a new customer purchases through the `/buy` page, the system:
1. Collects org details, contact info, and password
2. Creates org and tenant in the database
3. Creates user in the database
4. Creates user in Auth0 with the provided password
5. Links Auth0 identity to database user
6. Creates Stripe checkout session

## UI Changes

### Buy Page (`apps/web/app/buy/page.tsx`)

**Header:**
- Added Nexsteps logo (`NSLogo.svg`) next to the text
- Made "NEXSTEPS" text bold with `font-bold` class

**Organization Form:**
- Added password field (type: password, required)
- Minimum 8 characters validation
- Helper text: "Minimum 8 characters. You'll use this to log into Nexsteps."

## Backend Flow

### 1. Buy-Now Service (`apps/api/src/billing/buy-now.service.ts`)

When a public user (unauthenticated) purchases:

```typescript
// Create org
const org = await prisma.org.create({
  data: {
    name: request.org.orgName,
    slug: orgSlug,
    planCode: sanitisedPlan.planCode,
    isSuite: false,
  },
});

// Create tenant
const tenant = await prisma.tenant.create({
  data: {
    name: request.org.orgName,
    slug: tenantSlug,
    orgId: org.id,
  },
});

// Create user in DB
const user = await prisma.user.create({
  data: {
    email: normalizedEmail,
    name: request.org.contactName,
    displayName: request.org.contactName,
  },
});

// Create user in Auth0 with password
const auth0UserId = await this.auth0Management.createUser({
  email: normalizedEmail,
  password: request.org.password,
  name: request.org.contactName,
  emailVerified: false,
});

// Link Auth0 identity to DB user
await prisma.userIdentity.create({
  data: {
    userId: user.id,
    provider: "auth0",
    providerSubject: auth0UserId,
    email: normalizedEmail,
    displayName: request.org.contactName,
  },
});

// Link user to org with ADMIN role
await prisma.userTenantRole.create({
  data: {
    userId: user.id,
    tenantId: tenant.id,
    role: "ADMIN",
  },
});
```

### 2. Auth Services (Not Redundant)

Both auth services are needed and serve different purposes:

#### `Auth0ManagementService` (`apps/api/src/auth/auth0-management.service.ts`)
- **Purpose**: Creates users in Auth0 programmatically
- **When**: Before user logs in (during invite/purchase)
- **Used by**: 
  - `invites.service.ts` - when staff invites are created
  - `buy-now.service.ts` - when new customers purchase

**Key Methods:**
- `createUser(params)` - Creates Auth0 user with password
- `getUserByEmail(email)` - Finds existing Auth0 user

#### `AuthIdentityService` (`apps/api/src/auth/auth-identity.service.ts`)
- **Purpose**: Links Auth0 users to database users
- **When**: After user logs in (via Auth0 Action)
- **Used by**:
  - Auth0 Post-Login Action (calls `/internal/auth/identity/upsert`)
  - NextAuth callback in admin app
  - API guards for Auth0 tokens

**Key Methods:**
- `upsertFromAuth0(payload)` - Links Auth0 identity to DB user by email

## How They Work Together

### New Customer Purchase Flow

1. **User fills out buy form** with org details and password
2. **Buy-now service creates:**
   - Org in DB
   - Tenant in DB
   - User in DB
   - User in Auth0 (via `Auth0ManagementService.createUser`)
   - UserIdentity linking them
3. **User completes Stripe checkout**
4. **User logs in** to Nexsteps
5. **Auth0 Post-Login Action** calls `/internal/auth/identity/upsert`
6. **AuthIdentityService** finds existing user by email and updates identity if needed

### Staff Invite Flow

1. **Admin creates invite** for staff member
2. **Invite service creates:**
   - User in DB
   - User in Auth0 with temporary password (via `Auth0ManagementService.createUser`)
   - UserIdentity linking them
3. **Staff member clicks invite link**
4. **Staff member logs in** with email and temporary password
5. **Auth0 Post-Login Action** calls `/internal/auth/identity/upsert`
6. **AuthIdentityService** verifies and updates the identity

## Environment Variables Required

```bash
# Auth0 Management API (for creating users)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_M2M_CLIENT_ID=your_m2m_client_id
AUTH0_M2M_CLIENT_SECRET=your_m2m_client_secret

# Internal API secret (for Auth0 Action to call upsert endpoint)
INTERNAL_AUTH_SECRET=your_random_secret_here
```

## Security Notes

1. **Password Requirements**: Minimum 8 characters (enforced in frontend and backend)
2. **Email Verification**: Auth0 users created with `emailVerified: false`
3. **Identity Linking**: Always links by normalized email (lowercase, trimmed)
4. **Role Assignment**: New purchase users get ADMIN role on their tenant
5. **Auth0 Management**: Uses M2M client credentials (not exposed to frontend)

## Testing

Updated test file includes:
- Mock for `Auth0ManagementService`
- Password field in all test requests
- Proper constructor parameter order

Run tests:
```bash
pnpm --filter @pathway/api test
```

## Future Improvements

- Add password strength requirements (complexity, special chars)
- Add email verification step before granting full access
- Add password reset flow through Auth0
- Add 2FA support
