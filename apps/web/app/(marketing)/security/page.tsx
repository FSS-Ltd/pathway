import type { Metadata } from "next";
import Link from "next/link";
import { securityContent } from "../../../content/security-content";

export const metadata: Metadata = {
  title: "Security, Safeguarding & Compliance | Nexsteps",
  description:
    "Learn how Nexsteps protects data with secure architecture, GDPR-aligned controls, role-based access, and safeguarding workflows.",
};

export default function SecurityPage() {
  const { hero, sections, lastUpdated } = securityContent;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-16 md:py-24">
      {/* Hero Section */}
      <section className="flex flex-col gap-6 text-center">
        <h1 className="text-4xl font-bold text-pw-text md:text-5xl">{hero.title}</h1>
        <p className="mx-auto max-w-3xl text-lg text-pw-text-muted">
          {hero.description}
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href={hero.primaryCta.href}
            className="rounded-md bg-pw-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-blue-600"
          >
            {hero.primaryCta.label}
          </Link>
          <Link
            href={hero.secondaryCta.href}
            className="rounded-md border border-pw-border bg-white px-6 py-3 text-base font-medium text-pw-text transition hover:bg-pw-surface"
          >
            {hero.secondaryCta.label}
          </Link>
        </div>
      </section>

      {/* Tenant Isolation */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">
          {sections.tenantIsolation.title}
        </h2>
        <div className="flex flex-col gap-3 text-pw-text-muted">
          {sections.tenantIsolation.content.map((paragraph, index) => (
            <p key={index} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Roles & Permissions */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">
          {sections.rolesPermissions.title}
        </h2>
        <div className="flex flex-col gap-3 text-pw-text-muted">
          {sections.rolesPermissions.content.map((item, index) => (
            <p key={index} className="leading-relaxed">
              {item}
            </p>
          ))}
        </div>
      </section>

      {/* Auditability */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">
          {sections.auditability.title}
        </h2>
        <div className="flex flex-col gap-3 text-pw-text-muted">
          {sections.auditability.content.map((paragraph, index) => (
            <p key={index} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Data Retention & DSAR */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">
          {sections.dataRetention.title}
        </h2>
        <div className="flex flex-col gap-3 text-pw-text-muted">
          {sections.dataRetention.content.map((paragraph, index) => (
            <p key={index} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Media Handling */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">
          {sections.mediaHandling.title}
        </h2>
        <div className="flex flex-col gap-3 text-pw-text-muted">
          {sections.mediaHandling.content.map((paragraph, index) => (
            <p key={index} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Security Controls Summary */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-6 text-2xl font-semibold text-pw-text">
          {sections.securityControls.title}
        </h2>
        <div className="space-y-4">
          {sections.securityControls.controls.map((control, index) => (
            <div key={index} className="border-l-4 border-pw-primary pl-4">
              <h3 className="mb-2 text-lg font-semibold text-pw-text">
                {control.control}
              </h3>
              <p className="text-pw-text-muted leading-relaxed">
                {control.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Data Locations */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">
          {sections.dataLocations.title}
        </h2>
        <div className="flex flex-col gap-3 text-pw-text-muted">
          {sections.dataLocations.content.map((paragraph, index) => (
            <p key={index} className="leading-relaxed">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Safeguarding & Least Privilege */}
      <section className="rounded-xl border border-pw-border bg-white p-6 md:p-8">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">
          {sections.safeguarding.title}
        </h2>
        <div className="flex flex-col gap-3 text-pw-text-muted">
          {sections.safeguarding.content.map((item, index) => (
            <p key={index} className="leading-relaxed">
              {item}
            </p>
          ))}
        </div>
      </section>

      {/* Last Updated */}
      <div className="border-t border-pw-border pt-6 text-center text-sm text-pw-text-muted">
        <p>Last updated: {lastUpdated}</p>
      </div>
    </div>
  );
}
