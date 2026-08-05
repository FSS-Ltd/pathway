import { Injectable, Logger } from "@nestjs/common";

// Type for fetch Response (available in Node.js 18+)
type FetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

/**
 * Service for interacting with Auth0 Management API.
 * Used to create users programmatically during invites and purchases.
 */
@Injectable()
export class Auth0ManagementService {
  private readonly logger = new Logger(Auth0ManagementService.name);
  private readonly domain: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly isConfigured: boolean;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    // Extract domain from AUTH0_ISSUER if AUTH0_DOMAIN not set
    const issuer = process.env.AUTH0_ISSUER || "";
    this.domain = process.env.AUTH0_DOMAIN || issuer.replace(/^https?:\/\//, "").replace(/\/$/, "");
    
    // Use AUTH0_CLIENT_ID/SECRET (now authorized for Management API)
    this.clientId = process.env.AUTH0_CLIENT_ID || "";
    this.clientSecret = process.env.AUTH0_CLIENT_SECRET || "";

    this.isConfigured = !!(this.domain && this.clientId && this.clientSecret);

    if (!this.isConfigured) {
      this.logger.warn(
        "Auth0 Management API credentials not configured. User creation will be skipped.",
      );
    } else {
      this.logger.log(
        `Auth0 Management API configured: ${this.domain}`,
      );
    }
  }

  /**
   * Check if the service is properly configured.
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Get or refresh the Management API access token.
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.domain || !this.clientId || !this.clientSecret) {
      return null;
    }

    // Return cached token if still valid (with 5 minute buffer)
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now + 5 * 60 * 1000) {
      return this.accessToken;
    }

    try {
      const response = (await fetch(`https://${this.domain}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          audience: `https://${this.domain}/api/v2/`,
          grant_type: "client_credentials",
        }),
      })) as FetchResponse;

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to get Auth0 Management API token: ${response.status} - ${errorText}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };

      this.accessToken = data.access_token;
      this.tokenExpiresAt = now + data.expires_in * 1000;

      return this.accessToken;
    } catch (error) {
      this.logger.error("Error getting Auth0 Management API token:", error);
      return null;
    }
  }

  /**
   * Create a user in Auth0.
   * Returns the Auth0 user ID (sub) if successful, null otherwise.
   */
  async createUser(params: {
    email: string;
    password: string;
    name?: string;
    emailVerified?: boolean;
    connection?: string;
  }): Promise<string | null> {
    const token = await this.getAccessToken();
    if (!token) {
      this.logger.warn(
        "Cannot create Auth0 user: Management API token unavailable",
      );
      return null;
    }

    const connection = params.connection || "Username-Password-Authentication";

    try {
      const response = (await fetch(`https://${this.domain}/api/v2/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: params.email.toLowerCase().trim(),
          password: params.password,
          name: params.name || params.email,
          email_verified: params.emailVerified ?? false,
          connection,
          // Store name in user_metadata for easy access
          user_metadata: params.name
            ? {
                name: params.name,
              }
            : undefined,
        }),
      })) as FetchResponse;

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Failed to create Auth0 user: ${response.status} - ${errorText}`,
        );

        // Check if user already exists (409 Conflict)
        if (response.status === 409) {
          this.logger.warn(
            `User ${params.email} already exists in Auth0. Attempting to retrieve...`,
          );
          // Try to get existing user
          return await this.getUserByEmail(params.email);
        }

        return null;
      }

      const user = (await response.json()) as { user_id: string };
      this.logger.log(
        `✅ Created Auth0 user: ${params.email} (${user.user_id})`,
      );
      return user.user_id;
    } catch (error) {
      this.logger.error("Error creating Auth0 user:", error);
      return null;
    }
  }

  /**
   * Get a user by email address.
   * Returns the Auth0 user ID (sub) if found, null otherwise.
   */
  async getUserByEmail(email: string): Promise<string | null> {
    const token = await this.getAccessToken();
    if (!token) {
      return null;
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const response = (await fetch(
        `https://${this.domain}/api/v2/users-by-email?email=${encodeURIComponent(normalizedEmail)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )) as Response;

      if (!response.ok) {
        this.logger.error(
          `Failed to get Auth0 user by email: ${response.status}`,
        );
        return null;
      }

      const users = (await response.json()) as Array<{ user_id: string }>;
      if (users.length === 0) {
        return null;
      }

      // Return the first user's ID
      return users[0].user_id;
    } catch (error) {
      this.logger.error("Error getting Auth0 user by email:", error);
      return null;
    }
  }
}
