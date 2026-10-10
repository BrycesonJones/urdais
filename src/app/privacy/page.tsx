import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PrivacySettingsButton } from "@/components/analytics/privacy-settings-button";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import {
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_STATUS,
  privacyPolicyViewable,
} from "@/lib/privacy/policy";

const DRAFT = PRIVACY_POLICY_STATUS === "draft";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Urdais collects, uses and shares information, and the choices you have.",
  // A draft is for review, not for search engines.
  ...(DRAFT ? { robots: { index: false, follow: false } } : {}),
};

/** Reads VERCEL_ENV per request, so a draft is never served by Vercel Production. */
export const dynamic = "force-dynamic";

/**
 * The Urdais privacy policy.
 *
 * Every statement here describes behaviour verified in this repository or in the
 * network payloads PostHog actually receives (see docs/architecture/analytics.md).
 * Anything that could not be verified — the legal entity, a privacy contact,
 * retention periods, provider account settings — is a visible "To confirm" item,
 * never a guess. Publication is gated in `@/lib/privacy/policy`.
 */
export default function PrivacyPolicyRoute() {
  if (!privacyPolicyViewable()) notFound();

  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-[#0a0a0a] px-4 py-12 text-neutral-200 sm:py-16">
        <article className="mx-auto w-full max-w-3xl">
          {DRAFT ? (
            <div role="note" className="mb-8 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
              <p className="font-medium">Draft — not in effect.</p>
              <p className="mt-1 text-amber-100/80">
                This policy is under review and has not been published. Items marked &ldquo;To confirm&rdquo; must be
                resolved before it is.
              </p>
            </div>
          ) : null}

          <h1 className="text-3xl font-semibold tracking-tight text-neutral-50">Privacy Policy</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Effective date: {PRIVACY_POLICY_EFFECTIVE_DATE ?? <Todo>set on publication</Todo>}
          </p>

          <Section id="about" title="About this policy">
            <p>
              This policy explains what information Urdais collects when you use urdais.com, why, who else processes it,
              and the choices you have. &ldquo;Urdais&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; refer to the operator
              of urdais.com: <Todo>legal entity name and postal address</Todo>.
            </p>
            <p>
              Urdais is an information and market-data platform. Most of it can be used without an account. An account is
              needed only to subscribe to Urdais Premium.
            </p>
          </Section>

          <Section id="summary" title="Summary">
            <ul>
              <li>We use PostHog to understand how the site is used. What it records depends on your choice and your region, and you can change your choice at any time.</li>
              <li>If you create an account, we keep your email address and an internal account identifier.</li>
              <li>Payments are handled by Stripe on Stripe&rsquo;s own checkout page. Urdais never receives your card number.</li>
              <li>We do not show advertising and do not sell personal information. <Todo>confirm as a standing commitment</Todo></li>
              <li>You can delete your account yourself from your account page.</li>
            </ul>
          </Section>

          <Section id="visiting" title="When you visit the site">
            <p>
              <strong>Hosting.</strong> Urdais is hosted on{" "}
              <ExtLink href="https://vercel.com/legal/privacy-notice">Vercel</ExtLink>. Like any web server, Vercel receives your IP address,
              browser user agent and the address of each page you request, in order to deliver the site and protect it
              from abuse. <Todo>Vercel log retention and function region</Todo>
            </p>
            <p>
              <strong>Your region.</strong> Vercel tells our server which country a request comes from, derived from the
              IP address. We use it once per page load to decide the default analytics setting for your region (see
              &ldquo;Analytics&rdquo; below). We do not store it.
            </p>
            <p>
              <strong>Content loaded from other services.</strong> Some content is loaded by your browser directly from
              other providers, which therefore receive your IP address and user agent:
            </p>
            <ul>
              <li>map tiles on the data-centre map, from <ExtLink href="https://openfreemap.org/">OpenFreeMap</ExtLink>;</li>
              <li>news article thumbnails, from each publisher&rsquo;s own image host (for example Google Cloud Storage, Webflow and Cloudflare);</li>
              <li>if you choose &ldquo;Continue with Google&rdquo;, Google&rsquo;s sign-in pages (<ExtLink href="https://policies.google.com/privacy">Google Privacy Policy</ExtLink>).</li>
            </ul>
          </Section>

          <Section id="analytics" title="Analytics">
            <p>
              We use <ExtLink href="https://posthog.com/privacy">PostHog</ExtLink> to measure visits, traffic sources,
              which pages and data products are used, and how many visitors start and complete a subscription. What
              happens depends on your choice:
            </p>
            <Table
              head={["Situation", "What is collected"]}
              rows={[
                ["You accept analytics", "Full analytics. PostHog stores a random identifier in a cookie and in your browser’s local storage, so return visits are recognised."],
                ["You decline analytics, and you are in the European Economic Area, the United Kingdom or Switzerland, or we cannot tell where you are", "Nothing. Our pages do not send analytics from your browser; only a record of your choice is stored."],
                ["You decline analytics, and you are elsewhere", "Visits are still counted, but no cookie or identifier is stored on your device; only a record of your choice is. To count a visit once, PostHog’s servers combine your IP address, user agent and our site name with a random value that changes every day and is then deleted, so the same browser cannot be recognised from one day to the next."],
                ["You have not chosen, and you are in the European Economic Area, the United Kingdom or Switzerland, or we cannot tell where you are", "Nothing. Our pages do not contact PostHog at all until you choose."],
                ["You have not chosen, and you are elsewhere", "Full analytics, as if you had accepted. The banner lets you decline."],
                ["Your browser sends a Do Not Track or Global Privacy Control signal", "Nothing. PostHog is not started in your browser."],
              ]}
            />
            <p>
              <strong>What an analytics event contains.</strong> The page address and title, the referring page,
              campaign parameters in the address (such as <code>utm_source</code>), browser and operating system and
              their versions, the raw user-agent string, device type, screen and window size, browser language, time
              zone, how far you scrolled, and the text and position of links and buttons you click. With analytics
              accepted it also contains the random identifiers for your browser and visit. For Urdais data products we
              add the product&rsquo;s name and category and whether it was shown to you locked.
            </p>
            <p>
              <strong>What we keep out.</strong> We do not record your screen or sessions. PostHog does not record what
              you type into forms. Sign-in codes, payment session identifiers and other credentials are removed from page
              addresses before anything is sent, and advertising click identifiers are masked. The email address shown
              on your account page is excluded from click recording.
            </p>
            <p>
              <strong>Your IP address and location.</strong> PostHog receives your IP address with each event. Unless it
              is configured not to, PostHog stores the address and derives an approximate location from it, which can
              include country, region, city, postal code and approximate coordinates.{" "}
              <Todo>PostHog project settings for IP storage (&ldquo;Discard client IP data&rdquo;) and location
              enrichment, and the hosting region (US or EU)</Todo>
            </p>
            <p>
              <strong>If you have an account.</strong> When you have accepted analytics (or it is on by default in your
              region) and you sign in, we tell PostHog your internal Urdais account identifier, so your activity, including
              activity from before you signed in on that browser, is associated with your account. We do not send your
              email address, name or payment details to PostHog. Signing out resets this. If you decline analytics, your
              activity is never associated with your account.
            </p>
            <p>
              <strong>Subscription events.</strong> Our server tells PostHog when a checkout starts and when a
              subscription is confirmed by Stripe. These events are associated with your account only if analytics was
              accepted (or on by default in your region) when you started checkout. If you had declined outside the
              European Economic Area, the United Kingdom and Switzerland, they are recorded only as a count, without any
              identifier. If you had declined or not yet chosen within those regions, or we could not tell where you
              were, or your browser sent Do Not Track or Global Privacy Control, they are not sent at all.
            </p>
          </Section>

          <Section id="account" title="Your account">
            <p>
              Accounts use passwordless sign-in through <ExtLink href="https://supabase.com/privacy">Supabase</ExtLink>{" "}
              authentication: you receive a one-time code by email, or sign in with Google. We keep:
            </p>
            <ul>
              <li>your email address (from you, or from Google if you use Google sign-in) and whether it is verified;</li>
              <li>an internal account identifier, and the date the account was created;</li>
              <li>if you choose to answer it, the role that best describes you, from a fixed list;</li>
              <li>your subscription status and entitlement to premium products.</li>
            </ul>
            <p>
              Our production database and authentication run on Supabase in the United States (AWS us-east-1).
              <Todo>the email provider that sends sign-in codes</Todo>
            </p>
          </Section>

          <Section id="payments" title="Payments">
            <p>
              Subscriptions are sold through <ExtLink href="https://stripe.com/privacy">Stripe</ExtLink>&rsquo;s hosted
              checkout. You enter your payment details on Stripe&rsquo;s page, and Urdais never receives your card number.
              We give Stripe your email address and your Urdais account identifier so the payment can be linked to your
              account. We keep the Stripe identifiers for your customer record and subscription, its status and its
              billing period. Stripe processes your payment and billing information under its own privacy policy.
            </p>
          </Section>

          <Section id="contact-form" title="Contact form">
            <p>
              If you use the contact form, we receive your email address and your message. They are delivered to our
              inbox through <ExtLink href="https://resend.com/legal/privacy-policy">Resend</ExtLink>. We use them only
              to reply. <Todo>how long contact messages are kept</Todo>
            </p>
          </Section>

          <Section id="cookies" title="Cookies and browser storage">
            <Table
              head={["Name", "Purpose", "Duration"]}
              rows={[
                ["sb-…-auth-token", "Keeps you signed in. Not readable by page scripts.", "Until you sign out or the session expires"],
                ["urdais_onboarding_email", "Remembers the email address a sign-in code was sent to.", "30 minutes"],
                ["urdais_onboarding_audience", "Remembers your optional role answer during sign-up.", "30 minutes"],
                ["urdais_analytics_consent", "Records whether you accepted or declined analytics.", "1 year"],
                ["ph_…_posthog (cookie and local storage)", "PostHog’s random identifiers. Set only when analytics is accepted or on by default.", "Up to 1 year"],
                ["ph_… (session storage)", "PostHog’s per-tab identifiers. Only when analytics is accepted or on by default.", "Until the tab is closed"],
                ["__ph_opt_in_out_… (local storage)", "PostHog’s copy of your analytics choice.", "Until cleared"],
              ]}
            />
          </Section>

          <Section id="sharing" title="Who processes information for us">
            <p>
              We use the providers named above to run Urdais: Vercel (hosting), Supabase (database and sign-in), Stripe
              (payments), PostHog (analytics), Resend (contact email), Google (only if you choose Google sign-in) and
              OpenFreeMap (map tiles). We do not sell personal information. <Todo>data processing agreements in place with
              each provider</Todo>
            </p>
            <p>
              We may disclose information if required by law, or to protect Urdais and its users from fraud or abuse.
            </p>
          </Section>

          <Section id="retention" title="How long we keep information">
            <ul>
              <li>
                <strong>Your account</strong> is kept until you delete it. When you do, we delete your account, your
                sign-in record and your role answer. Records of past payments are kept for financial and legal reasons,
                but are detached from your account and no longer contain your email address. Stripe keeps its own records
                of your payments under its obligations.
              </li>
              <li>
                <strong>Analytics data</strong> is kept by PostHog for the retention period of our PostHog plan.{" "}
                <Todo>the period: PostHog states 1 year on its free plan and 7 years on paid plans, and that it cannot be
                shortened</Todo>
              </li>
              <li><strong>Contact messages</strong>: <Todo>retention period</Todo></li>
              <li><strong>Hosting logs</strong>: <Todo>Vercel log retention</Todo></li>
            </ul>
            <p>
              Deleting your account also deletes the analytics associated with it. We ask PostHog to delete the
              profile linked to your account, together with its events, including activity from before you signed in
              on a browser that was then linked to your account. PostHog removes the profile shortly afterwards and
              deletes the events asynchronously. If PostHog cannot be reached, we keep retrying daily and hold only the
              internal identifier needed to do so, until it succeeds. Visits that were never linked to your account
              (cookieless counts, or anonymous browsing on a browser where you never signed in) carry no identifier
              and cannot be traced to you. Other browsers where you were signed in stop using your identifier within
              minutes of loading the site again.{" "}
              <Todo>expected completion time to state publicly</Todo>
            </p>
          </Section>

          <Section id="choices" title="Your choices">
            <ul>
              <li>
                <strong>Analytics.</strong> Change your choice at any time:{" "}
                <PrivacySettingsButton className="underline underline-offset-2 text-neutral-100 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]" />
                . The same control is in the site footer and on the map. Declining after accepting removes PostHog&rsquo;s
                identifiers from your browser.
              </li>
              <li>
                <strong>Browser signals.</strong> We honour Do Not Track and Global Privacy Control by not starting
                PostHog in your browser at all.
              </li>
              <li>
                <strong>Your account.</strong> You can sign out, and delete your account from{" "}
                <Link href="/account" className="underline underline-offset-2 text-neutral-100 hover:text-white">your account page</Link>.
              </li>
            </ul>
          </Section>

          <Section id="rights" title="Your rights">
            <p>
              Depending on where you live, you may have the right to access the personal information we hold about you,
              correct it, delete it, receive a copy of it, object to or restrict how we use it, and withdraw consent you
              have given. You may also have the right to complain to your data protection authority. To make a request,
              contact us (below). We will not treat you differently for exercising these rights.
              <Todo>legal bases relied on (consent, contract, legitimate interests) and region-specific notices, after legal review</Todo>
            </p>
          </Section>

          <Section id="international" title="International visitors">
            <p>
              Urdais and most of its providers process information in the United States. If you visit from elsewhere,
              your information is transferred there. PostHog states in its data processing agreement that it
              participates in the EU-U.S. Data Privacy Framework (with its UK and Swiss extensions) and also relies on
              the EU Standard Contractual Clauses. <Todo>PostHog hosting region, and the transfer mechanisms for the other
              providers</Todo>
            </p>
          </Section>

          <Section id="security" title="Security">
            <p>
              The site is served only over HTTPS. Sign-in sessions are kept in cookies that page scripts cannot read, and
              payment details are entered only on Stripe&rsquo;s pages. No method of storing or transmitting information
              is completely secure, and we cannot guarantee absolute security.
            </p>
          </Section>

          <Section id="children" title="Children">
            <p>
              Urdais is a professional market-data service and is not directed at children. <Todo>minimum age</Todo>
            </p>
          </Section>

          <Section id="changes" title="Changes to this policy">
            <p>
              When this policy changes, we will update the effective date above. <Todo>how significant changes are announced</Todo>
            </p>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              Use the contact form in the site footer. <Todo>a dedicated privacy contact address</Todo>
            </p>
          </Section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mt-10 flex flex-col gap-3 text-sm leading-relaxed [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:text-neutral-100 [&_strong]:text-neutral-100">
      <h2 id={`${id}-heading`} className="text-lg font-semibold text-neutral-50">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** An open item. Visible, and only ever in a draft. */
function Todo({ children }: { children: ReactNode }) {
  return (
    <span className="ml-1 rounded border border-amber-400/30 bg-amber-400/[0.08] px-1.5 py-0.5 text-xs text-amber-200">
      To confirm: {children}
    </span>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-neutral-100 hover:text-white">
      {children}
    </a>
  );
}

function Table({ head, rows }: { head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/[0.03] text-xs text-neutral-400">
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-white/10 align-top">
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="px-3 py-2 font-medium text-neutral-100">
                    {cell}
                  </th>
                ) : (
                  <td key={index} className="px-3 py-2">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
