import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { OrgsModule } from "./orgs/orgs.module";
import { PlatformModule } from "./platform/platform.module";
import { BillingModule } from "./billing/billing.module";
import { AceSettingsModule } from "./ace-settings/ace-settings.module";
import { PaceModule } from "./pace/pace.module";
import { BehaviourModule } from "./behaviour/behaviour.module";
import { AceDashboardModule } from "./ace-dashboard/ace-dashboard.module";

// Core modules
import { HealthModule } from "./health/health.module";
import { TenantsModule } from "./tenants/tenants.module"; // TODO: rename file
import { UsersModule } from "./users/users.module";
import { GroupsModule } from "./groups/groups.module";
import { ChildrenModule } from "./children/children.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { LessonsModule } from "./lessons/lessons.module";
import { LearningModule } from "./learning/learning.module";
import { FamilyPlannerModule } from "./family-planner/family-planner.module";

// // Scheduling / Rota
import { SessionsModule } from "./sessions/sessions.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { PreferencesModule } from "./preferences/preferences.module";
import { SwapsModule } from "./swaps/swaps.module";
import { ParentsModule } from "./parents/parents.module";

// // Comms & Safeguarding
import { AnnouncementsModule } from "./announcements/announcements.module";
import { NotesModule } from "./notes/notes.module";
import { ConcernsModule } from "./concerns/concerns.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { DsarModule } from "./dsar/dsar.module";
import { AuthModule } from "./auth/auth.module";
import { InvitesModule } from "./invites/invites.module";
import { MailerModule } from "./mailer/mailer.module";
import { LeadsModule } from "./leads/leads.module";
import { StaffModule } from "./staff/staff.module";
import { PublicSignupModule } from "./public-signup/public-signup.module";
import { NexstepsHomeSignupModule } from "./nexsteps-home-signup/nexsteps-home-signup.module";
import { HouseholdSetupModule } from "./household-setup/household-setup.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { ExportsModule } from "./exports/exports.module";
import { BlogModule } from "./blog/blog.module";
import { HandoverModule } from "./handover/handover.module";
import { GuestPassModule } from "./guest-pass/guest-pass.module";
import { AccessControlModule } from "./access-control/access-control.module";

@Module({
  imports: [
    CommonModule,
    HealthModule,
    AuthModule,
    MailerModule,
    InvitesModule,
    TenantsModule,
    UsersModule,
    GroupsModule,
    ChildrenModule,
    AttendanceModule,
    LessonsModule,
    LearningModule,
    FamilyPlannerModule,
    SessionsModule,
    AssignmentsModule,
    PreferencesModule,
    SwapsModule,
    ParentsModule,
    AnnouncementsModule,
    NotesModule,
    ConcernsModule,
    FeedbackModule,
    DsarModule,
    OrgsModule,
    PlatformModule,
    AccessControlModule,
    BillingModule,
    AceSettingsModule,
    PaceModule,
    BehaviourModule,
    AceDashboardModule,
    LeadsModule,
    StaffModule,
    PublicSignupModule,
    NexstepsHomeSignupModule,
    HouseholdSetupModule,
    PrivacyModule,
    ExportsModule,
    BlogModule,
    HandoverModule,
    GuestPassModule,
  ],
})
export class AppModule {}
