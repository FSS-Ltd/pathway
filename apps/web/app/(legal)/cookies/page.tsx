import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cookie, Settings2, SlidersHorizontal } from "lucide-react";
import CookiePreferencesButton from "../../../components/cookie-preferences-button";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Nexsteps Cookie Policy. Learn how we use cookies and similar technologies.",
};

const LegalList = ({ children }: { children: ReactNode }) => (
  <ul className="mt-2 list-disc list-inside space-y-1 text-pw-text-muted">{children}</ul>
);

export default function CookiesPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-16 md:py-24">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold text-pw-text">Cookie Policy</h1>
        <p className="text-sm text-pw-text-muted">Last updated: {new Date().toLocaleDateString()}</p>
      </div>

      {/* Summary cards */}
      <section className="grid gap-6 md:grid-cols-2">
        <article className="rounded-xl border border-pw-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Cookie className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">At a glance</h2>
          </div>
          <p className="mt-2 text-sm text-pw-text-muted">
            We use cookies and similar technologies to keep you signed in securely, remember your preferences
            and understand how Nexsteps is used so we can improve it. We do not use cookies for third-party
            advertising.
          </p>
        </article>

        <article className="rounded-xl border border-pw-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Settings2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">Main cookie types</h2>
          </div>
          <LegalList>
            <li>Essential session and security cookies for login and navigation.</li>
            <li>Analytics cookies, including Google Analytics, only set after you accept our cookie banner.</li>
            <li>Stripe cookies used to support secure payments and billing.</li>
          </LegalList>
        </article>

        <article className="rounded-xl border border-pw-border bg-white p-6 md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-pw-text">Managing cookies</h2>
          </div>
          <p className="mt-2 text-sm text-pw-text-muted">
            Your browser lets you view, delete and block cookies if you wish. Blocking essential cookies may stop
            parts of Nexsteps from working correctly (for example, you may not be able to log in or stay logged
            in). You can also change the choice you made on our cookie banner at any time:
          </p>
          <CookiePreferencesButton />
        </article>
      </section>

      {/* Full cookie policy text */}
      <section className="prose prose-sm max-w-none">
        <div className="rounded-xl border border-pw-border bg-white p-6 space-y-4">
          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            1. What are cookies?
          </h2>
          <p>
            Cookies are small text files that are placed on your device (such as a computer, tablet or smartphone)
            when you visit a website or use an online service. They are widely used to make websites work, to keep
            them secure, and to provide information to site owners about how their service is being used.
          </p>
          <p>
            In this Cookie Policy, &quot;cookies&quot; also includes similar technologies such as local storage and
            pixels where used in a comparable way.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            2. How Nexsteps uses cookies
          </h2>
          <p>
            Nexsteps uses cookies and similar technologies on our marketing site and application in order to:
          </p>
          <LegalList>
            <li>Help you sign in and stay signed in securely</li>
            <li>Remember your preferences (for example, active site selection)</li>
            <li>Keep the Service secure and prevent misuse</li>
            <li>Understand how the Service is used so we can improve it</li>
            <li>Support secure payments and billing via Stripe</li>
          </LegalList>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            3. Types of cookies we use
          </h2>

          <h3>3.1 Essential cookies</h3>
          <p>
            These cookies are strictly necessary for the Service to function and cannot reasonably be disabled.
            They are usually only set in response to actions made by you, such as logging in, navigating between
            pages, or updating settings. Without these cookies, core features of Nexsteps may not work properly.
          </p>
          <p>Examples of essential cookies include:</p>
          <LegalList>
            <li>Session cookies that keep you logged in as you move around the site</li>
            <li>Security cookies used to protect your account and prevent fraud</li>
            <li>Cookies that store your currently active site or organisation context</li>
          </LegalList>

          <h3>3.2 Analytics cookies</h3>
          <p>
            On our public marketing site (nexsteps.dev), we use Google Analytics to help us understand how the
            site is used, for example:
          </p>
          <LegalList>
            <li>Which pages are visited and how often</li>
            <li>Which features are used most frequently</li>
            <li>General performance and error information</li>
          </LegalList>
          <p>
            Google Analytics cookies are only set after you accept analytics cookies on our cookie banner; if you
            decline, no Google Analytics cookies are set and no data is sent to Google. Google Analytics is
            provided by Google LLC and may process data outside the UK/EEA — see &quot;9. International data
            transfers&quot; in our Privacy Policy for the safeguards that apply. We do not use Google Analytics
            advertising or profile-building features, and we do not use analytics cookies to build marketing
            profiles about individual children, parents or staff. The Nexsteps application itself (as opposed to
            this marketing site) does not use Google Analytics.
          </p>

          <h3>3.3 Stripe and payment-related cookies</h3>
          <p>
            When you update billing details or make payments, Stripe (our payment processor) may set its own
            cookies to:
          </p>
          <LegalList>
            <li>Help complete secure payment transactions</li>
            <li>Prevent fraud and abuse</li>
            <li>Remember certain payment-related preferences</li>
          </LegalList>
          <p>
            These cookies are controlled by Stripe and are subject to Stripe&apos;s own privacy and cookie
            policies. They are considered essential for processing payments.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            4. No advertising or tracking cookies
          </h2>
          <p>
            Nexsteps does <strong>not</strong> use third-party advertising cookies or ad-tech trackers to deliver
            targeted advertising. We do not sell or share children&apos;s data with advertisers, and we do not use
            social media tracking pixels for advertising purposes on our core application.
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            5. How to manage cookies
          </h2>
          <p>
            Most web browsers allow you to control cookies through their settings. You can usually:
          </p>
          <LegalList>
            <li>View which cookies are stored on your device</li>
            <li>Delete existing cookies</li>
            <li>Block some or all cookies from being set in future</li>
          </LegalList>
          <p>
            If you choose to block or delete essential cookies, some parts of the Nexsteps Service may not
            function correctly or may become inaccessible (for example, you may not be able to log in or stay
            logged in).
          </p>
          <p>
            To learn more about cookies and how to manage them, you can visit{" "}
            <a href="https://www.allaboutcookies.org" target="_blank" rel="noreferrer">
              www.allaboutcookies.org
            </a>
            .
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            6. Changes to this Cookie Policy
          </h2>
          <p>
            We may update this Cookie Policy from time to time to reflect changes in the cookies we use or in
            legal requirements. When we do, we will update the &quot;Last updated&quot; date at the top of this
            page. In some cases, we may provide additional notice of significant changes (for example, via the
            Nexsteps admin interface).
          </p>

          <h2 className="mt-8 text-lg font-semibold text-pw-text first:mt-0 text-center">
            7. Contact
          </h2>
          <p>
            If you have any questions about how we use cookies or similar technologies, please contact us at:
          </p>
          <LegalList>
            <li>
              <strong>Email:</strong>{" "}
              <a href="mailto:privacy@nexsteps.dev">privacy@nexsteps.dev</a>
            </li>
          </LegalList>
        </div>
      </section>
    </div>
  );
}

