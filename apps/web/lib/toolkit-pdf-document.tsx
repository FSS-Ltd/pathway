/**
 * Nexsteps Toolkit v2 — server-side PDF.
 * Blank templates: Attendance, Incident/Concern, Consent, Volunteer Onboarding, Weekly Safeguarding.
 * Design tokens, consistent chrome, print-safe, WCAG-minded.
 */

import React from "react";
import path from "node:path";
import fs from "node:fs";
import { StyleSheet } from "@react-pdf/renderer";
import { Document, Image, Page, Text, View } from "./react-pdf-jsx";
import { TOOLKIT_TOKENS as T } from "./toolkit-pdf-tokens";

const DISCLAIMER =
  "Confidential: store securely. Do not email completed safeguarding forms.";
const VERSION = "v2";

const webPublic = path.join(
  process.cwd().endsWith("web") ? process.cwd() : path.join(process.cwd(), "apps/web"),
  "public"
);
const LOGO_PNG_PATH = path.join(webPublic, "NSLogo.png");
const HAS_LOGO_PNG = fs.existsSync(LOGO_PNG_PATH);

const styles = StyleSheet.create({
  page: {
    padding: T.pageMargin,
    paddingBottom: T.pageMarginBottom,
    fontSize: T.bodySize,
    fontFamily: T.fontFamily,
    lineHeight: T.lineHeight,
    color: T.primary,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 8,
    marginBottom: 10,
    borderBottomWidth: T.borderWidth,
    borderBottomColor: T.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLogo: {
    fontSize: 14,
    fontWeight: "bold",
    color: T.primary,
    letterSpacing: 0.5,
  },
  headerLogoImg: {
    width: 90,
    height: 28,
    objectFit: "contain",
  },
  headerRight: {
    textAlign: "right",
  },
  headerBrand: {
    fontSize: T.h2Size,
    fontWeight: "bold",
    color: T.primary,
  },
  headerOrg: {
    fontSize: T.helperSize,
    color: T.muted,
  },
  headerTemplate: {
    fontSize: T.helperSize,
    color: T.secondary,
  },
  footer: {
    position: "absolute" as const,
    bottom: 20,
    left: T.pageMargin,
    right: T.pageMargin,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: T.helperSize,
    color: T.muted,
  },
  footerLeft: {},
  footerRight: {},
  h1: {
    fontSize: T.h1Size,
    fontWeight: "bold",
    marginBottom: 12,
    color: T.primary,
  },
  h2: {
    fontSize: T.h2Size,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 10,
    color: T.primary,
  },
  body: {
    fontSize: T.bodySize,
    marginBottom: 8,
    color: T.primary,
  },
  helper: {
    fontSize: T.helperSize,
    color: T.muted,
    marginTop: 4,
    marginBottom: 8,
  },
  box: {
    borderWidth: T.borderWidth,
    borderColor: T.border,
    backgroundColor: T.lightFill,
    padding: T.boxPadding,
    marginBottom: T.sectionGap,
  },
  boxInner: {
    borderWidth: T.borderWidth,
    borderColor: T.border,
    backgroundColor: "#FFFFFF",
    padding: T.boxPadding,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "center",
  },
  rowLabel: {
    width: "38%",
    fontSize: T.bodySize,
    color: T.secondary,
  },
  rowField: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    minHeight: 14,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: T.primary,
    marginRight: 6,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  checkboxLabel: {
    fontSize: T.bodySize,
  },
  table: {
    width: "100%",
    marginTop: 6,
    borderWidth: T.borderWidth,
    borderColor: T.border,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 2,
    borderBottomColor: T.primary,
    paddingVertical: 6,
    paddingHorizontal: 4,
    backgroundColor: T.lightFill,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    minHeight: 20,
  },
  tableCell: {
    padding: 6,
    paddingVertical: 4,
    fontSize: T.bodySize,
    borderRightWidth: 1,
    borderRightColor: T.border,
  },
  tableCellLast: {
    borderRightWidth: 0,
  },
  prominentNote: {
    marginTop: 12,
    padding: T.boxPadding,
    backgroundColor: T.lightFill,
    fontSize: T.helperSize,
    fontWeight: "bold",
    color: T.primary,
  },
  twoCol: {
    flexDirection: "row",
    gap: 20,
  },
  twoColHalf: {
    flex: 1,
  },
});

type PageChromeProps = {
  orgName?: string | null;
  templateName?: string;
  pageNumber: number;
  totalPages: number;
};

function PageHeader({ orgName, templateName }: Omit<PageChromeProps, "pageNumber" | "totalPages">) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        {HAS_LOGO_PNG ? (
          <Image style={styles.headerLogoImg} src={LOGO_PNG_PATH} />
        ) : (
          <Text style={styles.headerLogo}>Nexsteps</Text>
        )}
        {orgName ? (
          <Text style={styles.headerOrg}>Organisation: {orgName}</Text>
        ) : (
          <Text style={styles.headerOrg}>Organisation: ________________</Text>
        )}
      </View>
      <View style={styles.headerRight}>
        {templateName ? (
          <>
            <Text style={styles.headerTemplate}>{templateName}</Text>
            <Text style={styles.headerTemplate}>Blank template – {VERSION}</Text>
          </>
        ) : (
          <Text style={styles.headerTemplate}>Nexsteps Toolkit</Text>
        )}
      </View>
    </View>
  );
}

function PageFooter({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerLeft}>{DISCLAIMER}</Text>
      <Text style={styles.footerRight}>Page {pageNumber} of {totalPages}</Text>
    </View>
  );
}

const TOTAL_PAGES = 13;

export type ToolkitPdfProps = {
  orgName?: string | null;
};

/* --- Cover + How to use --- */
function CoverPage({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} />
      <Text style={styles.h1}>How to use this pack (2 minutes)</Text>
      <Text style={styles.body}>
        This toolkit gives you printable, audit-friendly templates for attendance and safeguarding.
        Use them as paper backups or as a quick starting point before moving into Nexsteps for full
        digital records.
      </Text>
      <Text style={styles.body}>1) Set up: Write your organisation name on the first page of each form. Print a small batch and store securely.</Text>
      <Text style={styles.body}>2) Use the right template: Use the decision guide below to pick the correct form in seconds.</Text>
      <Text style={styles.body}>3) Keep records secure: Completed safeguarding forms must be stored in a locked cabinet or secure system. Avoid email.</Text>
      <Text style={styles.body}>4) Escalate fast: If you have an immediate risk, call emergency services. For safeguarding concerns, notify the DSL as soon as possible.</Text>
      <Text style={styles.prominentNote}>
        Storage warning: These forms may contain sensitive personal information. Store securely, restrict access, and follow your safeguarding and data protection policies.
      </Text>
      <PageFooter pageNumber={1} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

/* --- Quick decision guide --- */
function DecisionGuidePage({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="How to use this pack" />
      <Text style={styles.h2}>Which template to use (60 seconds)</Text>
      <Text style={styles.helper}>Quick decision guide</Text>
      <View style={styles.box}>
        <Text style={[styles.body, { fontWeight: "bold" }]}>Attendance Register</Text>
        <Text style={styles.body}>Use for session check-in/out and collection. Do not record safeguarding details here.</Text>
      </View>
      <View style={styles.box}>
        <Text style={[styles.body, { fontWeight: "bold" }]}>Incident / Concern Report</Text>
        <Text style={styles.body}>Use for injuries, disclosures, or safeguarding concerns. This is your core credibility form.</Text>
      </View>
      <View style={styles.box}>
        <Text style={[styles.body, { fontWeight: "bold" }]}>Parent/Guardian Consent</Text>
        <Text style={styles.body}>Use for consent and communications preferences. Keep up to date for each child.</Text>
      </View>
      <View style={styles.box}>
        <Text style={[styles.body, { fontWeight: "bold" }]}>Volunteer Onboarding Checklist</Text>
        <Text style={styles.body}>Use to confirm safeguarding readiness and onboarding steps are completed.</Text>
      </View>
      <View style={styles.box}>
        <Text style={[styles.body, { fontWeight: "bold" }]}>Weekly Safeguarding Check</Text>
        <Text style={styles.body}>Use weekly to ensure logs, follow-ups, and data handling are consistent.</Text>
      </View>
      <PageFooter pageNumber={2} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

/* --- 1. Attendance Register --- */
const ATTENDANCE_COLS = [
  { label: "Child name", width: "28%" },
  { label: "Year group / DOB", width: "12%" },
  { label: "Parent/carer contact", width: "18%" },
  { label: "Check-in", width: "12%" },
  { label: "Check-out", width: "12%" },
  { label: "Collected by", width: "18%" },
];

function AttendanceSessionDetails({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Attendance Register" />
      <Text style={styles.h2}>Session details</Text>
      <Text style={styles.helper}>Do not record safeguarding details here</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Organisation / Group / Site</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Session name</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Location</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.twoCol}>
          <View style={[styles.row, styles.twoColHalf]}>
            <Text style={[styles.rowLabel, { width: "50%" }]}>Start time</Text>
            <View style={styles.rowField} />
          </View>
          <View style={[styles.row, styles.twoColHalf]}>
            <Text style={[styles.rowLabel, { width: "50%" }]}>End time</Text>
            <View style={styles.rowField} />
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Lead staff</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Additional staff/volunteers (optional)</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <Text style={styles.helper}>Attendance – Add rows as needed</Text>
      <PageFooter pageNumber={3} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

function AttendanceTableAndSummaryPage({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Attendance Register" />
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {ATTENDANCE_COLS.map((c, i) => (
            <Text
              key={c.label}
              style={[
                styles.tableCell,
                { width: c.width },
                ...(i === ATTENDANCE_COLS.length - 1 ? [styles.tableCellLast] : []),
              ]}
            >
              {c.label}
            </Text>
          ))}
        </View>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={styles.tableRow}>
            {ATTENDANCE_COLS.map((c, ci) => (
              <View
                key={c.label}
                style={[
                  styles.tableCell,
                  { width: c.width },
                  ...(ci === ATTENDANCE_COLS.length - 1 ? [styles.tableCellLast] : []),
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <Text style={[styles.h2, { marginTop: 12 }]}>Session summary</Text>
      <View style={[styles.boxInner, { marginBottom: 0 }]}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Total expected</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Total attended</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>First aid incidents? (Yes/No)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Safeguarding concerns raised? (Yes/No)</Text>
          <View style={styles.rowField} />
        </View>
        <Text style={styles.helper}>If yes, complete form and store securely.</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Leader signature</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <PageFooter pageNumber={4} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

/* --- 2. Incident / Concern Report --- */
function IncidentReportMetadata({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Incident / Concern Report" />
      <Text style={styles.h2}>Report details</Text>
      <Text style={[styles.helper, { marginBottom: 10 }]}>Required</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date & time of incident/concern</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Report created date/time</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Location</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Reported by (name)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Role</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Contact (optional)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Child/young person (name/ID)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Group/class (optional)</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <Text style={styles.h2}>Type</Text>
      <Text style={styles.helper}>Tick all that apply</Text>
      {["Injury/accident", "Behaviour incident", "Disclosure", "Safeguarding concern (non-disclosure)", "Online safety concern", "Bullying / peer-on-peer", "Missing child / collection issue", "Other"].map((t) => (
        <View key={t} style={styles.checkboxRow}>
          <View style={styles.checkbox} />
          <Text style={styles.checkboxLabel}>{t}</Text>
        </View>
      ))}
      <Text style={styles.h2}>What happened (facts only)</Text>
      <Text style={styles.helper}>Describe what you saw/heard. Avoid opinions.</Text>
      <View style={[styles.boxInner, { minHeight: 60 }]} />
      <PageFooter pageNumber={5} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

function IncidentImmediateActions({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Incident / Concern Report" />
      <Text style={styles.h2}>Immediate actions taken</Text>
      <Text style={styles.helper}>Tick + add details</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>First aid given (Yes/No) — by whom</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Parent/guardian informed (Yes/No) — when/how</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Emergency services contacted (Yes/No) — ref number</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Child supervised / moved to safe space (Yes/No)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Other actions</Text>
          <View style={[styles.rowField, { minHeight: 40 }]} />
        </View>
      </View>
      <Text style={styles.h2}>DSL / Safeguarding lead use</Text>
      <Text style={styles.helper}>Escalation & decisions</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Escalated to DSL? (Yes/No)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>DSL name</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date/time notified</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Threshold decision (Logged only / Monitor / Internal safeguarding plan / Referral required)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Referral made to (LA/MASH, Police, LADO, NHS/111/999)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Outcome / next steps</Text>
          <View style={[styles.rowField, { minHeight: 40 }]} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Follow-up date (required if monitor/referral)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Case reference ID (optional)</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <PageFooter pageNumber={6} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

function IncidentSignOff({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Incident / Concern Report" />
      <Text style={styles.h2}>Sign-off</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Reporter signature</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>DSL signature (if escalated)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>DSL date</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <PageFooter pageNumber={7} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

/* --- 3. Parent/Guardian Consent --- */
function ParentGuardianConsentPage1({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Parent/Guardian Consent" />
      <Text style={styles.h2}>Child details</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Child name</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>DOB / Year group (optional)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Emergency contact name</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Emergency contact number</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Medical notes (optional; critical info only)</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <Text style={styles.h2}>Parent/guardian details</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Name</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Relationship</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Phone</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email (optional)</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <Text style={styles.h2}>Photography & video consent</Text>
      <Text style={styles.helper}>Tick one</Text>
      {["Internal use only", "Public marketing (website/social)", "No photos/videos"].map((o) => (
        <View key={o} style={styles.checkboxRow}>
          <View style={styles.checkbox} />
          <Text style={styles.checkboxLabel}>{o}</Text>
        </View>
      ))}
      <Text style={styles.h2}>Trips & transport</Text>
      {["Local walking trips", "Coach or minibus", "Public transport"].map((o) => (
        <View key={o} style={styles.checkboxRow}>
          <View style={styles.checkbox} />
          <Text style={styles.checkboxLabel}>{o}</Text>
        </View>
      ))}
      <Text style={styles.h2}>Emergency medical care</Text>
      <View style={[styles.boxInner, { minHeight: 30 }]} />
      <Text style={styles.h2}>Communications</Text>
      <Text style={styles.helper}>Tick all that apply. Include privacy note.</Text>
      {["Email", "SMS", "WhatsApp (optional)"].map((o) => (
        <View key={o} style={styles.checkboxRow}>
          <View style={styles.checkbox} />
          <Text style={styles.checkboxLabel}>{o}</Text>
        </View>
      ))}
      <PageFooter pageNumber={8} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

function ParentGuardianConsentPage2({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Parent/Guardian Consent" />
      <Text style={styles.h2}>Special instructions (critical only)</Text>
      <Text style={styles.helper}>Allergies, conditions, collection notes</Text>
      <View style={[styles.boxInner, { minHeight: 50 }]} />
      <Text style={styles.h2}>Sign-off</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Signature</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Printed name</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <Text style={styles.helper}>We store this securely and only share on a need-to-know basis.</Text>
      <PageFooter pageNumber={9} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

/* --- 4. Volunteer Onboarding Checklist --- */
const VOLUNTEER_SECTIONS = [
  {
    title: "Pre-start",
    items: ["Application received", "Role description provided", "References received (if applicable)", "DBS status checked (store DBS info separately)"],
  },
  {
    title: "Safeguarding readiness",
    items: ["Safeguarding policy read", "Code of conduct signed", "Reporting / escalation path explained", "Boundaries briefed"],
  },
  {
    title: "Operational readiness",
    items: ["Attendance process trained", "Collection & handover rules trained", "Incident/concern form trained", "Emergency procedures trained"],
  },
  {
    title: "Systems & access",
    items: ["Added to rota", "Added to comms channel", "Site access instructions given", "Completed induction"],
  },
];

function VolunteerOnboardingPage1({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Volunteer Onboarding Checklist" />
      <Text style={styles.h2}>Volunteer details</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Volunteer name</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Role</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Start date</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Lead contact</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      {VOLUNTEER_SECTIONS.slice(0, 2).map((s) => (
        <View key={s.title}>
          <Text style={styles.h2}>{s.title}</Text>
          <Text style={styles.helper}>Tick + date/initials</Text>
          {s.items.map((item) => (
            <View key={item} style={styles.checkboxRow}>
              <View style={styles.checkbox} />
              <Text style={styles.checkboxLabel}>{item}</Text>
              <View style={[styles.rowField, { width: 60, marginLeft: 8 }]} />
              <View style={[styles.rowField, { width: 40, marginLeft: 4 }]} />
            </View>
          ))}
        </View>
      ))}
      <PageFooter pageNumber={10} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

function VolunteerOnboardingPage2({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Volunteer Onboarding Checklist" />
      {VOLUNTEER_SECTIONS.slice(2).map((s) => (
        <View key={s.title}>
          <Text style={styles.h2}>{s.title}</Text>
          <Text style={styles.helper}>Tick + date/initials</Text>
          {s.items.map((item) => (
            <View key={item} style={styles.checkboxRow}>
              <View style={styles.checkbox} />
              <Text style={styles.checkboxLabel}>{item}</Text>
              <View style={[styles.rowField, { width: 60, marginLeft: 8 }]} />
              <View style={[styles.rowField, { width: 40, marginLeft: 4 }]} />
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.h2}>Sign-off</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Volunteer signature</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Lead signature</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <PageFooter pageNumber={11} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

/* --- 5. Weekly Safeguarding Check --- */
const WEEKLY_CHECKLIST = [
  "Attendance records completed and stored",
  "Any incident/concern forms filed this week",
  "Follow-ups scheduled and tracked",
  "Rota coverage meets minimum supervision ratio",
  "New volunteers onboarded correctly",
  "Any parental complaints received (logged)",
  "Any unresolved safeguarding items from previous week listed",
  "Data handling check (no completed forms sent by email)",
];

const ACTION_LOG_COLS = [
  { label: "Issue found", width: "40%" },
  { label: "Owner", width: "20%" },
  { label: "Due date", width: "15%" },
  { label: "Status", width: "10%" },
  { label: "Notes", width: "15%" },
];

function WeeklySafeguardingPage1({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Weekly Safeguarding Check" />
      <Text style={styles.h2}>Week details</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Week commencing date</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Site/group</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Completed by (name/role)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>DSL notified of issues? (Yes/No)</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <Text style={styles.h2}>Weekly checklist</Text>
      <Text style={styles.helper}>Tick + add notes</Text>
      {WEEKLY_CHECKLIST.map((item) => (
        <View key={item} style={styles.checkboxRow}>
          <View style={styles.checkbox} />
          <Text style={styles.checkboxLabel}>{item}</Text>
        </View>
      ))}
      <Text style={styles.h2}>Action log</Text>
      <Text style={styles.helper}>Track issues to completion</Text>
      <PageFooter pageNumber={12} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

function WeeklySafeguardingPage2({ orgName }: ToolkitPdfProps) {
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader orgName={orgName} templateName="Weekly Safeguarding Check" />
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          {ACTION_LOG_COLS.map((c) => (
            <Text key={c.label} style={[styles.tableCell, { width: c.width }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={styles.tableRow}>
            {ACTION_LOG_COLS.map((c) => (
              <View key={c.label} style={[styles.tableCell, { width: c.width }]} />
            ))}
          </View>
        ))}
      </View>
      <Text style={styles.h2}>Sign-off</Text>
      <View style={styles.boxInner}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Completed by signature</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>DSL review signature (optional)</Text>
          <View style={styles.rowField} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Date</Text>
          <View style={styles.rowField} />
        </View>
      </View>
      <PageFooter pageNumber={13} totalPages={TOTAL_PAGES} />
    </Page>
  );
}

/* --- Main Document --- */
export function ToolkitPdfDocument({ orgName }: ToolkitPdfProps) {
  return (
    <Document>
      <CoverPage orgName={orgName} />
      <DecisionGuidePage orgName={orgName} />
      <AttendanceSessionDetails orgName={orgName} />
      <AttendanceTableAndSummaryPage orgName={orgName} />
      <IncidentReportMetadata orgName={orgName} />
      <IncidentImmediateActions orgName={orgName} />
      <IncidentSignOff orgName={orgName} />
      <ParentGuardianConsentPage1 orgName={orgName} />
      <ParentGuardianConsentPage2 orgName={orgName} />
      <VolunteerOnboardingPage1 orgName={orgName} />
      <VolunteerOnboardingPage2 orgName={orgName} />
      <WeeklySafeguardingPage1 orgName={orgName} />
      <WeeklySafeguardingPage2 orgName={orgName} />
    </Document>
  );
}
