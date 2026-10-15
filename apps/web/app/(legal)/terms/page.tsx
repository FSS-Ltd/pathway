import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FileText, UserCheck, Scale } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Nexsteps Terms of Service. Read our terms and conditions.",
};

const LegalList = ({ children }: { children: ReactNode }) => (
  <ul className="mt-2 list-disc list-inside space-y-1 text-pw-text-muted">{children}</ul>
);

export default function TermsPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold text-pw-text">Terms of Service</h1>
        <p className="text-sm text-pw-text-muted">Last updated: 15 October 2026</p>
      </div>

      {/* Summary cards */}
      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-pw-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">Service overview</h2>
          </div>
          <p className="mt-2 text-sm text-pw-text-muted">
            Nexsteps is a UK-based SaaS platform for schools, churches, clubs and charities to manage
            sessions, attendance, staff and parent communication. Organisations that subscribe to the Service
            agree to these Terms and are responsible for how their users access it.
          </p>
        </article>

        <article className="rounded-xl border border-pw-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">Your responsibilities</h2>
          </div>
          <LegalList>
            <li>Keep account details accurate and access credentials secure.</li>
            <li>Assign appropriate roles and permissions to staff and volunteers.</li>
            <li>Ensure use of Nexsteps complies with law and safeguarding policies.</li>
            <li>Pay subscription fees on time and manage billing information.</li>
          </LegalList>
        </article>

        <article className="rounded-xl border border-pw-border bg-white p-6 md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Scale className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">Key legal points</h2>
          </div>
          <LegalList>
            <li>Fees are billed via Stripe under your agreed subscription plan.</li>
            <li>
              Nexsteps limits its liability to a reasonable cap and excludes certain indirect losses, as set
              out below.
            </li>
            <li>
              Data protection obligations are shared: you act as controller and Nexsteps primarily as
              processor under UK GDPR.
            </li>
            <li>These Terms are governed by the laws of England and Wales.</li>
          </LegalList>
        </article>
      </section>

      {/* Full terms text */}
      <section className="prose prose-sm max-w-none">
        <div className="rounded-xl border border-pw-border bg-white p-6 space-y-4">
          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            1. Acceptance of these terms
          </h2>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern an organisation&apos;s subscription to the Nexsteps
            platform, websites and related services (together, the &quot;Service&quot;). Individual account holders
            use the Service under the separate <a href="/user-agreement">User Agreement</a>. Creating an
            individual account does not bind an organisation to these Terms or its payment obligations.
          </p>
          <p>
            These Terms bind an organisation (for example, a school, church, club or charity) when its
            authorised representative accepts them on its behalf. References to &quot;you&quot; or
            &quot;Customer&quot; mean that organisation.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            2. Service description
          </h2>
          <p>
            Nexsteps is a UK-based SaaS platform that helps organisations manage programmes involving children,
            young people, staff and volunteers. Core features include, among others:
          </p>
          <LegalList>
            <li>Managing sites (for example, schools, churches, locations) and groups/classes</li>
            <li>Scheduling sessions and rotas</li>
            <li>Recording attendance</li>
            <li>Managing staff and volunteer assignments</li>
            <li>
              Recording pastoral and safeguarding-related notes in accordance with the organisation&apos;s
              policies
            </li>
            <li>Communicating with parents/guardians and staff (for example, announcements)</li>
          </LegalList>
          <p>
            We may update, improve or change the Service from time to time. Where we make material changes, we
            will take reasonable steps to notify you in advance where practicable.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            3. Account registration and responsibilities
          </h2>
          <p>
            To use Nexsteps, your organisation must create an account and designate one or more administrators
            with authority to manage access for other users. You are responsible for:
          </p>
          <LegalList>
            <li>Ensuring that registration information is accurate and kept up to date</li>
            <li>
              Controlling access to your organisation&apos;s Nexsteps account, including assigning appropriate
              roles and permissions
            </li>
            <li>
              Ensuring that users keep their login credentials (for example, passwords) secure and do not share
              them with others
            </li>
            <li>
              Promptly notifying us if you become aware of any unauthorised access to your account or the
              Service
            </li>
          </LegalList>
          <p>
            You are responsible for all activities that occur under your organisation&apos;s account, except to
            the extent caused by Nexsteps&apos; breach of these Terms.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            4. Safeguarding and compliance responsibilities
          </h2>
          <p>
            Nexsteps is a tool to support your organisation&apos;s operations; it does not replace your legal or
            professional safeguarding obligations. In particular:
          </p>
          <LegalList>
            <li>
              You remain solely responsible for complying with applicable law, statutory guidance, and your own
              safeguarding and child protection policies.
            </li>
            <li>
              You are responsible for deciding which information is appropriate to record in Nexsteps and for
              ensuring that any safeguarding and pastoral records are handled in accordance with your legal
              obligations and internal policies.
            </li>
            <li>
              You must ensure that only appropriately authorised staff and volunteers are granted access to
              safeguarding-related functionality and records.
            </li>
            <li>
              You are responsible for training your staff and volunteers in safe and appropriate use of the
              Service.
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            5. Acceptable use
          </h2>
          <p>
            You must use the Service in a lawful, responsible and reasonable manner. You agree that you will not
            (and will not permit others to):
          </p>
          <LegalList>
            <li>Use the Service in any way that breaches applicable law or regulation</li>
            <li>
              Upload or share content that is unlawful, harmful, defamatory, discriminatory or otherwise
              inappropriate
            </li>
            <li>
              Attempt to gain unauthorised access to the Service or to data belonging to other organisations
            </li>
            <li>
              Copy, modify, reverse engineer, decompile or otherwise attempt to derive the source code of the
              Service (except to the extent this cannot be prohibited by law)
            </li>
            <li>Use the Service to send spam or unsolicited marketing communications</li>
            <li>
              Interfere with or disrupt the integrity or performance of the Service (for example, by introducing
              malware or conducting denial-of-service attacks)
            </li>
          </LegalList>
          <p>
            We may suspend or restrict access to the Service if we reasonably believe that there has been a
            breach of these acceptable use requirements, or where necessary to protect the security, integrity or
            availability of the Service.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            6. Fees and billing
          </h2>
          <p>
            Nexsteps is provided on a subscription basis. Fees, billing frequency, and usage limits (for example,
            based on active staff/volunteers or sites) are as agreed between Nexsteps and your organisation in
            the applicable order form or subscription plan.
          </p>
          <p>Unless otherwise agreed:</p>
          <LegalList>
            <li>Fees are payable in advance for each billing period.</li>
            <li>
              Payments are processed by our third-party payment provider, Stripe. Stripe is responsible for
              handling payment card details in compliance with PCI-DSS.
            </li>
            <li>
              If a payment is unsuccessful or overdue, we may suspend access to the Service until payment is
              received.
            </li>
            <li>All fees are exclusive of VAT or other applicable taxes unless stated otherwise.</li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            7. Suspension and termination
          </h2>
          <p>
            You may terminate your subscription at the end of the current billing period by following the
            cancellation process notified to you or agreed in your contract. We may terminate or suspend your
            access to the Service:
          </p>
          <LegalList>
            <li>If you materially breach these Terms and do not remedy the breach (where remediable)</li>
            <li>If you fail to pay any fees when due</li>
            <li>If we reasonably consider it necessary to protect the Service or other customers</li>
          </LegalList>
          <p>
            On termination, your access to the Service will cease. We will work with you to export data where
            requested, and then delete or anonymise personal data in line with our Privacy Policy and any
            applicable data processing agreement.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            8. Intellectual property
          </h2>
          <p>
            Nexsteps (and/or its licensors) owns all intellectual property rights in and to the Service,
            including the underlying software, design, databases, and documentation. Except as expressly set out
            in these Terms, nothing grants you any rights in or to the Service, the Nexsteps name or any related
            trade marks.
          </p>
          <p>
            You retain all rights in the data and content that your organisation enters into the Service. You
            grant Nexsteps a non-exclusive, worldwide, royalty-free licence to host, use, process and display
            such data as necessary to provide and improve the Service and to comply with our legal obligations.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            9. Limitation of liability
          </h2>
          <p>
            Nothing in these Terms limits or excludes liability for death or personal injury caused by negligence,
            for fraud or fraudulent misrepresentation, or any other liability that cannot lawfully be limited or
            excluded.
          </p>
          <p>Subject to the above, and to the maximum extent permitted by law:</p>
          <LegalList>
            <li>
              Nexsteps will not be liable for any indirect, consequential, incidental or special loss or damage,
              or for loss of profits, revenue, goodwill or anticipated savings.
            </li>
            <li>
              Nexsteps will not be responsible for any loss or damage arising from your failure to comply with
              these Terms, including failure to implement appropriate safeguards, access controls and training for
              your users.
            </li>
            <li>
              Nexsteps&apos; total aggregate liability arising out of or in connection with the Service and these
              Terms (whether in contract, tort, negligence or otherwise) will be limited to the fees paid or
              payable by your organisation to Nexsteps in the twelve (12) months immediately preceding the event
              giving rise to the claim.
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            10. Data protection
          </h2>
          <p>
            Each party agrees to comply with applicable data protection laws, including UK GDPR and the Data
            Protection Act 2018. The roles of Nexsteps and the Customer, and the handling of personal data, are
            further described in our Privacy Policy and any applicable Data Processing Agreement.
          </p>
          <p>
            In summary, for most personal data within the Service, the Customer is the data controller and
            Nexsteps is the data processor, processing personal data on the Customer&apos;s documented
            instructions. Nexsteps may also act as an independent controller for limited purposes associated with
            operating and improving the Service (for example, billing, support, security and analytics).
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            11. Governing law and jurisdiction
          </h2>
          <p>
            These Terms, and any dispute or claim arising out of or in connection with them or their subject
            matter or formation (including non-contractual disputes or claims), are governed by and construed in
            accordance with the laws of England and Wales.
          </p>
          <p>
            The courts of England and Wales will have exclusive jurisdiction over any such dispute or claim,
            except that Nexsteps may seek injunctive or other equitable relief in any jurisdiction to protect its
            intellectual property or confidential information.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            12. Contact
          </h2>
          <p>
            If you have any questions about these Terms or about the Service, please contact us at:
          </p>
          <LegalList>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:support@nexsteps.dev">support@nexsteps.dev</a>
            </li>
          </LegalList>
          <p>
            We may update these Terms from time to time. When we do so, we will update the &quot;Last updated&quot;
            date at the top of this page and, where appropriate, provide notice of material changes to account
            owners or administrators.
          </p>
        </div>
      </section>
    </div>
  );
}

