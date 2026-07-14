import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { OrgsModule } from "./orgs/orgs.module";
import { BillingModule } from "./billing/billing.module";

// Core modules
import { HealthModule } from "./health/health.module";
import { TenantsModule } from "./tenants/tenants.module"; // TODO: rename file
import { UsersModule } from "./users/users.module";
import { GroupsModule } from "./groups/groups.module";
import { ChildrenModule } from "./children/children.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { LessonsModule } from "./lessons/lessons.module";

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
import { DsarModule } from "./dsar/dsar.module";
import { AuthModule } from "./auth/auth.module";
import { InvitesModule } from "./invites/invites.module";
import { MailerModule } from "./mailer/mailer.module";
import { LeadsModule } from "./leads/leads.module";
import { StaffModule } from "./staff/staff.module";
import { PublicSignupModule } from "./public-signup/public-signup.module";
import { ExportsModule } from "./exports/exports.module";
import { BlogModule } from "./blog/blog.module";
import { HandoverModule } from "./handover/handover.module";
import { GuestPassModule } from "./guest-pass/guest-pass.module";

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
    SessionsModule,
    AssignmentsModule,
    PreferencesModule,
    SwapsModule,
    ParentsModule,
    AnnouncementsModule,
    NotesModule,
    ConcernsModule,
    DsarModule,
    OrgsModule,
    BillingModule,
    LeadsModule,
    StaffModule,
    PublicSignupModule,
    ExportsModule,
    BlogModule,
    HandoverModule,
    GuestPassModule,
  ],
})
export class AppModule {}
