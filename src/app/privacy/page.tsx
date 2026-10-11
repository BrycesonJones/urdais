import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PrivacySettingsButton } from "@/components/analytics/privacy-settings-button";
import { SiteFooter } from "@/components/layout/site-footer";
import { ContactTrigger } from "@/components/layout/contact-trigger";
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
 * The operator details are as confirmed by the operator. Anything that could not
 * be verified — retention periods, provider account settings, legal-review
 * questions — is a visible "To confirm" item,
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
              and the choices you have.
            </p>
            <p>
              Urdais is an independently operated AI and compute market intelligence platform operated by Bryceson
              Jones, based in Georgia, United States. References to &ldquo;Urdais&rdquo;, &ldquo;we&rdquo;,
              &ldquo;us&rdquo; and &ldquo;our&rdquo; refer to Bryceson Jones as the operator of the platform.
            </p>
            <p>
              Most of Urdais can be used without an account. An account is needed only to subscribe to Urdais Premium.
            </p>
          </Section>

          <Section id="summary" title="Summary">
            <ul>
              <li>We use PostHog to understand how the site is used. What it records depends on your choice and your region, and you can change your choice at any time.</li>
              <li>If you create an account, we keep your email address and an internal account identifier.</li>
              <li>Payments are handled by Stripe on Stripe&rsquo;s own checkout page. Urdais never receives your card number.</li>
              <li>We do not sell personal information, and we do not use it for third-party behavioural advertising.</li>
              <li>You can delete your account yourself from your account page.</li>
              <li>Privacy questions and requests go through our contact form, which does not need an account.</li>
            </ul>
          </Section>

          <Section id="visiting" title="When you visit the site">
            <p>
              <strong>Hosting.</strong> Urdais is hosted on{" "}
              <ExtLink href="https://vercel.com/legal/privacy-notice">Vercel</ExtLink>. Like any web server, Vercel receives your IP address,
              browser user agent and the address of each page you request, in order to deliver the site and protect it
              from abuse. Our server code runs in Vercel&rsquo;s Washington, D.C. (United States) region; pages may be
              delivered from the Vercel location nearest to you.
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
                ["You decline analytics, and you are elsewhere", "No cookie or identifier is stored on your device; only a record of your choice is. Our pages still send PostHog a page event without any identifier, but PostHog discards it on arrival under our settings, so your visit is not counted or stored."],
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
              <strong>Your IP address and location.</strong> PostHog receives your IP address with each event, as any
              web server does. We have configured PostHog not to store it and not to derive a location from it. PostHog
              stores our analytics data in the United States.
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
              Sign-in emails are sent by Supabase&rsquo;s authentication service, directly or through an email
              delivery provider acting for us.
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
              to reply. Resend keeps a copy of each message for 30 days. We keep messages in our inbox for as long as
              we need them to handle your message and any follow-up.
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
              OpenFreeMap (map tiles). Vercel, Supabase, PostHog and Resend process information on our behalf; Stripe
              and Google also process it under their own privacy policies, and OpenFreeMap and publishers&rsquo; image
              hosts receive only what your browser sends when it loads their content. We do not sell personal
              information, and we do not use it for third-party behavioural advertising.
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
                <strong>Analytics data</strong> is kept by PostHog for 1 year, the fixed retention period of the PostHog
                plan we use, unless it is deleted sooner (for example, when you delete your account).
              </li>
              <li>
                <strong>Contact messages</strong>: 30 days at Resend; in our inbox, as long as we need them to handle
                your message and any follow-up.
              </li>
              <li>
                <strong>Hosting logs</strong>: the request logs Vercel makes available to us are kept for a limited
                period of no more than 30 days. Vercel&rsquo;s own records are covered by its privacy notice.
              </li>
            </ul>
            <p>
              Deleting your account also deletes the analytics associated with it. We ask PostHog to delete the
              profile linked to your account, together with its events, including activity from before you signed in
              on a browser that was then linked to your account. We make that request within about a day of the
              deletion, once your last visits have been recorded; PostHog then removes the profile shortly afterwards
              and deletes the events on its own schedule. If PostHog cannot be reached, we keep retrying daily and hold
              only the internal identifier needed to do so, until PostHog accepts the request. Visits that were never linked to your account
              (anonymous counts, or anonymous browsing on a browser where you never signed in) carry no identifier
              and cannot be traced to you. Other browsers where you were signed in stop using your identifier within
              minutes of loading the site again.
            </p>
            <p>
              The deletion request covers the events PostHog has received when we make it. Events that reach PostHog
              unusually late can remain after it: for example, from a browser tab on another device that was opened
              while you were signed in and has not been reloaded since, or from a delay in PostHog&rsquo;s own
              processing. Such events can recreate an analytics profile linked to your former account identifier. We
              check for these profiles regularly and ask PostHog to delete them as well.
            </p>
          </Section>

          <Section id="choices" title="Your choices">
            <ul>
              <li>
                <strong>Analytics.</strong> Change your choice at any time:{" "}
                <PrivacySettingsButton className="underline underline-offset-2 text-neutral-100 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]" />
                . The same control is in the &ldquo;More options&rdquo; menu (&bull;&bull;&bull;) in the site header. Declining after accepting removes PostHog&rsquo;s
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
              use the contact form (see{" "}
              <a href="#privacy-requests" className="underline underline-offset-2 text-neutral-100 hover:text-white">
                Privacy questions and requests
              </a>
              ). We will not treat you differently for exercising these rights.
            </p>
          </Section>

          <Section id="legal-bases" title="Why we may use your information">
            <p>Where the law requires a legal basis for using personal information, we rely on:</p>
            <ul>
              <li>
                <strong>your consent</strong>, for analytics wherever we ask before collecting it, and whenever you accept
                analytics. You can withdraw it at any time with the privacy settings control;
              </li>
              <li>
                <strong>performing our contract with you</strong>, to provide your account, sign-in and subscription,
                and to process payments;
              </li>
              <li>
                <strong>our legitimate interests</strong> in operating, securing and improving Urdais, for hosting and
                request logs, protecting the site from abuse, analytics where it is on by default, and replying to
                messages you send us;
              </li>
              <li>
                <strong>legal obligations</strong>, to keep records of payments.
              </li>
            </ul>
          </Section>

          <Section id="international" title="International visitors">
            <p>
              Urdais is operated from the United States, and most of its providers process information there. If you
              visit from elsewhere, your information is transferred there. This includes analytics: PostHog stores our
              analytics data in the United States. PostHog states in its data processing agreement that it participates
              in the EU-U.S. Data Privacy Framework (with its UK and Swiss extensions) and also relies on the EU Standard
              Contractual Clauses. Our other providers&rsquo; data processing terms likewise include safeguards for
              international transfers.
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
              Urdais is a professional market-data service for people aged 18 or older and is not directed at children.
              We do not knowingly collect personal information from anyone under 18. If you believe someone under 18 has
              given us personal information, tell us through the contact form and we will delete it.
            </p>
          </Section>

          <Section id="changes" title="Changes to this policy">
            <p>
              When this policy changes, we will publish the updated policy on this page and update the effective date
              above. If a change is significant, we will also give additional notice where the law requires it.
            </p>
          </Section>

          <Section id="privacy-requests" title="Privacy Questions and Requests">
            <p>Use our contact form for any question or request about your personal information, including:</p>
            <ul>
              <li>a request to access the personal information we hold about you;</li>
              <li>a request to correct it;</li>
              <li>a request to delete it;</li>
              <li>questions about analytics and your consent choices;</li>
              <li>any other privacy question.</li>
            </ul>
            {/* A div, not a p: the trigger renders the form's <dialog>, which a <p> cannot contain. */}
            <div>
              <ContactTrigger className="font-medium underline underline-offset-2 text-neutral-100 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]">
                Open the contact form
              </ContactTrigger>
            </div>
            <p>
              The same form opens from &ldquo;Contact&rdquo; in the site footer. You do not need an
              account to use it. It sends us the email address you enter and your message, as described under
              &ldquo;Contact form&rdquo; above, and we reply to that address.
            </p>
            <p>
              You do not need to ask us to delete your account or change your analytics choice: you can delete your
              account yourself from{" "}
              <Link href="/account" className="underline underline-offset-2 text-neutral-100 hover:text-white">your account page</Link>, and change
              your analytics choice with the privacy settings control described under &ldquo;Your choices&rdquo;.{" "}
              Before acting on a request about personal information, we may ask you for details that let us confirm it
              comes from you.
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
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-10 scroll-mt-24 flex flex-col gap-3 text-sm leading-relaxed [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:text-neutral-100 [&_strong]:text-neutral-100">
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
