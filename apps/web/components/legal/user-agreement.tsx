import Link from "next/link";
import { LEGAL_DOCUMENTS, LEGAL_PRIVACY_EMAIL } from "@pathway/types";
import { LegalDocumentPage } from "./legal-document-page";

export default function UserAgreement() {
  return (
    <LegalDocumentPage
      document={LEGAL_DOCUMENTS["user-agreement"]}
      introduction={
        <p>
          This agreement applies to adults who use a Nexsteps account, including
          parents, guardians, staff and volunteers. Please read it before
          accepting it in the app.
        </p>
      }
    >
      <h2>1. Who this agreement is with</h2>
      <p>
        Nexsteps is operated by Faithful Software Solutions Ltd (company number
        16682725), 51 Hurst Road, Kennington, Ashford, England, TN24 9RS. In
        this agreement, “we” and “us” mean Faithful Software Solutions Ltd;
        “you” means the person using the account.
      </p>
      <p>
        This agreement covers your individual use of the service. An
        organisation’s subscription and payment obligations are governed by its
        separate <Link href="/terms">Terms of Service</Link>. Accepting this
        agreement does not make you responsible for that organisation’s fees or
        authorise you to bind it to a contract.
      </p>

      <h2>2. Eligibility and account access</h2>
      <p>
        You must be at least 18 to accept this agreement. Use only an account
        issued to you, keep your sign-in details secure and tell your
        organisation or us promptly if you suspect unauthorised access. Do not
        share your account with another person. Your access to an organisation’s
        information depends on the permissions that organisation assigns to you.
      </p>

      <h2>3. Registering children and keeping details accurate</h2>
      <p>
        If you register a child, you confirm that you have parental
        responsibility or other authority to provide the information and make
        the choices requested in the registration form. Give accurate details
        and update them when they change, particularly contact, collection and
        health information used for a child’s care. Your organisation may ask
        for additional permissions under its own policies.
      </p>

      <h2>4. Responsible use and confidentiality</h2>
      <p>
        Use Nexsteps for the activities available to your role and follow
        applicable law and your organisation’s safeguarding and confidentiality
        rules. Do not seek information you are not authorised to see, share
        another person’s private information outside an authorised purpose,
        interfere with the service or upload unlawful or harmful material.
        Report a suspected data exposure or safeguarding concern through your
        organisation’s established process; you may also contact us about a
        service security issue.
      </p>

      <h2>5. Information you add</h2>
      <p>
        You and, where applicable, your organisation remain responsible for
        information you add. You give us permission to store, display and
        process it only as needed to provide the service and carry out the
        applicable privacy arrangements. This does not transfer ownership of
        your content to us. Avoid entering unnecessary information about other
        people.
      </p>

      <h2>6. Privacy and optional choices</h2>
      <p>
        Our <Link href="/privacy">Privacy Policy</Link> explains how personal
        information is used and how to exercise data protection rights. It is
        information for you, not a request for blanket consent. Where we or an
        organisation ask for an optional permission, such as use of a child’s
        photo outside an internal attendance profile, that choice is made
        separately and can be withdrawn through the relevant organisation or
        service control.
      </p>

      <h2>7. Availability, changes and suspension</h2>
      <p>
        We maintain and improve the service, and may need to interrupt access
        for maintenance or security. We or the organisation controlling your
        access may restrict or suspend an account when reasonably necessary to
        address misuse, a security risk or loss of authorisation. We will give
        notice where reasonably practicable. You can ask us to review a
        restriction that we imposed.
      </p>

      <h2>8. Leaving the service and your rights</h2>
      <p>
        You may stop using your account at any time. Contact your organisation
        about access it controls, or contact us about a direct household
        account. Ending access does not necessarily delete information that an
        organisation must retain for a lawful purpose. Nothing in this agreement
        limits rights you cannot waive under applicable law, including data
        protection rights and any consumer rights that apply to you.
      </p>

      <h2>9. Changes and contact</h2>
      <p>
        We will publish a new dated version if this agreement changes. Material
        changes will be presented for fresh acceptance before continued use. For
        questions about this agreement or privacy, email{" "}
        <a href={`mailto:${LEGAL_PRIVACY_EMAIL}`}>{LEGAL_PRIVACY_EMAIL}</a>.
      </p>
    </LegalDocumentPage>
  );
}
