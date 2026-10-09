import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ConsentBanner } from "@/components/analytics/consent-banner";
import { env } from "@/config/env";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/constants/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {children}
        {/* Client-only, renders nothing until analytics has started and there is a choice to make. */}
        <ConsentBanner />
      </body>
    </html>
  );
}
