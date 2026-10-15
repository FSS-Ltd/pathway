import type { ReactNode } from "react";
import type { LegalDocument } from "@pathway/types";

type LegalDocumentPageProps = {
  document: LegalDocument;
  introduction: ReactNode;
  children: ReactNode;
};

export function LegalDocumentPage({
  document,
  introduction,
  children,
}: LegalDocumentPageProps) {
  return (
    <article className="mx-auto max-w-4xl px-4 py-12 md:py-20">
      <header className="mb-8 border-b border-pw-border pb-8 md:mb-10">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-pw-accent-strong">
          Nexsteps legal
        </p>
        <h1 className="text-3xl font-bold text-pw-text md:text-4xl">
          {document.title}
        </h1>
        <p className="mt-3 text-sm text-pw-text-muted">
          Version {document.version} · Effective {document.effectiveDate}
        </p>
        <div className="mt-5 max-w-3xl text-base leading-7 text-pw-text-muted">
          {introduction}
        </div>
      </header>
      <div className="prose prose-sm max-w-none rounded-xl border border-pw-border bg-white p-5 text-pw-text sm:p-8 md:prose-base">
        {children}
      </div>
    </article>
  );
}
