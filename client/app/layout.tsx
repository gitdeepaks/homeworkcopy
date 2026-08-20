import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import QueryProvider from "@/shared/components/providers/query-provider";
import { ThemeProvider } from "@/shared/components/providers/theme-provider";
import { AuthenticatedApiProvider } from "@/shared/components/providers/authenticated-api-provider";

/**
 * Display: a variable serif with optical sizing, so a 72px headline is drawn
 * with the thin hairlines a headline wants rather than a body face enlarged.
 * `SOFT` and `WONK` have to be requested explicitly — an axis Next is not told
 * about is pinned at its default and cannot be varied from CSS.
 */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  display: "swap",
});

/** Interface and reading text: a grotesque with real character at 14px. */
const plexSans = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

/** Metadata, citations, and code — anything that is evidence rather than prose. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Homeworkcopy",
    template: "%s | Homeworkcopy",
  },
  description: "A source-grounded notebook for studying, asking, and creating.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `proxy.ts` mints this per request and names it in the script-src of the
  // response's Content-Security-Policy. Next stamps it on the scripts it emits
  // itself; the theme initializer below is ours, so it has to be passed
  // explicitly or the browser refuses to run it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        fraunces.variable,
        plexSans.variable,
        plexMono.variable,
      )}
      suppressHydrationWarning
    >
      <head>
        {/*
          A plain tag rather than `next/script`, and carrying the nonce the
          policy names, so the browser runs it while parsing the head — before
          any paint, which is the whole point of a theme initializer.

          `suppressHydrationWarning` covers the nonce: once a browser has applied
          the policy it blanks the `nonce` content attribute while keeping the
          property, so React would otherwise compare `""` against the real value
          and report a mismatch that is not one.
        */}
        <script
          id="theme-initializer"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");var d=t==="dark"||(t===null||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}`,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <ClerkProvider>
          <ThemeProvider defaultTheme="system">
            <AuthenticatedApiProvider>
              <QueryProvider>{children}</QueryProvider>
            </AuthenticatedApiProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
