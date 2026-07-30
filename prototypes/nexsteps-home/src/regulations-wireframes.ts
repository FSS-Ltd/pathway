import type { Tone, WireframeBlock, WireframeScreen } from "./wireframe-types";

const notice = (
  title: string,
  body: string,
  tone: Tone = "mint",
): WireframeBlock => ({ type: "notice", title, body, tone });

const card = (
  title: string,
  body: string,
  options: {
    meta?: string;
    action?: string;
    target?: string;
    tone?: Tone;
  } = {},
): WireframeBlock => ({ type: "card", title, body, ...options });

const fields = (values: Array<[string, string, string?]>): WireframeBlock => ({
  type: "fields",
  fields: values.map(([label, value, helper]) => ({ label, value, helper })),
});

const chips = (
  items: string[],
  active: string[] = [],
  label?: string,
): WireframeBlock => ({ type: "chips", items, active, label });

const list = (
  items: Array<{
    title: string;
    detail?: string;
    meta?: string;
    target?: string;
  }>,
  title?: string,
): WireframeBlock => ({ type: "list", title, items });

const stats = (items: Array<[string, string]>): WireframeBlock => ({
  type: "stats",
  items: items.map(([value, label]) => ({ value, label })),
});

const informationNotice = notice(
  "Information, not legal advice",
  "NexSteps helps you organise official information and your family's evidence. It does not provide legal advice or guarantee compliance.",
  "neutral",
);

export const regulationsScreens: WireframeScreen[] = [
  {
    id: "regulations-jurisdiction",
    group: "regulations-evidence",
    eyebrow: "Family · Regulations",
    title: "Show guidance for your family",
    description:
      "Choose where you live so requirements and official updates stay relevant.",
    tab: "Family",
    blocks: [
      chips(["United Kingdom"], ["United Kingdom"], "Country"),
      chips(
        ["England", "Wales", "Scotland", "Northern Ireland"],
        ["England"],
        "Nation",
      ),
      fields([
        [
          "Local authority",
          "Leeds City Council",
          "Resolved from LS7 · change manually",
        ],
      ]),
      chips(["Maya", "Leo"], ["Maya", "Leo"], "Home-educated children"),
      notice(
        "Your location stays private",
        "It personalises official information only. Your postcode is never shown in Community.",
        "blue",
      ),
    ],
    primaryAction: "Create my checklist",
    primaryTarget: "regulations-overview",
  },
  {
    id: "regulations-overview",
    group: "regulations-evidence",
    eyebrow: "Family · Preparedness",
    title: "Stay prepared",
    description:
      "Official information, family evidence and deadlines in one calm place.",
    tab: "Family",
    blocks: [
      notice(
        "Two actions to review",
        "One official guidance item changed and one response is due by 14 September.",
        "yellow",
      ),
      stats([
        ["6", "Prepared"],
        ["1", "Needs review"],
        ["3", "Evidence linked"],
      ]),
      card(
        "Next action · Review updated guidance",
        "Department for Education guidance now references attendance regulations effective 19 August 2024.",
        {
          meta: "Verified",
          action: "Review change",
          target: "regulations-update-detail",
          tone: "yellow",
        },
      ),
      card(
        "Response due 14 September",
        "Leeds City Council · annual education enquiry · Maya",
        {
          meta: "9 days",
          action: "Open correspondence",
          target: "regulations-correspondence-detail",
        },
      ),
      list(
        [
          {
            title: "Requirements",
            detail: "6 prepared · 1 needs review",
            meta: "Open",
            target: "regulations-requirements",
          },
          {
            title: "Evidence vault",
            detail: "12 private records · 3 linked",
            meta: "Private",
            target: "regulations-evidence",
          },
          {
            title: "Official updates",
            detail: "1 new · checked 28 July 2026",
            meta: "Verified",
            target: "regulations-updates",
          },
          {
            title: "Correspondence",
            detail: "1 response in progress",
            meta: "9 days",
            target: "regulations-correspondence",
          },
        ],
        "Your preparedness",
      ),
      informationNotice,
    ],
    primaryAction: "Review what changed",
    primaryTarget: "regulations-update-detail",
    secondaryAction: "Change location",
  },
  {
    id: "regulations-requirements",
    group: "regulations-evidence",
    eyebrow: "Family · Requirements",
    title: "Your requirements",
    description:
      "Parent-controlled preparation, grounded in official information for England.",
    tab: "Family",
    blocks: [
      chips(
        ["Needs review", "In progress", "Prepared", "All"],
        ["Needs review"],
      ),
      list([
        {
          title: "Show how learning remains suitable",
          detail: "Household · official guidance changed",
          meta: "Needs review",
          target: "regulations-requirement-detail",
        },
        {
          title: "Provide an efficient full-time education",
          detail: "Maya and Leo · DfE guidance",
          meta: "Prepared",
          target: "regulations-requirement-detail",
        },
        {
          title: "Keep your education approach current",
          detail: "Maya · reviewed 3 June",
          meta: "Prepared",
          target: "regulations-requirement-detail",
        },
        {
          title: "Respond to the annual enquiry",
          detail: "Maya · parent deadline 14 September",
          meta: "In progress",
          target: "regulations-requirement-detail",
        },
      ]),
      notice(
        "Source-aware checklist",
        "Each item keeps its jurisdiction, official source, effective date and verification history.",
        "blue",
      ),
    ],
    primaryAction: "Open item needing review",
    primaryTarget: "regulations-requirement-detail",
  },
  {
    id: "regulations-requirement-detail",
    group: "regulations-evidence",
    eyebrow: "Requirement · England",
    title: "Show how learning remains suitable",
    description:
      "A preparation guide based on official information—not a legal decision.",
    tab: "Family",
    blocks: [
      notice(
        "Needs review",
        "The source was updated. Your existing evidence remains private and unchanged.",
        "yellow",
      ),
      card(
        "Official information",
        "Parents are responsible for providing an efficient, suitable full-time education for each child of compulsory school age.",
        {
          meta: "Department for Education",
          action: "Open GOV.UK source",
          tone: "blue",
        },
      ),
      card(
        "NexSteps summary",
        "A short education approach, recent learning examples and progress notes can help you explain your provision if asked.",
        { meta: "Human reviewed · 28 Jul 2026" },
      ),
      list(
        [
          {
            title: "Annual education summary",
            detail: "Maya · 1 Sep 2025–31 Aug 2026",
            meta: "Linked",
            target: "regulations-evidence",
          },
          {
            title: "Science project · Water filters",
            detail: "Learning sample · 22 July",
            meta: "Linked",
            target: "regulations-evidence",
          },
          {
            title: "Reading progress log",
            detail: "Last updated 25 July",
            meta: "Suggested",
            target: "regulations-evidence",
          },
        ],
        "How you can prepare",
      ),
      card(
        "Source history",
        "Effective 19 August 2024 · last checked 28 July 2026 · England only",
        { meta: "Current", action: "View verification" },
      ),
    ],
    primaryAction: "Link evidence",
    primaryTarget: "regulations-evidence",
    secondaryAction: "All requirements",
  },
  {
    id: "regulations-evidence",
    group: "regulations-evidence",
    eyebrow: "Family · Evidence",
    title: "Evidence vault",
    description:
      "Reuse private learning records and keep supporting documents organised.",
    tab: "Family",
    blocks: [
      stats([
        ["12", "Private records"],
        ["3", "Linked"],
        ["0", "Shared now"],
      ]),
      chips(
        ["All", "Plans", "Learning", "Reports", "Letters"],
        ["All"],
        "Category",
      ),
      list([
        {
          title: "Annual education summary",
          detail: "Maya · 1 Sep 2025–31 Aug 2026",
          meta: "2 links",
        },
        {
          title: "Water filter investigation",
          detail: "Science · 4 photos and reflection",
          meta: "Linked",
        },
        {
          title: "Reading progress log",
          detail: "English · updated 25 July",
          meta: "Unlinked",
          target: "regulations-evidence-upload",
        },
        {
          title: "Local authority letter",
          detail: "Received 4 September · PDF",
          meta: "Private",
          target: "regulations-correspondence-detail",
        },
      ]),
      notice(
        "One secure file",
        "Evidence already stored in Progress is linked here, not copied into another folder.",
      ),
    ],
    primaryAction: "Add supporting evidence",
    primaryTarget: "regulations-evidence-upload",
  },
  {
    id: "regulations-evidence-upload",
    group: "regulations-evidence",
    eyebrow: "Evidence · Add",
    title: "Add supporting evidence",
    description:
      "Choose an existing record or add a file, then link only what is relevant.",
    tab: "Family",
    blocks: [
      chips(
        ["Existing record", "Scan", "Photos", "File"],
        ["Existing record"],
        "Add from",
      ),
      card(
        "Reading progress log",
        "English · Maya · updated 25 July · already stored in Progress",
        { meta: "Selected", tone: "mint" },
      ),
      fields([
        ["Title", "Reading progress log"],
        ["Child", "Maya"],
        ["Date range", "1 June–25 July 2026"],
        ["Category", "Learning progress"],
      ]),
      list(
        [
          {
            title: "Show how learning remains suitable",
            detail: "England · household requirement",
            meta: "Link",
          },
          {
            title: "Annual education enquiry",
            detail: "Leeds City Council · due 14 September",
            meta: "Link",
          },
        ],
        "Link to",
      ),
      notice(
        "Private by default",
        "New files are encrypted and checked before they can be included in an evidence pack.",
        "blue",
      ),
    ],
    primaryAction: "Save and link evidence",
    primaryTarget: "regulations-correspondence",
    secondaryAction: "Back to evidence",
  },
  {
    id: "regulations-updates",
    group: "regulations-evidence",
    eyebrow: "Family · Official updates",
    title: "Official updates",
    description:
      "Only relevant, source-attributed changes for your selected jurisdiction.",
    tab: "Family",
    blocks: [
      chips(["All", "New", "Changed", "Effective soon"], ["All"]),
      list([
        {
          title: "Elective home education guidance updated",
          detail: "Department for Education · England",
          meta: "Changed",
          target: "regulations-update-detail",
        },
        {
          title: "Leeds annual enquiry information checked",
          detail: "Leeds City Council · no material change",
          meta: "Current",
        },
        {
          title: "Source correction published",
          detail: "Clarified date wording · no action needed",
          meta: "Reviewed",
          target: "regulations-update-detail",
        },
      ]),
      notice(
        "Verified before it reaches you",
        "Automated monitoring can find changes, but high-impact summaries are published only after human review.",
        "blue",
      ),
    ],
    primaryAction: "Open latest update",
    primaryTarget: "regulations-update-detail",
  },
  {
    id: "regulations-update-detail",
    group: "regulations-evidence",
    eyebrow: "Official update · England",
    title: "What changed in England",
    description:
      "Department for Education · effective 19 August 2024 · checked 28 July 2026",
    tab: "Family",
    blocks: [
      notice(
        "One checklist item may be affected",
        "Review how you would show that each child receives a suitable education.",
        "yellow",
      ),
      card(
        "What changed",
        "The local-authority guidance now references two attendance regulations that came into force on 19 August 2024.",
        { meta: "NexSteps summary · reviewed" },
      ),
      card(
        "Official source",
        "Elective home education · Department for Education · applies to England",
        {
          meta: "GOV.UK",
          action: "Read original",
          tone: "blue",
        },
      ),
      list(
        [
          {
            title: "Show how learning remains suitable",
            detail:
              "Review linked evidence and acknowledge this source version",
            meta: "Needs review",
            target: "regulations-requirement-detail",
          },
          {
            title: "Your current evidence",
            detail: "No files changed or shared",
            meta: "Private",
            target: "regulations-evidence",
          },
        ],
        "Possible impact for your family",
      ),
      notice(
        "Source distinction",
        "Official wording and the NexSteps summary are shown separately so you can inspect both.",
        "neutral",
      ),
    ],
    primaryAction: "Review affected requirement",
    primaryTarget: "regulations-requirement-detail",
    secondaryAction: "All updates",
  },
  {
    id: "regulations-correspondence",
    group: "regulations-evidence",
    eyebrow: "Family · Correspondence",
    title: "Correspondence",
    description:
      "Keep each letter, deadline, note and response together from the start.",
    tab: "Family",
    blocks: [
      notice(
        "Response due in 9 days",
        "Annual education enquiry · Maya · due 14 September",
        "yellow",
      ),
      list([
        {
          title: "Annual education enquiry",
          detail: "Leeds City Council · received 4 September",
          meta: "Preparing",
          target: "regulations-correspondence-detail",
        },
        {
          title: "Education approach acknowledgement",
          detail: "Sent 18 March · response saved",
          meta: "Closed",
          target: "regulations-correspondence-detail",
        },
      ]),
      card(
        "Nothing sent automatically",
        "You choose what to share and record when a response has been sent.",
        { meta: "You stay in control", tone: "mint" },
      ),
    ],
    primaryAction: "Add correspondence",
    primaryTarget: "regulations-correspondence-add",
  },
  {
    id: "regulations-correspondence-detail",
    group: "regulations-evidence",
    eyebrow: "Correspondence · Maya",
    title: "Annual enquiry",
    description:
      "Leeds City Council · received 4 September · response due 14 September",
    tab: "Family",
    blocks: [
      notice(
        "9 days remaining",
        "This deadline was confirmed by you from the original letter.",
        "yellow",
      ),
      card(
        "Original letter",
        "Annual-home-education-enquiry.pdf · 2 pages · file check complete",
        { meta: "Private", action: "Preview", tone: "blue" },
      ),
      list(
        [
          {
            title: "Review requested information",
            detail: "Completed 5 September",
            meta: "Done",
          },
          {
            title: "Prepare supporting evidence",
            detail: "3 suggested records available",
            meta: "Next",
            target: "regulations-pack-scope",
          },
          {
            title: "Record response sent",
            detail: "Add date and delivery method",
            meta: "Later",
          },
        ],
        "Response plan",
      ),
      card(
        "Private note",
        "Include our annual summary, the water-filter project and reading progress. Exclude medical information.",
        { meta: "Only your family sees this" },
      ),
    ],
    primaryAction: "Prepare evidence pack",
    primaryTarget: "regulations-pack-scope",
    secondaryAction: "All correspondence",
  },
  {
    id: "regulations-correspondence-add",
    group: "regulations-evidence",
    eyebrow: "Correspondence · Add",
    title: "Add correspondence",
    description:
      "Capture the original first, then confirm the details that matter.",
    tab: "Family",
    blocks: [
      card(
        "Annual-home-education-enquiry.pdf",
        "2 pages · uploaded from Files · checking complete",
        { meta: "Ready", action: "Replace", tone: "mint" },
      ),
      fields([
        ["From", "Leeds City Council"],
        ["Received", "4 September 2026"],
        ["Response due", "14 September 2026"],
        ["Reference", "EHE-2026-1042"],
      ]),
      chips(["Household", "Maya", "Leo"], ["Maya"], "Applies to"),
      notice(
        "You confirm extracted details",
        "NexSteps can suggest the sender and dates, but nothing is saved until you check them.",
        "blue",
      ),
    ],
    primaryAction: "Save correspondence",
    primaryTarget: "regulations-correspondence-detail",
    secondaryAction: "Back",
  },
  {
    id: "regulations-pack-scope",
    group: "regulations-evidence",
    eyebrow: "Evidence pack · 1 of 4",
    title: "Prepare an evidence pack",
    description:
      "Start with the request so NexSteps suggests only relevant records.",
    tab: "Family",
    blocks: [
      fields([
        ["For", "Annual education enquiry"],
        ["Child", "Maya"],
        ["Learning period", "1 Sep 2025–31 Aug 2026"],
        ["Requested by", "Leeds City Council"],
      ]),
      list(
        [
          {
            title: "Education approach",
            detail: "How learning is planned and adapted",
            meta: "Requested",
          },
          {
            title: "Recent learning and progress",
            detail: "A small representative selection",
            meta: "Requested",
          },
        ],
        "Request scope",
      ),
      notice(
        "Share the minimum needed",
        "Suggestions use your existing links and dates. Sensitive or unrelated records stay excluded.",
        "mint",
      ),
    ],
    primaryAction: "Choose supporting evidence",
    primaryTarget: "regulations-pack-evidence",
    secondaryAction: "Back to correspondence",
  },
  {
    id: "regulations-pack-evidence",
    group: "regulations-evidence",
    eyebrow: "Evidence pack · 2 of 4",
    title: "Choose supporting evidence",
    description:
      "Three relevant records are selected. You can add, remove or reorder them.",
    tab: "Family",
    blocks: [
      stats([
        ["3", "Selected"],
        ["8", "Excluded"],
        ["0", "Pending checks"],
      ]),
      list([
        {
          title: "Annual education summary",
          detail: "6 pages · 1 Sep 2025–31 Aug 2026",
          meta: "Selected",
        },
        {
          title: "Water filter investigation",
          detail: "4 photos and Maya's reflection",
          meta: "Selected",
        },
        {
          title: "Reading progress log",
          detail: "3 pages · updated 25 July",
          meta: "Selected",
        },
        {
          title: "Support-needs information",
          detail: "Sensitive · unrelated to this request",
          meta: "Excluded",
        },
      ]),
      card(
        "Add another record",
        "Browse the Evidence vault without changing the originals.",
        {
          action: "Browse evidence",
          target: "regulations-evidence",
          tone: "yellow",
        },
      ),
    ],
    primaryAction: "Preview evidence pack",
    primaryTarget: "regulations-pack-preview",
    secondaryAction: "Change scope",
  },
  {
    id: "regulations-pack-preview",
    group: "regulations-evidence",
    eyebrow: "Evidence pack · 3 of 4",
    title: "Review exactly what is shared",
    description:
      "Check the cover, attachment order and sensitive details before continuing.",
    tab: "Family",
    blocks: [
      notice(
        "Nothing has been shared",
        "This is a private preview. Export or secure sharing happens only after your confirmation.",
        "yellow",
      ),
      card(
        "Cover summary",
        "Brown family · Maya · learning period 1 Sep 2025–31 Aug 2026 · prepared 5 September",
        { meta: "Page 1", action: "Edit summary", tone: "mint" },
      ),
      list(
        [
          {
            title: "1 · Annual education summary",
            detail: "6 pages · no redactions",
            meta: "Included",
          },
          {
            title: "2 · Water filter investigation",
            detail: "4 photos · location metadata removed",
            meta: "Included",
          },
          {
            title: "3 · Reading progress log",
            detail: "3 pages · parent email redacted",
            meta: "Included",
          },
        ],
        "Pack contents",
      ),
      card(
        "Excluded sensitive record",
        "Support-needs information is not relevant to this request and remains private.",
        { meta: "Not included" },
      ),
      informationNotice,
    ],
    primaryAction: "Continue to export or share",
    primaryTarget: "regulations-pack-share",
    secondaryAction: "Back to evidence selection",
  },
  {
    id: "regulations-pack-share",
    group: "regulations-evidence",
    eyebrow: "Evidence pack · 4 of 4",
    title: "Export or share securely",
    description:
      "Download the finished pack or create short-lived access you can revoke.",
    tab: "Family",
    blocks: [
      chips(["Download myself", "Secure link"], ["Secure link"], "Delivery"),
      fields([
        ["Recipient label", "Leeds EHE team"],
        ["Access expires", "12 September 2026 · 7 days"],
        ["Passcode", "Required · send separately"],
      ]),
      card(
        "Download instead",
        "One PDF cover and evidence index, plus the selected original attachments.",
        { meta: "PDF + files", action: "Export pack" },
      ),
      notice(
        "Private, short-lived access",
        "The link is not public, is never indexed and can be revoked at any time.",
        "blue",
      ),
      notice(
        "You choose when to send it",
        "NexSteps creates access but does not contact the recipient for you.",
        "neutral",
      ),
    ],
    primaryAction: "Create secure link",
    primaryTarget: "regulations-share-confirmation",
    secondaryAction: "Back to preview",
  },
  {
    id: "regulations-share-confirmation",
    group: "regulations-evidence",
    eyebrow: "Evidence pack · Ready",
    title: "Secure link created",
    description:
      "Access is ready for Leeds EHE team and expires automatically in seven days.",
    tab: "Family",
    blocks: [
      notice(
        "Pack ready",
        "Three evidence items · link expires 12 September · passcode required",
        "mint",
      ),
      card(
        "Annual enquiry · Maya",
        "Pack version 1 · created 5 September at 10:24",
        { meta: "Private link", action: "Copy link", tone: "blue" },
      ),
      list([
        {
          title: "Share link",
          detail: "Copy into your own email or response",
          meta: "Ready",
        },
        {
          title: "Passcode",
          detail: "Send separately from the link",
          meta: "Protected",
        },
        {
          title: "Access activity",
          detail: "See views and downloads",
          meta: "Open",
          target: "regulations-share-activity",
        },
      ]),
    ],
    primaryAction: "View access activity",
    primaryTarget: "regulations-share-activity",
    secondaryAction: "Change sharing",
  },
  {
    id: "regulations-share-activity",
    group: "regulations-evidence",
    eyebrow: "Evidence pack · Activity",
    title: "Access activity",
    description:
      "A clear history of who used this secure link and when it expires.",
    tab: "Family",
    blocks: [
      stats([
        ["1", "View"],
        ["1", "Download"],
        ["6 days", "Until expiry"],
      ]),
      list(
        [
          {
            title: "Downloaded",
            detail: "Leeds EHE team · today at 14:12",
            meta: "Recorded",
          },
          {
            title: "Opened",
            detail: "Leeds EHE team · today at 14:09",
            meta: "Recorded",
          },
          {
            title: "Link created",
            detail: "You · 5 September at 10:24",
            meta: "Recorded",
          },
        ],
        "Audit history",
      ),
      card(
        "Secure link active",
        "Expires 12 September at 10:24. Revoking it does not delete your private evidence pack.",
        { meta: "6 days", action: "Copy link", tone: "blue" },
      ),
      notice(
        "Need to stop access?",
        "Revoke the link immediately. Anyone who already downloaded the pack may still retain that copy.",
        "yellow",
      ),
    ],
    primaryAction: "Revoke secure link",
    primaryTarget: "regulations-overview",
    secondaryAction: "Return to preparedness",
  },
];
