export interface RlsRoleDatabaseClient {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $disconnect(): Promise<void>;
}

interface PaceRequestRlsRoleLeaseOptions {
  enabled: boolean;
  bootstrapRole: string;
  restrictedRole: string;
  requestClient: RlsRoleDatabaseClient;
  createBootstrapClient: () => RlsRoleDatabaseClient;
}

export class PaceRequestRlsRoleLease {
  private roleMutated = false;

  constructor(private readonly options: PaceRequestRlsRoleLeaseOptions) {}

  get isConfigured(): boolean {
    return this.roleMutated;
  }

  async enable(): Promise<void> {
    if (!this.options.enabled) return;
    await this.options.requestClient.$executeRawUnsafe(
      `ALTER ROLE "${this.options.bootstrapRole}" SET role TO "${this.options.restrictedRole}"`,
    );
    this.roleMutated = true;
    await this.options.requestClient.$disconnect();
  }

  async restore(): Promise<void> {
    if (!this.roleMutated) return;

    let firstError: unknown;
    let bootstrapClient: RlsRoleDatabaseClient | undefined;

    try {
      bootstrapClient = this.options.createBootstrapClient();
      await bootstrapClient.$executeRawUnsafe(
        `ALTER ROLE "${this.options.bootstrapRole}" RESET role`,
      );
    } catch (error) {
      firstError = error;
    }

    try {
      await bootstrapClient?.$disconnect();
    } catch (error) {
      firstError ??= error;
    }

    try {
      await this.options.requestClient.$disconnect();
    } catch (error) {
      firstError ??= error;
    } finally {
      this.roleMutated = false;
    }

    if (firstError) throw firstError;
  }
}
