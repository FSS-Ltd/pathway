import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ShieldCheck, Database, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Nexsteps Privacy Policy. Learn how we collect, use, and protect your data.",
};

const LegalList = ({ children }: { children: ReactNode }) => (
  <ul className="mt-2 list-disc list-inside space-y-1 text-pw-text-muted">{children}</ul>
);

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold text-pw-text">Privacy Policy</h1>
        <p className="text-sm text-pw-text-muted">Last updated: {new Date().toLocaleDateString()}</p>
      </div>

      {/* Summary cards */}
      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-pw-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">Introduction</h2>
          </div>
          <p className="mt-2 text-sm text-pw-text-muted">
            Nexsteps is a UK-based SaaS platform used by schools, churches, clubs and charities to
            manage programmes for children, young people, staff and volunteers. We are committed to
            protecting personal data in line with UK GDPR and the Data Protection Act 2018.
          </p>
        </article>

        <article className="rounded-xl border border-pw-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">What we process</h2>
          </div>
          <LegalList>
            <li>Organisation account and contact details</li>
            <li>Staff and volunteer user accounts</li>
            <li>Child and young person records and attendance</li>
            <li>Parent and guardian contact details</li>
            <li>Uploaded media and lesson resources</li>
            <li>Billing and technical usage data</li>
          </LegalList>
        </article>

        <article className="rounded-xl border border-pw-border bg-white p-6 md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">Your organisation and your rights</h2>
          </div>
          <p className="mt-2 text-sm text-pw-text-muted">
            Organisations using Nexsteps act as data controllers and are responsible for deciding how
            your data is used. Nexsteps acts mainly as a data processor, processing data on their
            instructions. Under UK data protection law, you may have rights to access, correct or
            erase your data, to object to certain processing and to raise concerns with the UK
            Information Commissioner&apos;s Office (ICO).
          </p>
        </article>
      </section>

      {/* Full policy text */}
      <section className="prose prose-sm max-w-none">
        <div className="rounded-xl border border-pw-border bg-white p-6 space-y-4">
          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            1. Who we are
          </h2>
          <p>
            Nexsteps (&quot;Nexsteps&quot;, &quot;we&quot;, &quot;us&quot; or &quot;our&quot;) is a UK-based
            software-as-a-service (SaaS) platform that helps schools, churches, clubs, charities, and similar
            organisations manage programmes for children, young people, staff, and volunteers. We are committed
            to protecting the privacy and security of personal data in line with the UK General Data Protection
            Regulation (&quot;UK GDPR&quot;) and the Data Protection Act 2018.
          </p>
          <p>
            Nexsteps acts primarily as a <strong>data processor</strong> on behalf of the organisations that
            use our service. For the purposes of this Privacy Policy, the organisation that has a subscription
            to Nexsteps (for example, a school, church, club or charity) is usually the{" "}
            <strong>data controller</strong> responsible for deciding how and why personal data is processed.
          </p>
          <p>
            If you have questions about this Privacy Policy, you can contact us at:
          </p>
          <ul>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:privacy@nexsteps.dev">privacy@nexsteps.dev</a>
            </li>
          </ul>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            2. Our role and your organisation&apos;s role
          </h2>
          <p>
            When an organisation (for example, a school, church, club, or charity) uses Nexsteps, that
            organisation is the <strong>data controller</strong> for most of the personal data stored in and
            processed through the platform. Nexsteps acts as a <strong>data processor</strong>, processing
            personal data on the organisation&apos;s documented instructions in accordance with our contract
            and this Privacy Policy.
          </p>
          <p>
            This means that if you are a parent/guardian, child, staff member, volunteer, or other individual
            whose data is entered into Nexsteps by an organisation, you should first contact that organisation
            if you wish to exercise your data protection rights or have questions about how your data is used.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            3. Categories of data we process
          </h2>
          <p>
            The exact data processed in Nexsteps will depend on how each organisation uses the platform. In
            general, the following categories of data may be processed:
          </p>

          <h3>Organisation account and contact data</h3>
          <LegalList>
            <li>Organisation name, address and contact details</li>
            <li>Primary contact details (for example, safeguarding lead, administrator)</li>
            <li>Billing contact details and account configuration</li>
          </LegalList>

          <h3>Staff and volunteer user data</h3>
          <LegalList>
            <li>Names and contact details (such as email address)</li>
            <li>Role within the organisation (for example, admin, teacher, volunteer)</li>
            <li>Login identifiers and activity within the service (for audit and security)</li>
          </LegalList>

          <h3>Child and young person data</h3>
          <LegalList>
            <li>Basic identifying information (for example, name, date of birth, group/class)</li>
            <li>Attendance records and session history</li>
            <li>
              Pastoral and safeguarding-related notes and concerns, where recorded by authorised staff in line
              with the organisation&apos;s policies
            </li>
            <li>Additional information the organisation chooses to record (for example, allergies)</li>
          </LegalList>

          <h3>Parent and guardian data</h3>
          <LegalList>
            <li>Names and contact details (such as email address and phone number)</li>
            <li>Relationship to the child or young person</li>
            <li>Communication preferences and records of messages sent</li>
          </LegalList>

          <h3>Uploaded media and documents</h3>
          <LegalList>
            <li>
              Files, photos or other media uploaded by the organisation (for example, lesson resources,
              consent-related documents), usually only where appropriate consent has been obtained by the
              organisation
            </li>
          </LegalList>

          <h3>Billing and subscription data</h3>
          <LegalList>
            <li>Billing contact details and subscription plan information</li>
            <li>
              Limited payment-related information processed through our payment provider (Stripe), such as
              billing address and the last four digits of a payment card
            </li>
            <li>Invoice and transaction history</li>
          </LegalList>

          <h3>Technical and usage data</h3>
          <LegalList>
            <li>Log data (for example, IP address, browser type, device identifiers)</li>
            <li>Usage information about how the platform is accessed and used</li>
            <li>
              Diagnostic and analytics information — on our marketing site, via Google Analytics, only after you
              accept analytics cookies on our cookie banner
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            4. Lawful bases for processing
          </h2>
          <p>
            For processing where Nexsteps is the data processor, the data controller (your organisation) is
            responsible for identifying and documenting the appropriate lawful basis under UK GDPR. Typically,
            the following lawful bases may apply:
          </p>
          <LegalList>
            <li>
              <strong>Contract</strong> – where processing is necessary for the performance of a contract
              between the organisation and Nexsteps, or between the organisation and its staff/volunteers or
              parents/guardians (for example, providing access to the platform and managing attendance).
            </li>
            <li>
              <strong>Legitimate interests</strong> – where processing is necessary for the organisation&apos;s
              legitimate interests, balanced against the rights and freedoms of the individuals (for example,
              maintaining security logs, internal reporting and planning).
            </li>
            <li>
              <strong>Legal obligation</strong> – where processing is necessary for the organisation to comply
              with a legal duty (for example, certain safeguarding, child protection or record-keeping
              requirements).
            </li>
            <li>
              <strong>Consent</strong> – in some cases, especially for optional communications or use of photos
              and media, the organisation may rely on consent from parents/guardians or staff.
            </li>
          </LegalList>
          <p>
            Nexsteps may also process limited data as an independent controller in order to operate and improve
            our service (for example, account-level contact and billing information, service analytics and
            security logging). In those cases we generally rely on <strong>contract</strong> and/or{" "}
            <strong>legitimate interests</strong> as our lawful bases.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            5. How we use personal data
          </h2>
          <p>
            We use personal data, on behalf of organisations and for our own purposes, to:
          </p>
          <LegalList>
            <li>
              <strong>Provide and operate the service</strong> – including creating and managing user accounts,
              recording attendance, managing rotas and sessions, and facilitating communication between staff
              and parents/guardians.
            </li>
            <li>
              <strong>Support safeguarding workflows</strong> – allowing authorised staff to record and manage
              appropriate safeguarding and pastoral notes in accordance with their own policies and legal
              obligations.
            </li>
            <li>
              <strong>Provide customer support</strong> – responding to support requests, fixing issues and
              helping organisations use Nexsteps effectively.
            </li>
            <li>
              <strong>Maintain security and integrity</strong> – including access control, authentication, audit
              logging, monitoring for misuse, and protecting against fraud or unauthorised access.
            </li>
            <li>
              <strong>Improve and develop the platform</strong> – analysing usage patterns in an aggregated or
              pseudonymised form to improve performance, features and usability.
            </li>
            <li>
              <strong>Handle billing and account management</strong> – managing subscriptions, processing
              payments via Stripe, and sending service-related notices.
            </li>
            <li>
              <strong>Comply with legal obligations</strong> – responding to lawful requests from regulators or
              law enforcement where required.
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            6. Data retention
          </h2>
          <p>
            As data processor, Nexsteps retains personal data in line with each organisation&apos;s
            configuration and documented instructions. In general:
          </p>
          <LegalList>
            <li>
              Organisations control how long children&apos;s records, attendance data and
              safeguarding-related information are retained, subject to their legal obligations and internal
              policies.
            </li>
            <li>
              Nexsteps provides tools to support data export and deletion on request from the organisation.
            </li>
            <li>
              Following termination of a customer&apos;s subscription, we will work with the organisation to
              export data where required and then delete or irreversibly anonymise personal data from our
              active systems after a defined period, subject to any legal retention obligations.
            </li>
            <li>
              Some minimal records (for example, invoices and basic account history) may be retained for a
              longer period where required for accounting, tax or legal purposes.
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            7. Security measures
          </h2>
          <p>
            We take appropriate technical and organisational measures to protect personal data processed through
            Nexsteps, including:
          </p>
          <LegalList>
            <li>
              <strong>Role-based access control</strong> – access to data is restricted based on user roles (for
              example, admin, staff, safeguarding roles) and the site (tenant) they belong to.
            </li>
            <li>
              <strong>Tenant isolation</strong> – data for each customer organisation is logically separated so
              that users can only access data for their own site(s), subject to their permissions.
            </li>
            <li>
              <strong>Secure transmission</strong> – all data in transit between users and our platform is
              encrypted using industry-standard HTTPS/TLS.
            </li>
            <li>
              <strong>Secure hosting</strong> – we use reputable cloud infrastructure providers (such as AWS or
              equivalent) in appropriate regions, with hardened configurations and access controls.
            </li>
            <li>
              <strong>Access controls and logging</strong> – administrative access to production systems is
              restricted to authorised personnel and actions are logged for audit purposes.
            </li>
            <li>
              <strong>Backups and resilience</strong> – regular backups and resilience measures are in place to
              protect against data loss and service outages.
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            8. Subprocessors and third-party services
          </h2>
          <p>
            We use carefully selected subprocessors and third-party services to help deliver the Nexsteps
            platform. These providers may process personal data on our behalf. Key categories include:
          </p>
          <LegalList>
            <li>
              <strong>Authentication provider</strong> – for example, Auth0, which manages secure authentication
              of users.
            </li>
            <li>
              <strong>Cloud hosting and storage</strong> – such as Amazon Web Services (AWS) or an equivalent
              cloud provider, used to host our application, databases and stored files.
            </li>
            <li>
              <strong>Payment processor</strong> – Stripe, used to handle subscription billing and payment
              processing on our behalf. Stripe processes payment card data in accordance with PCI-DSS.
            </li>
            <li>
              <strong>Email delivery provider</strong> – such as Resend or Amazon SES, used for sending
              transactional and service-related emails.
            </li>
            <li>
              <strong>Analytics provider</strong> – Google Analytics, used on our marketing site only, and only
              after you accept analytics cookies on our cookie banner. We do not enable Google&apos;s advertising
              or profile-building features.
            </li>
          </LegalList>
          <p>
            We maintain appropriate data processing agreements with our subprocessors and take steps to ensure
            they provide suitable safeguards for personal data. A current list of subprocessors is available on
            request from customer organisations.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            9. International data transfers
          </h2>
          <p>
            Our primary hosting locations are intended to be within the UK and/or European Economic Area (EEA).
            However, some of our subprocessors may process data in other countries, including outside the UK and
            EEA (for example, where support teams or infrastructure are based overseas).
          </p>
          <p>
            Where personal data is transferred outside the UK/EEA, we will ensure that appropriate safeguards are
            in place, such as:
          </p>
          <LegalList>
            <li>
              An adequacy decision from the UK government or European Commission in respect of the destination
              country; and/or
            </li>
            <li>
              Standard contractual clauses or other appropriate contractual safeguards approved under UK GDPR.
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            10. Data subject rights
          </h2>
          <p>
            Under UK data protection law, individuals have a number of rights in relation to their personal data,
            including:
          </p>
          <LegalList>
            <li>
              <strong>Right of access</strong> – to obtain a copy of the personal data held about them.
            </li>
            <li>
              <strong>Right to rectification</strong> – to have inaccurate or incomplete data corrected.
            </li>
            <li>
              <strong>Right to erasure</strong> – in certain circumstances, to have personal data deleted (&quot;
              the right to be forgotten&quot;).
            </li>
            <li>
              <strong>Right to restriction of processing</strong> – in certain circumstances, to restrict how
              their data is used.
            </li>
            <li>
              <strong>Right to data portability</strong> – in some cases, to receive their data in a structured,
              machine-readable format and have it transmitted to another controller.
            </li>
            <li>
              <strong>Right to object</strong> – to certain types of processing, including processing based on
              legitimate interests and, where applicable, direct marketing.
            </li>
          </LegalList>
          <p>
            Where Nexsteps is acting as a data processor, individuals should direct any requests to exercise
            these rights to the relevant organisation (data controller). We will support our customers in
            responding to such requests in line with our contractual obligations.
          </p>
          <p>
            Individuals also have the right to lodge a complaint with the UK Information Commissioner&apos;s
            Office (ICO) if they are unhappy with how their personal data is being handled:
          </p>
          <LegalList>
            <li>
              <strong>Website:</strong>{" "}
              <a href="https://ico.org.uk" target="_blank" rel="noreferrer">
                https://ico.org.uk
              </a>
            </li>
            <li>
              <strong>Telephone:</strong> 0303 123 1113 (within the UK)
            </li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            11. Contacting us about privacy
          </h2>
          <p>
            If you have any questions about this Privacy Policy or how we handle personal data, please contact us
            at:
          </p>
          <LegalList>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:privacy@nexsteps.dev">privacy@nexsteps.dev</a>
            </li>
          </LegalList>
          <p>
            We may update this Privacy Policy from time to time to reflect changes to our services, legal
            obligations or best practice. When we do so, we will update the &quot;Last updated&quot; date at the
            top of this page and, where appropriate, notify customers of material changes.
          </p>
        </div>
      </section>
    </div>
  );
}

