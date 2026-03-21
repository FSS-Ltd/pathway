export type SectorId = "schools" | "clubs" | "churches" | "charities";

export interface SectorDefinition {
  id: SectorId;
  name: string;
  slug: string;
  heroTitle: string;
  heroSubtitle: string;
  fragmentedToolsCopy: string;
  examplesSectionTitle: string;
  examples: string[];
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaHref: string;
  keyBenefits: string[];
  benefitsSectionTitle?: string;
}

export const sectors: SectorDefinition[] = [
  {
    id: "schools",
    name: "Schools",
    slug: "schools",
    heroTitle: "Connected operations for schools",
    heroSubtitle:
      "Run attendance, teams, family communication, and safeguarding from one connected system built for school operations.",
    fragmentedToolsCopy:
      "Replace disconnected spreadsheets, group chats, parent apps, and stand-alone logs with one workflow for school operations.",
    examplesSectionTitle: "School examples",
    examples: [
      "Coordinate classroom cover and session changes without losing attendance context.",
      "Keep parent communications aligned with what staff are seeing in real time.",
      "Support pastoral and safeguarding follow-through with structured records.",
    ],
    primaryCtaLabel: "Book a demo",
    secondaryCtaLabel: "View pricing",
    primaryCtaHref: "/demo?sector=schools",
    secondaryCtaHref: "/pricing",
    keyBenefits: [
      "Attendance tracking with offline capture and sync",
      "Rota and timetable management",
      "Safeguarding notes and concerns workflow",
      "Parent communication and announcements",
      "Multi-site support for academies and MATs",
      "GDPR-compliant data handling",
    ],
    benefitsSectionTitle: "Operational outcomes for schools",
  },
  {
    id: "clubs",
    name: "Clubs",
    slug: "clubs",
    heroTitle: "Connected operations for clubs",
    heroSubtitle:
      "Coordinate attendance, teams, family communication, and safeguarding in one connected operating system for clubs and programmes.",
    fragmentedToolsCopy:
      "Replace rota spreadsheets, coach group chats, separate parent messaging tools, and isolated logs with one connected system.",
    examplesSectionTitle: "Club examples",
    examples: [
      "Run multi-group sessions with clearer staffing and attendance visibility.",
      "Keep volunteers, staff, and families aligned on session updates.",
      "Capture concerns and follow-up actions in structured records.",
    ],
    primaryCtaLabel: "Book a demo",
    secondaryCtaLabel: "View pricing",
    primaryCtaHref: "/demo?sector=clubs",
    secondaryCtaHref: "/pricing",
    keyBenefits: [
      "Manage multiple age groups and classes",
      "Track attendance across sessions",
      "Coordinate volunteers and staff rotas",
      "Send announcements to parents",
      "Offline-first mobile app for on-the-go capture",
      "Secure, GDPR-compliant data handling",
    ],
    benefitsSectionTitle: "Operational outcomes for clubs",
  },
  {
    id: "churches",
    name: "Churches",
    slug: "churches",
    heroTitle: "Connected operations for churches",
    heroSubtitle:
      "Keep attendance, teams, family communication, and safeguarding connected across church children and youth activities.",
    fragmentedToolsCopy:
      "Replace disconnected attendance sheets, leader chats, separate family updates, and manual logs with one operational flow.",
    examplesSectionTitle: "Church examples",
    examples: [
      "Coordinate volunteers and group leaders across multiple age bands.",
      "Keep families updated as plans change across services and activities.",
      "Maintain structured records for care and safeguarding follow-up.",
    ],
    primaryCtaLabel: "Book a demo",
    secondaryCtaLabel: "View pricing",
    primaryCtaHref: "/demo?sector=churches",
    secondaryCtaHref: "/pricing",
    keyBenefits: [
      "Manage children and youth programmes",
      "Track attendance and participation",
      "Coordinate volunteers and leaders",
      "Secure safeguarding workflows",
      "GDPR-compliant data handling",
      "Parent communication and announcements",
    ],
    benefitsSectionTitle: "Operational outcomes for churches",
  },
  {
    id: "charities",
    name: "Charities",
    slug: "charities",
    heroTitle: "Connected operations for charities",
    heroSubtitle:
      "Bring attendance, teams, family communication, and safeguarding together in one connected system for programme delivery.",
    fragmentedToolsCopy:
      "Replace siloed spreadsheets, volunteer chats, separate communication tools, and fragmented records with one connected platform.",
    examplesSectionTitle: "Charity examples",
    examples: [
      "Coordinate delivery teams across sites and programme sessions.",
      "Keep families and stakeholders aligned with clearer communication flows.",
      "Record sensitive concerns in a consistent, structured way.",
    ],
    primaryCtaLabel: "Book a demo",
    secondaryCtaLabel: "View pricing",
    primaryCtaHref: "/demo?sector=charities",
    secondaryCtaHref: "/pricing",
    keyBenefits: [
      "Manage children and youth programmes",
      "Track attendance and participation",
      "Coordinate volunteers and staff",
      "Secure safeguarding workflows",
      "GDPR-compliant data handling",
      "Parent and guardian communication",
    ],
    benefitsSectionTitle: "Operational outcomes for charities",
  },
];

export function getSectorById(id: SectorId): SectorDefinition | undefined {
  return sectors.find((s) => s.id === id);
}

export function getSectorBySlug(slug: string): SectorDefinition | undefined {
  return sectors.find((s) => s.slug === slug);
}
