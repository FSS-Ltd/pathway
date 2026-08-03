import type { Metadata } from "next";
import HomeschoolLandingPage from "../../../components/homeschool/homeschool-landing-page";
import { homeschoolFaqs } from "../../../components/homeschool/homeschool-content";

const pageUrl = "https://nexsteps.dev/homeschool";
const pageDescription =
  "Plan your homeschool week, keep learning records and evidence, find private community connections, and stay prepared with NexSteps Home.";
const directAnswer = {
  heading: "What is NexSteps Home?",
  body: "NexSteps Home is a homeschool planner and learning-record app for families. It brings weekly planning, daily focus, evidence, private community connections, and UK-first preparedness into one calm place.",
};

export const metadata: Metadata = {
  title: { absolute: "Homeschool Planner App for UK Families | Nexsteps" },
  description: pageDescription,
  alternates: { canonical: "/homeschool" },
  keywords: [
    "homeschool planner app",
    "home education planner UK",
    "homeschool learning records",
    "home education evidence",
    "homeschool community UK",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    url: pageUrl,
    title: "Homeschool Planner App for UK Families | Nexsteps",
    description: pageDescription,
    siteName: "Nexsteps",
    images: [
      {
        url: "/images/homeschool/week-home.png",
        width: 430,
        height: 932,
        alt: "NexSteps Home family week planner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Homeschool Planner App for UK Families | Nexsteps",
    description: pageDescription,
    images: ["/images/homeschool/week-home.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: "Homeschool Planner App for UK Families | Nexsteps",
      description: pageDescription,
      inLanguage: "en-GB",
      about: { "@id": `${pageUrl}#software` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${pageUrl}#software`,
      name: "NexSteps Home",
      applicationCategory: "EducationalApplication",
      operatingSystem: "iOS, Android",
      description: directAnswer.body,
      audience: {
        "@type": "Audience",
        audienceType: "Home-educating parents and trusted adults",
        geographicArea: { "@type": "Country", name: "United Kingdom" },
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: homeschoolFaqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

export default function HomeschoolPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <HomeschoolLandingPage directAnswer={directAnswer} />
    </>
  );
}
