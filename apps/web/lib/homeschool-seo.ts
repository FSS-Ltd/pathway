import { homeschoolFaqs } from "../components/homeschool/homeschool-content";
import { SITE_ORIGIN } from "./seo";

const pageUrl = `${SITE_ORIGIN}/homeschool`;
const pageDescription =
  "Plan your homeschool week, keep learning records and evidence, find private community connections, and stay prepared with NexSteps Home.";

export const homeschoolDirectAnswer = {
  heading: "What is NexSteps Home?",
  body: "NexSteps Home is a homeschool planner and learning-record app for families. It brings weekly planning, daily focus, evidence, private community connections, and UK-first preparedness into one calm place.",
};

export const homeschoolStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: "NexSteps Home: Home Education Planning and Records",
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
      description: homeschoolDirectAnswer.body,
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
