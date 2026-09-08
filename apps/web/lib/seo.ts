import type { Metadata, MetadataRoute } from "next";

export const SITE_ORIGIN = "https://www.nexsteps.dev";
export const SITE_NAME = "Nexsteps";
export const PUBLISHER_ID = `${SITE_ORIGIN}/#organization`;

type PublicPage = {
  path: string;
  title: string;
  description: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

export const publicPages = [
  {
    path: "/",
    title: "Connected Operations Software for Schools and Clubs",
    description:
      "Nexsteps brings attendance, team scheduling, family communication, safeguarding and reporting into one connected workspace.",
    changeFrequency: "monthly",
    priority: 1,
  },
  {
    path: "/schools",
    title: "School Operations Software for Teams and Families",
    description:
      "Connect attendance, staff coordination, family communication and operational records for school teams.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/homeschool",
    title: "NexSteps Home: Home Education Planning and Records",
    description:
      "Plan home education, keep learning records and follow the NexSteps Home early-access journey.",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/clubs",
    title: "Club Management Software for Children’s Activities",
    description:
      "Coordinate sessions, teams, attendance and family communication for clubs and children’s activities.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/churches",
    title: "Church Youth and Children’s Ministry Software",
    description:
      "Coordinate people, sessions, attendance and family communication across church children and youth activities.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/charities",
    title: "Programme Operations Software for Charities",
    description:
      "Coordinate programme delivery, teams, attendance and useful reporting for charities.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/features/attendance",
    title: "Attendance Tracking Software for Clubs and Schools",
    description:
      "Explore Nexsteps attendance tools for registers, team coordination and reporting across clubs and schools.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/features/teams-scheduling",
    title: "Staff and Volunteer Scheduling Software",
    description:
      "Coordinate team availability, assignments, rota coverage and schedule changes in one connected workflow.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/features/family-communication",
    title: "Parent and Family Communication Software",
    description:
      "Keep family communication connected to the sessions, teams and operational context behind each update.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/features/safeguarding",
    title: "Safeguarding Records and Concern Reporting Software",
    description:
      "Understand how Nexsteps supports restricted safeguarding records, concern reporting and accountable follow-up.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/features/reporting",
    title: "Attendance and Programme Reporting Software",
    description:
      "Bring attendance, staffing and programme information together for clearer operational reporting.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/configure",
    title: "Nexsteps Pricing and Plans",
    description:
      "Compare Nexsteps plans and configure an organisation workspace with clear published pricing.",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/security",
    title: "Nexsteps Security, Privacy and Data Handling",
    description:
      "Read how Nexsteps approaches access, data handling, infrastructure and operational security.",
    changeFrequency: "yearly",
    priority: 0.6,
  },
  {
    path: "/blog",
    title: "Guides to Children’s Programme Operations",
    description:
      "Practical guides covering attendance, safeguarding, team coordination and programme operations.",
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    path: "/demo",
    title: "Book a Nexsteps Demo",
    description:
      "Book a demonstration of Nexsteps for your school, club, church or charity.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/trial",
    title: "Join the Nexsteps Trial Waitlist",
    description:
      "Join the Nexsteps trial waitlist and hear when trial access becomes available.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/readiness-score",
    title: "Operations and Safeguarding Readiness Score",
    description:
      "Assess operational and safeguarding readiness and identify practical next steps.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/toolkit",
    title: "Operations Toolkit",
    description:
      "Download operational templates for attendance, incidents, concerns, consent and volunteer onboarding.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/team-tracker",
    title: "Free One-Page Team Tracker",
    description:
      "Download a free workbook for organising people, sessions, attendance and follow-ups in one weekly view.",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "Read the Nexsteps privacy policy.",
    changeFrequency: "yearly",
    priority: 0.5,
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description: "Read the Nexsteps terms of service.",
    changeFrequency: "yearly",
    priority: 0.5,
  },
  {
    path: "/cookies",
    title: "Cookie Policy",
    description: "Read how the Nexsteps website uses cookies.",
    changeFrequency: "yearly",
    priority: 0.5,
  },
] as const satisfies readonly PublicPage[];

export function absoluteContentUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Expected a same-site absolute path");
  }

  const url = new URL(path, SITE_ORIGIN);
  if (url.origin !== SITE_ORIGIN || url.search || url.hash) {
    throw new Error("Content canonical must not contain a query or fragment");
  }

  return url.href;
}

type PageMetadataInput = {
  path: string;
  title: string;
  description: string;
  imagePath?: string;
};

export function buildPageMetadata({
  path,
  title,
  description,
  imagePath = "/hero/nexsteps-hero-poster.webp",
}: PageMetadataInput): Metadata {
  const canonical = absoluteContentUrl(path);
  const image = absoluteContentUrl(imagePath);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_GB",
      title,
      description,
      url: canonical,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

type ArticleMetadataInput = {
  path: string;
  title: string;
  description?: string;
  publishedAt?: string;
  updatedAt: string;
  imagePath?: string;
};

export function buildArticleMetadata({
  path,
  title,
  description,
  publishedAt,
  updatedAt,
  imagePath,
}: ArticleMetadataInput): Metadata {
  const canonical = absoluteContentUrl(path);
  const image = imagePath ? absoluteContentUrl(imagePath) : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "en_GB",
      title,
      description,
      url: canonical,
      publishedTime: publishedAt,
      modifiedTime: updatedAt,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export function metadataForPath(path: string): Metadata {
  const page = publicPages.find((candidate) => candidate.path === path);
  if (!page) throw new Error(`Unknown public page: ${path}`);
  return buildPageMetadata(page);
}

export function buildStaticSitemap(): MetadataRoute.Sitemap {
  return publicPages.map((page) => ({
    url: absoluteContentUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": PUBLISHER_ID,
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/NSLogo.svg`,
  };
}

type ArticleJsonLdInput = {
  path: string;
  title: string;
  description?: string;
  publishedAt?: string;
  updatedAt: string;
  authorName: string | null;
  imageUrl?: string;
};

export function articleJsonLd({
  path,
  title,
  description,
  publishedAt,
  updatedAt,
  authorName,
  imageUrl,
}: ArticleJsonLdInput): Record<string, unknown> & {
  author: Record<string, unknown>;
} {
  const canonical = absoluteContentUrl(path);
  const normalizedAuthor = authorName?.trim().toLowerCase();
  const isBrandedAuthor =
    !normalizedAuthor ||
    normalizedAuthor === SITE_NAME.toLowerCase() ||
    normalizedAuthor === `${SITE_NAME.toLowerCase()} editorial team`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    ...(description ? { description } : {}),
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    dateModified: updatedAt,
    author: isBrandedAuthor
      ? { "@id": PUBLISHER_ID }
      : { "@type": "Person", name: authorName },
    publisher: { "@id": PUBLISHER_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    ...(imageUrl ? { image: imageUrl } : {}),
  };
}

export function breadcrumbJsonLd(
  items: readonly { name: string; path: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteContentUrl(item.path),
    })),
  };
}

export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
