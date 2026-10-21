export type SlipQuestion = {
  id: string;
  label: string;
  required: boolean;
};

export type FamilySlip = {
  id: string;
  versionId: string;
  version: number;
  title: string;
  tripTitle: string;
  deadlineAt: string;
  publishedAt: string;
  cancelled: boolean;
};

export type FamilySlipDetail = {
  id: string;
  childId: string;
  versionId: string;
  version: number;
  versionHash: string;
  publishedAt: string;
  snapshot: {
    tripTitle: string;
    title: string;
    description: string;
    destination: string;
    startsAt: string;
    endsAt: string;
    consentText: string;
    deadlineAt: string;
    questions: SlipQuestion[];
  };
  response: {
    id: string;
    decision: "ACCEPTED" | "DECLINED";
    respondedAt: string;
    permissionSlipVersionId: string;
  } | null;
  exception: {
    id: string;
    decision: "ACCEPTED" | "DECLINED";
    recordedAt: string;
  } | null;
  needsReconsent: boolean;
  onlineResponsesEnabled: boolean;
  canRespond: boolean;
  closed: boolean;
};

export type StaffSlipList = {
  items: Array<{
    id: string;
    trip: {
      id: string;
      title: string;
      startsAt: string;
      cancelledAt: string | null;
    };
    versions: Array<{
      id: string;
      version: number;
      publishedAt: string | null;
      scheduledAt: string | null;
      requiresReconsent: boolean;
    }>;
  }>;
  nextCursor: string | null;
};

export type StaffSlipDetail = {
  id: string;
  trip: {
    id: string;
    title: string;
    destination: string;
    startsAt: string;
    endsAt: string;
    cancelledAt: string | null;
  };
  versions: Array<{
    id: string;
    version: number;
    contentSnapshot: FamilySlipDetail["snapshot"] & {
      recipientChildIds: string[];
    };
    versionHash: string | null;
    changeClassification: "INITIAL" | "MATERIAL" | "NON_MATERIAL";
    requiresReconsent: boolean;
    publishedAt: string | null;
    scheduledAt: string | null;
    scheduleFailureReason: string | null;
    updatedAt: string;
    recipients: Array<{ childId: string }>;
  }>;
  nextVersionCursor: string | null;
};

export type SlipResponseSummary = {
  slipId: string;
  versionId: string;
  version: number;
  versionHash: string;
  audienceChildren: number;
  childrenWithResponse: number;
  childrenWithoutResponse: number;
  acceptedResponses: number;
  declinedResponses: number;
  exceptions: number;
  rows: Array<{
    childId: string;
    childName: string;
    responseCount: number;
    exception: {
      childId: string;
      decision: "ACCEPTED" | "DECLINED";
      source: "PHYSICAL" | "TELEPHONE";
    } | null;
  }>;
};

export type TripDraft = {
  id: string;
  title: string;
  destination: string;
  startsAt: string;
  endsAt: string;
};

export type StaffTrip = TripDraft & {
  cancelledAt: string | null;
  permissionSlip: { id: string } | null;
};

export type SlipDraftInput = {
  title: string;
  description: string;
  consentText: string;
  deadlineAt: string;
  questions: Array<{ id?: string; label: string; required: boolean }>;
  recipientChildIds: string[];
};
