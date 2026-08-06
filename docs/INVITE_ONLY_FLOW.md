# Invite-Only Flow Implementation

> **Superseded by the Auth0 -> Clerk migration.** Invite/purchase user
> creation now branches on `getAuthProviderMode()` between
> `Auth0ManagementService` and `apps/api/src/auth/clerk-management.service.ts`'s
> `ClerkManagementService` (see `apps/api/src/invites/invites.service.ts`
> and `apps/api/src/billing/webhook.controller.ts`). This document stays
> accurate for the Auth0 path while `AUTH_PROVIDER_MODE` includes
> `auth0`/`dual`; it will be removed once Auth0 support is fully retired.

This document describes the invite-only authentication flow where:
1. **Invites**: Create users in DB and Auth0, then send invite link
2. **Purchases**: Collect name, email, password → Create org, user in DB, and Auth0 account → User logs in after payment

## Implementation Summary

### ✅ Completed

1. **Auth0 Management API Service** (`apps/api/src/auth/auth0-management.service.ts`)
   - Creates users in Auth0 programmatically
   - Gets users by email
   - Handles token management

2. **Invite Flow Updates** (`apps/api/src/invites/invites.service.ts`)
   - Creates user in DB when invite is created
   - Creates user in Auth0 with temporary password
   - User receives invite link and can login (password reset if needed)

3. **Upsert Logic Updates** (`apps/api/src/auth/auth-identity.service.ts`)
   - Matches users by email when linking Auth0 identity
   - Handles pre-existing users gracefully
   - Links Auth0 identity to existing DB user

4. **Auth0 Action** (`docs/AUTH0_ACTION_POST_LOGIN.md`)
   - Post-Login Action that links Auth0 user to DB user by email
   - Runs on every login to ensure linking

### 🔄 Remaining: Purchase Flow

The purchase flow needs to be updated to:
1. Collect password in the buy-now form
2. Create org and user in DB before checkout
3. Create Auth0 user with provided password
4. Create checkout session

**Required Changes:**

1. **Update `BuyNowOrgDetails` type** to include password:
```typescript
// apps/api/src/billing/buy-now.types.ts
export type BuyNowOrgDetails = {
  orgName: string;
  contactName: string;
  contactEmail: string;
  password: string; // ADD THIS
  source?: string;
};
```

2. **Update buy-now controller DTO** to include password validation

3. **Update buy-now service** to:
   - Create org before checkout
   - Create user in DB
   - Create user in Auth0 with provided password
   - Then create checkout session

4. **Update web buy page** to collect password field

## Environment Variables Required

Add these to your `.env` files:

```bash
# Auth0 Management API (for creating users programmatically)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_M2M_CLIENT_ID=your-machine-to-machine-client-id
AUTH0_M2M_CLIENT_SECRET=your-machine-to-machine-client-secret

# Existing
INTERNAL_AUTH_SECRET=your-secret-here
```

## Auth0 Setup

1. **Create Machine-to-Machine Application**:
   - Go to Auth0 Dashboard → Applications → Create Application
   - Choose "Machine to Machine Applications"
   - Authorize it for the Auth0 Management API
   - Grant permissions: `create:users`, `read:users`, `update:users`
   - Copy Client ID and Secret to env vars

2. **Add Post-Login Action**:
   - Follow instructions in `docs/AUTH0_ACTION_POST_LOGIN.md`
   - This ensures Auth0 users are linked to DB users on login

## Flow Diagrams

### Invite Flow
```
Admin creates invite
  ↓
User created in DB
  ↓
User created in Auth0 (temp password)
  ↓
Invite email sent
  ↓
User clicks link → Auth0 login
  ↓
Post-Login Action links Auth0 → DB user
  ↓
User accepts invite → Memberships created
```

### Purchase Flow (To Be Implemented)
```
User fills purchase form (name, email, password)
  ↓
Org created in DB
  ↓
User created in DB
  ↓
User created in Auth0 (with provided password)
  ↓
Checkout session created
  ↓
User completes payment
  ↓
User logs in → Post-Login Action links Auth0 → DB user
```

## Testing

1. **Test Invite Flow**:
   - Create an invite in admin
   - Verify user exists in DB
   - Verify user exists in Auth0
   - Click invite link and login
   - Verify identity is linked

2. **Test Purchase Flow** (after implementation):
   - Fill purchase form with password
   - Complete checkout
   - Verify org and user created
   - Verify Auth0 user created
   - Login and verify linking

## Notes

- All user creation logic lives in the codebase (not in Auth0 Actions)
- Auth0 Actions only handle linking on login
- Users are always created in DB first, then Auth0
- Email is the primary matching key between DB and Auth0
