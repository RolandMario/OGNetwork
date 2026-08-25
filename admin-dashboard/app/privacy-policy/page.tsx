import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy Policy — OG Network",
  description:
    "How OG Network collects, uses, and protects your personal information when you use our VTU & bills payment services.",
};

// ---------------------------------------------------------------------------
// Privacy Policy
// ---------------------------------------------------------------------------
// A public, legal-facing page styled to match the OGNetwork brand. It is part
// of the admin dashboard app so it can be served/linked for the platform's
// customers too (the app layout renders this route without the authenticated
// sidebar for non-logged-in visitors).
// ---------------------------------------------------------------------------

const COMPANY = {
  name: "OG Network (OGNetwork)",
  services:
    "payment vouchers (airtime), mobile data bundles, cable TV subscriptions and electricity bill payments",
};

interface PolicySection {
  id: string;
  heading: string;
  body: ReactNode;
}

const SECTIONS: PolicySection[] = [
  {
    id: "introduction",
    heading: "Introduction",
    body: (
      <>
        <p>
          OGNetwork (&quot;OG Network&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) respects your privacy and is
          committed to protecting the personal information you share with us. This Privacy Policy
          explains what information we collect, why we collect it, how we use and safeguard it, and
          the choices you have regarding your information when you use our platform to purchase
          airtime, mobile data, cable TV subscriptions and electricity tokens.
        </p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    heading: "Information We Collect",
    body: (
      <>
        <p>In the course of providing our VTU and bills payment services, we may collect:</p>
        <ul>
          <li>
            <strong>Account information</strong> — your full name, email address, phone number, and a
            securely stored password/PIN used to access your account.
          </li>
          <li>
            <strong>Payment information</strong> — transaction references, wallet balances, and
            payment method details (for example cards processed through Paystack or Monnify, or
            receipts for manual bank transfers). We never store full card numbers or bank credentials
            on our own servers; sensitive payment data is handled by our PCI-compliant payment
            processors.
          </li>
          <li>
            <strong>Service transaction details</strong> — beneficiary phone numbers, meter or IUC
            numbers, network/provider selections and the plans you purchase, which we require to
            fulfil and reconcile each service (airtime, data, cable and electricity).
          </li>
          <li>
            <strong>Device &amp; usage data</strong> — approximate IP address, browser or app type,
            device identifiers and logs we automatically collect to operate, secure and improve our
            services.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-use",
    heading: "How We Use Your Information",
    body: (
      <>
        <p>We use your personal information to:</p>
        <ul>
          <li>create, authenticate and secure your account;</li>
          <li>process, deliver and confirm your airtime, data, cable and electricity transactions;</li>
          <li>generate transaction receipts and maintain accurate wallets and payment history;</li>
          <li>detect, prevent and investigate fraud, abuse or security incidents;</li>
          <li>provide customer support and respond to enquiries;</li>
          <li>send service updates, transactional notices and, where you have opted in, promotional
              communications;</li>
          <li>improve our platform, and comply with legal, tax and anti-money-laundering
          obligations.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-share",
    heading: "How We Share Your Information",
    body: (
      <>
        <p>We do not sell your personal information. Information is only shared with third parties
        where necessary to deliver our services, specifically with:</p>
        <ul>
          <li>
            <strong>Service/voucher providers</strong> — the VTU/bill-payment providers we use to
            top up airtime, data and cable TV, or to disburse electricity tokens (minimum details
            such as beneficiary number and plan);
          </li>
          <li>
            <strong>Payment processors</strong> — Paystack, Monnify and similar providers to process
            payments and verify receipts;
          </li>
          <li>
            <strong>Service and infrastructure providers</strong> — hosting, analytics and security
            vendors acting on our behalf;
          </li>
          <li>
            <strong>Authorities</strong> — where required by law, regulation, subpoena, or to
            protect our rights and the safety of our users.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "data-security",
    heading: "Data Security & Retention",
    body: (
      <>
        <p>
          We take reasonable administrative, technical and physical safeguards to protect your
          information from loss, misuse, unauthorised access, alteration or destruction. Sensitive
          data such as passwords and PINs are hashed, and access to internal data is restricted to
          authorised personnel only.
        </p>
        <p>
          We retain personal and transaction data for as long as is necessary to provide our
          services, maintain records for payment reconciliation and audit purposes, and comply with
          our legal and regulatory obligations. When information is no longer needed, we securely
          delete or anonymise it.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    heading: "Your Rights & Choices",
    body: (
      <>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul>
          <li>access, correct or update the personal information we hold about you;</li>
          <li>request deletion of your account and personal data (subject to legal obligations);</li>
          <li>object to or restrict certain processing, and withdraw consent where processing relies
          on it;</li>
          <li>opt out of non-essential communications at any time.</li>
        </ul>
        <p>
          To exercise any of these rights, please contact us using the details below. We will respond
          within a reasonable time and in line with applicable law.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    heading: "Cookies & Similar Technologies",
    body: (
      <>
        <p>
          We may use cookies and similar technologies to keep you signed in, remember your
          preferences, and understand how our platform is used so we can improve it. You can control
          or disable cookies through your browser settings; however, some features may not function
          correctly if cookies are blocked.
        </p>
      </>
    ),
  },
  {
    id: "children",
    heading: "Children's Privacy",
    body: (
      <>
        <p>
          Our services are intended for individuals who are at least 18 years of age (or the age of
          majority in your jurisdiction). We do not knowingly collect personal information from
          children. If you believe a child has provided us with personal information, please contact
          us so we can delete it.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    heading: "Changes to This Policy",
    body: (
      <>
        <p>
          We may update this Privacy Policy from time to time. When we make material changes, we will
          notify you through the platform or by email. Your continued use of the services after
          changes take effect constitutes acceptance of the revised policy. We encourage you to
          review this page periodically.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    heading: "Contact Us",
    body: (
      <>
        <p>
          If you have questions, concerns or requests regarding this Privacy Policy or your personal
          data, you can reach us at:
        </p>
        <p>
          <strong>{COMPANY.name}</strong>
          <br />
          Email: <a href="mailto:support@ognetwork.com">support@ognetwork.com</a>
          <br />
          Address: Ikeja, Lagos, Nigeria
        </p>
        <p>Last updated: 25 August 2026</p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">OG</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">OG Network</h1>
              <p className="text-xs text-slate-500">VTU &amp; Bills Services</p>
            </div>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            &larr; Back to app
          </Link>
        </div>

        {/* Title */}
        <div className="mb-10 border-b border-slate-200 pb-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">Privacy Policy</h2>
          <p className="mt-2 text-sm text-slate-500">
            This policy explains how {COMPANY.name} collects, uses and protects your personal
            information when you use our VTU &amp; bills payment services.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-2">
                <span className="w-1.5 h-5 bg-blue-600 rounded-full" />
                {section.heading}
              </h3>
              <div className="space-y-3 text-sm leading-relaxed text-slate-600 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-blue-600 [&_a]:underline">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved. <br />
          <Link href="/" className="text-blue-600 hover:underline">Back to OG Network Admin</Link>
        </div>
      </div>
    </main>
  );
}