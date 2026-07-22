const BLOG_FAQS = [
  {
    question: "What is Nexsteps?",
    answer:
      "Nexsteps is a connected operations platform for schools, clubs, churches, and charities. It brings attendance, teams, family communication, safeguarding, and reporting into one system.",
  },
  {
    question: "Who are the Nexsteps resources for?",
    answer:
      "The resources are written for leaders, administrators, staff, and volunteers who manage programmes involving children and need practical guidance for safer, clearer day-to-day operations.",
  },
  {
    question: "What topics do the Nexsteps blog articles cover?",
    answer:
      "Articles cover safeguarding, attendance, rotas and staffing, family communication, reporting, and the operational practices that help organisations run consistent programmes.",
  },
  {
    question: "Can Nexsteps help my organisation improve its operations?",
    answer:
      "Yes. Nexsteps helps organisations replace disconnected spreadsheets and manual handovers with shared workflows, clearer records, and role-based access. You can request a demo to discuss your organisation's needs.",
  },
] as const;

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: BLOG_FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function BlogFaq() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <section
        aria-labelledby="blog-faq-title"
        className="mt-16 rounded-2xl border border-border-subtle bg-surface p-6 md:p-8"
      >
        <div className="max-w-3xl">
          <h2
            id="blog-faq-title"
            className="text-2xl font-bold text-text-primary md:text-3xl"
          >
            Frequently asked questions
          </h2>
          <p className="mt-3 text-text-muted">
            Practical answers about Nexsteps and the topics covered in our
            resources.
          </p>
        </div>
        <div className="mt-6 divide-y divide-border-subtle">
          {BLOG_FAQS.map((faq) => (
            <details
              key={faq.question}
              className="group py-5 first:pt-0 last:pb-0"
            >
              <summary className="cursor-pointer list-none pr-8 text-base font-semibold text-text-primary marker:hidden group-open:text-accent-strong">
                {faq.question}
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-text-muted">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
