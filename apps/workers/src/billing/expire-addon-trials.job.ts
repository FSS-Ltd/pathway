import { runTransaction } from "@pathway/db";

export interface ExpiredAddonTrialOrgStore {
  findOrgIds(now: Date): Promise<string[]>;
}

export interface AddonTrialExpiryDispatcher {
  expireForOrg(orgId: string): Promise<void>;
}

const productionStore: ExpiredAddonTrialOrgStore = {
  async findOrgIds(now) {
    return runTransaction(async (tx) => {
      const rows = await tx.$queryRaw<{ orgId: string }[]>`
        SELECT "orgId"
        FROM app.list_due_institutional_addon_trial_org_ids(${now})
      `;
      return rows.map(({ orgId }) => orgId);
    });
  },
};

export class ExpireAddonTrialsJob {
  constructor(
    private readonly dispatcher: AddonTrialExpiryDispatcher,
    private readonly store: ExpiredAddonTrialOrgStore = productionStore,
  ) {}

  async run(now = new Date()): Promise<{
    organisations: number;
    failed: number;
  }> {
    const orgIds = await this.store.findOrgIds(now);
    let failed = 0;
    for (const orgId of orgIds) {
      try {
        await this.dispatcher.expireForOrg(orgId);
      } catch {
        failed += 1;
      }
    }
    return { organisations: orgIds.length, failed };
  }
}
