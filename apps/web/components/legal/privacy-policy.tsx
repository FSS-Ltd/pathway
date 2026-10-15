import Link from "next/link";
import { LEGAL_DOCUMENTS, LEGAL_PRIVACY_EMAIL } from "@pathway/types";
import { LegalDocumentPage } from "./legal-document-page";

export default function PrivacyPolicy() {
  return (
    <LegalDocumentPage
      document={LEGAL_DOCUMENTS.privacy}
      introduction={
        <p>
          This notice explains how personal information is handled across
          Nexsteps. It covers people who use an account and people whose details
          are added by an organisation or a household. It does not ask you to
          consent to every use of your information.
        </p>
      }
    >
      <h2>1. Who is responsible for your information?</h2>
      <p>
        Nexsteps is operated by Faithful Software Solutions Ltd, company number
        16682725, 51 Hurst Road, Kennington, Ashford, England, TN24 9RS. Contact
        our privacy team at{" "}
        <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a>.
      </p>
      <p>
        Schools, churches, clubs and other organisations normally decide why
        they collect and use their members’ and children’s records in Nexsteps.
        They are the data controllers for those records; we provide the software
        and generally process the records on their instructions. Contact your
        organisation for its own privacy notice and decisions about a child’s
        records.
      </p>
      <p>
        We are a controller for information we use to operate our own business,
        including account administration, security, support and billing. For
        Nexsteps Home accounts opened directly by a household, we also decide
        the purposes of the household service and are a controller for its
        account and workspace information. The roles depend on the particular
        activity, not only on who hosts the data.
      </p>

      <h2>2. What information do we handle, and where does it come from?</h2>
      <ul>
        <li>
          <strong>Account and contact information:</strong> names, email
          addresses, sign-in identifiers, roles, organisation or household
          membership and communication preferences.
        </li>
        <li>
          <strong>Children and families:</strong> names, ages or dates of birth,
          guardian details, attendance, education or activity records, pickup
          arrangements, and any needs or allergy details provided for a child.
        </li>
        <li>
          <strong>Content:</strong> messages, learning records, notes,
          photographs, files and other material that authorised users upload or
          create.
        </li>
        <li>
          <strong>Business and technical information:</strong> plan and invoice
          details, payment references provided by our payment processor, IP
          address, device or browser information, security events and support
          requests.
        </li>
      </ul>
      <p>
        We receive this information from you, your parent or guardian, your
        organisation, other authorised users, and our authentication or payment
        providers. An organisation may add someone’s information before that
        person creates an account. We ask users to provide only what the
        relevant task needs.
      </p>

      <h2>3. Why do we use it, and on what basis?</h2>
      <p>
        Where an organisation is the controller, it chooses and must explain the
        lawful basis for its purposes, such as attendance, communication or
        safeguarding. Our role as processor does not turn a parent’s acceptance
        of our User Agreement into consent for the organisation’s processing.
      </p>
      <p>
        For activities where we are the controller, our purposes and usual UK
        GDPR bases are:
      </p>
      <ul>
        <li>
          <strong>
            Provide an adult’s account or direct household subscription:
          </strong>{" "}
          processing necessary to perform our agreement with that adult,
          including sign-in, service delivery and support requested under the
          service.
        </li>
        <li>
          <strong>
            Run household features involving a child’s ordinary information:
          </strong>{" "}
          our legitimate interests in providing the parent-led service,
          considered against the child’s interests, rights and reasonable
          expectations. A parent’s contract is not itself the child’s lawful
          basis.
        </li>
        <li>
          <strong>Protect accounts and the service:</strong> our legitimate
          interests in preventing misuse, investigating incidents and
          maintaining reliable systems.
        </li>
        <li>
          <strong>Keep required financial and legal records:</strong> compliance
          with legal obligations, including accounting and tax requirements.
        </li>
        <li>
          <strong>Optional analytics or marketing:</strong> consent where
          required. Our public website’s analytics cookies are controlled
          separately through the <Link href="/cookies">Cookie Policy</Link> and
          cookie choices.
        </li>
      </ul>
      <p>
        When a child’s health, disability, religious, safeguarding or other
        special-category information is involved, the controller must identify
        both an Article 6 lawful basis and a separate Article 9 condition, plus
        any applicable Data Protection Act 2018 requirements. Agreement
        acceptance alone supplies neither. Do not enter sensitive details into a
        general free-text field unless the task requires them.
      </p>

      <h2>4. Who receives information?</h2>
      <p>
        We make information available to authorised people in the relevant
        organisation or household, according to their roles. We use service
        providers for hosting and storage, authentication, payments, email
        delivery and support. Providers used in the platform may include Vercel,
        Supabase, Clerk, Stripe and Resend. Google Analytics is used on our
        public website only when you accept analytics cookies. Providers receive
        only the information needed for their service. We may disclose
        information where law requires it or to protect people from a serious
        risk, subject to applicable safeguards. We do not sell children’s
        records or use information in the private platform for advertising.
      </p>

      <h2>5. International access and transfers</h2>
      <p>
        A provider or authorised support team may process or access information
        outside the UK, including in the EEA or United States. A restricted
        transfer must have an appropriate UK transfer mechanism, such as
        applicable adequacy regulations or contractual safeguards. Ask us at the
        privacy address above for information about a particular provider,
        country or applicable safeguard and how to obtain a copy.
      </p>

      <h2>6. How long do we keep information?</h2>
      <p>
        Organisations decide retention for the records they control, subject to
        their legal and safeguarding duties. We follow their documented
        instructions and the service agreement. For information we control, we
        use the period needed to provide an active account or household service,
        then apply the relevant deletion process. We keep limited billing,
        security or dispute records longer where law or a live claim requires
        it. Different records can have different schedules; the criteria include
        their purpose, legal duties, safeguarding needs and whether a request or
        dispute is open. Please contact us or your organisation for the schedule
        relevant to a particular record. Deletion from backups may follow a
        separate cycle.
      </p>

      <h2>7. How do we protect information?</h2>
      <p>
        We use authenticated access, role and organisation boundaries, encrypted
        connections, restricted administrative access and logging to protect the
        service. Organisations decide which of their people can see or change
        the records they control. No security measure eliminates every risk;
        report a suspected exposure promptly to your organisation or to us.
      </p>

      <h2>8. Your rights and choices</h2>
      <p>
        Depending on the processing and its lawful basis, you may ask to access,
        correct, erase or restrict personal information, receive portable
        information, or object to processing.
        <strong>
          {" "}
          You can object to processing based on legitimate interests.
        </strong>{" "}
        Where consent is the basis, you may withdraw it without affecting
        earlier lawful processing. You can also change optional cookie choices
        using the Cookie Policy.
      </p>
      <p>
        Send requests about organisation-controlled records to that organisation
        first; we will help it respond. For information we control, email{" "}
        <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a>. We
        may need to verify identity or authority before disclosing a child’s
        information. A child’s own rights must be considered as their
        understanding develops, rather than assuming every request by an adult
        can be fulfilled automatically.
      </p>

      <h2>9. Privacy complaints</h2>
      <p>
        You can complain about our handling of personal information by emailing{" "}
        <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a>.
        Describe what happened and the information concerned, without sending
        more sensitive details than necessary. We will acknowledge a complaint
        within 30 days, make appropriate enquiries without undue delay, keep you
        informed and explain the outcome. If the complaint concerns an
        organisation’s decision, we will help direct it to that controller and
        assist as required. You may also complain to the{" "}
        <a
          href="https://ico.org.uk/make-a-complaint/"
          target="_blank"
          rel="noreferrer"
        >
          Information Commissioner’s Office
        </a>
        .
      </p>

      <h2>10. Changes to this notice</h2>
      <p>
        We will publish a new dated version when this notice changes and tell
        affected people about material new uses before beginning them. Previous
        versions remain available; the{" "}
        <Link href="/legal/privacy/legacy">prior notice</Link> is archived here.
        A privacy notice informs you of processing; reading or accepting it is
        not a blanket consent.
      </p>
    </LegalDocumentPage>
  );
}
