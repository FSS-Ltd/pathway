# Auth0 Action: Post-Login - Link to Existing DB User

> **Superseded by the Auth0 -> Clerk migration.** Clerk sign-ins are linked
> via `apps/api/src/auth/auth-identity.service.ts`'s `upsertFromProvider()`,
> called from `AuthUserGuard`'s JIT-provisioning path and from
> `apps/api/src/auth/clerk-webhook.controller.ts` - no Dashboard Action or
> external `/internal/auth/identity/upsert` POST is involved. This document
> stays accurate for the Auth0 side while `AUTH_PROVIDER_MODE` includes
> `auth0`/`dual` (the current rollback window); it will be removed once
> Auth0 support is fully retired.

This Auth0 Action runs after a user logs in and ensures their Auth0 account is linked to the existing user in the Nexsteps database.

## Setup Instructions

1. Go to Auth0 Dashboard → Actions → Flows → Login
2. Click "+" to add a new Action
3. Select "Build Custom" 
4. Name it "Link to Nexsteps DB User"
5. Paste the code below
6. Add Secrets:
   - `API_BASE_URL` - Your API base URL (e.g., `https://api.nexsteps.dev`)
   - `INTERNAL_AUTH_SECRET` - Same value as your `INTERNAL_AUTH_SECRET` env var
7. Deploy the Action
8. Drag it into the Login flow (after "Login" but before "Complete")

## Action Code

```javascript
/**
 * Auth0 Action: Post-Login
 * Links Auth0 user to existing Nexsteps DB user by email
 * 
 * Note: This is JavaScript code that runs in Auth0's environment.
 * TypeScript errors in your IDE can be ignored - Auth0 Actions use Node.js 18+ which has fetch built-in.
 */
exports.onExecutePostLogin = async (event, api) => {
  const API_BASE_URL = event.secrets.API_BASE_URL || 'https://api.nexsteps.dev';
  const INTERNAL_AUTH_SECRET = event.secrets.INTERNAL_AUTH_SECRET;
  
  if (!INTERNAL_AUTH_SECRET) {
    console.error('INTERNAL_AUTH_SECRET not configured in Auth0 secrets');
    return;
  }

  const email = event.user.email;
  const auth0UserId = event.user.user_id;
  const name = event.user.name || event.user.given_name || event.user.nickname;

  if (!email) {
    console.error('No email found in Auth0 user profile');
    return;
  }

  try {
    // Call the internal API endpoint to upsert identity
    // This will match by email and link the Auth0 identity to the existing DB user
    // Note: fetch is available in Auth0 Actions (Node.js 18+ runtime)
    const response = await fetch(`${API_BASE_URL}/internal/auth/identity/upsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pathway-internal-secret': INTERNAL_AUTH_SECRET,
      },
      body: JSON.stringify({
        provider: 'auth0',
        subject: auth0UserId,
        email: email,
        name: name || undefined,
      }),
    });

    // Check response status (response.ok is available in fetch API)
    const status = response.status;
    const isOk = status >= 200 && status < 300;

    if (!isOk) {
      const errorText = await response.text();
      console.error(`Failed to link Auth0 user to DB: ${status} - ${errorText}`);
      // Don't block login if linking fails - user can still proceed
    } else {
      const result = await response.json();
      console.log(`✅ Successfully linked Auth0 user ${email} to DB user ${result.userId}`);
      
      // Optionally store the DB user ID in Auth0 user metadata for future reference
      if (result.userId) {
        api.user.setUserMetadata('nexsteps_user_id', result.userId);
      }
    }
  } catch (error) {
    console.error('Error calling API to link user:', error);
    // Don't block login if API call fails
  }
};
```

## How It Works

1. When a user logs in to Auth0, this Action runs
2. It extracts the user's email and Auth0 user ID
3. It calls your internal API endpoint `/internal/auth/identity/upsert`
4. The API matches the user by email and links the Auth0 identity to the existing DB user
5. If the user doesn't exist in DB yet (shouldn't happen in invite-only flow), it creates them

## Notes

- This Action runs on every login, so it's idempotent
- If the API call fails, login still proceeds (non-blocking)
- The Action stores the DB user ID in Auth0 user metadata for easy reference
