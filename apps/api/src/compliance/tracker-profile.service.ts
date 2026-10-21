import { isDeepStrictEqual } from "node:util";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  TrackerProfile,
  TrackerProfileInput,
  TrackerJurisdiction,
} from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { AuditAction } from "../audit/audit.types";
import {
  TrackerAccessService,
  auditTracker,
  trackerScope,
  lockTrackerSite,
} from "./tracker-access";
import { trackerLocation, trackerJurisdictionSelect } from "./tracker-location";
import { normalizeTrackerProfile } from "./tracker.dto";
import { serializeTrackerProfile } from "./tracker-record";
import {
  applyOrganisationFacts,
  trackerOrganisationFacts,
} from "./tracker-organisation";
@Injectable()
export class TrackerProfileService {
  constructor(
    @Inject(TrackerAccessService) private readonly access: TrackerAccessService,
  ) {}
  async jurisdictions(actor: ComplianceActor): Promise<TrackerJurisdiction[]> {
    return this.access.run(actor, "read", async (tx) => {
      const rows = await tx.jurisdiction.findMany({
        orderBy: [{ countryCode: "asc" }, { name: "asc" }],
        select: trackerJurisdictionSelect,
      });
      await auditTracker(tx, actor, AuditAction.VIEWED, []);
      return rows;
    });
  }
  async get(actor: ComplianceActor): Promise<TrackerProfile | null> {
    return this.access.run(actor, "read", async (tx) => {
      const row = await tx.complianceSiteProfile.findFirst({
        where: trackerScope(actor),
      });
      await auditTracker(tx, actor, AuditAction.VIEWED, row ? [row.id] : []);
      return row ? serializeTrackerProfile(row) : null;
    });
  }
  async save(
    actor: ComplianceActor,
    input: { expectedVersion: number; profile: TrackerProfileInput },
  ): Promise<TrackerProfile> {
    return this.access.run(actor, "manage", async (tx) => {
      await lockTrackerSite(tx, actor);
      const scope = trackerScope(actor);
      const current = await tx.complianceSiteProfile.findFirst({
        where: scope,
      });
      if ((current?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException(
          "The site profile changed. Reload before saving your draft.",
        );
      const currentProfile = current ? serializeTrackerProfile(current) : null;
      const facts = await trackerOrganisationFacts(tx, actor.orgId);
      const profile = applyOrganisationFacts(
        normalizeTrackerProfile(input.profile, currentProfile?.profile),
        facts,
      );
      const location = await trackerLocation(tx, profile.jurisdictionId);
      if (
        (profile.belgianEducationCommunity ||
          profile.belgianSchoolRecognitionStatus ||
          profile.belgianFrenchSchoolRoute ||
          profile.belgianGermanSchoolRoute ||
          profile.belgianGermanReducedHoursSecondary != null ||
          profile.belgianChildcareAuthority ||
          profile.belgianPaidUnderThreeCare != null) &&
        location.countryCode !== "BE"
      )
        throw new BadRequestException(
          "Belgian education and childcare facts apply only to a site operating in Belgium.",
        );
      if (profile.belgianPaidUnderThreeCare && profile.childcare === false)
        throw new BadRequestException(
          "Paid under-three care cannot be selected when the site says it offers no childcare.",
        );
      if (
        profile.belgianSchoolRecognitionStatus &&
        !profile.belgianEducationCommunity
      )
        throw new BadRequestException(
          "Select the Belgian education Community before recording its school recognition status.",
        );
      if (
        profile.belgianSchoolRecognitionStatus &&
        !["INDEPENDENT_SCHOOL", "STATE_SCHOOL"].includes(
          profile.providerCategory ?? "",
        )
      )
        throw new BadRequestException(
          "School recognition status applies only to an actual school. Confirm the provider category.",
        );
      if (
        profile.belgianFrenchSchoolRoute &&
        (profile.belgianEducationCommunity !== "FRENCH" ||
          !["INDEPENDENT_SCHOOL", "STATE_SCHOOL"].includes(
            profile.providerCategory ?? "",
          ))
      )
        throw new BadRequestException(
          "French Community school route requires the French education Community and an actual school provider category.",
        );
      if (
        profile.belgianGermanSchoolRoute &&
        (profile.belgianEducationCommunity !== "GERMAN_SPEAKING" ||
          !["INDEPENDENT_SCHOOL", "STATE_SCHOOL"].includes(
            profile.providerCategory ?? "",
          ) ||
          (location.subdivisionCode && location.subdivisionCode !== "BE3"))
      )
        throw new BadRequestException(
          "German-speaking Community school route requires an actual school in its Walloon language region.",
        );
      if (
        profile.belgianGermanReducedHoursSecondary != null &&
        (profile.belgianEducationCommunity !== "GERMAN_SPEAKING" ||
          !["INDEPENDENT_SCHOOL", "STATE_SCHOOL"].includes(
            profile.providerCategory ?? "",
          ) ||
          (location.subdivisionCode && location.subdivisionCode !== "BE3"))
      )
        throw new BadRequestException(
          "Reduced-hours secondary classification requires a German-speaking Community school.",
        );
      const region = location.subdivisionCode;
      const authority = profile.belgianChildcareAuthority;
      if (
        region &&
        authority &&
        !(
          (region === "BE1" && authority !== "GERMAN_COMMUNITY_MINISTRY") ||
          (region === "BE2" && authority === "OPGROEIEN") ||
          (region === "BE3" &&
            ["ONE", "GERMAN_COMMUNITY_MINISTRY"].includes(authority))
        )
      )
        throw new BadRequestException(
          "The childcare authority does not serve the selected Belgian Region. Confirm the care route with the competent authority.",
        );
      if (current && isDeepStrictEqual(currentProfile?.profile, profile)) {
        await auditTracker(tx, actor, AuditAction.VIEWED, [current.id]);
        return serializeTrackerProfile(current);
      }
      const profileJson = JSON.stringify(profile);
      const version = input.expectedVersion + 1;
      const data = {
        profileJson,
        version,
        jurisdictionId: profile.jurisdictionId,
        updatedByUserId: actor.userId,
      };
      const saved = current
        ? await tx.complianceSiteProfile.update({
            where: { id: current.id },
            data,
          })
        : await tx.complianceSiteProfile.create({
            data: { ...scope, ...data },
          });
      await tx.complianceProfileRevision.create({
        data: {
          ...scope,
          profileId: saved.id,
          version,
          profileJson,
          createdByUserId: actor.userId,
        },
      });
      await auditTracker(
        tx,
        actor,
        current ? AuditAction.UPDATED : AuditAction.CREATED,
        [saved.id],
      );
      return serializeTrackerProfile(saved);
    });
  }
}
