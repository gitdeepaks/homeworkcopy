import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import { Caveat, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import QueryProvider from "@/shared/components/providers/query-provider";
import { ThemeProvider } from "@/shared/components/providers/theme-provider";
import { AuthenticatedApiProvider } from "@/shared/components/providers/authenticated-api-provider";

const sourceSans = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-handwriting",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Homeworkcopy",
    template: "%s | Homeworkcopy",
  },
  description: "A source-grounded notebook for studying, asking, and creating.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        sourceSans.variable,
        caveat.variable,
        jetbrainsMono.variable,
      )}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-initializer" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("theme");var d=t==="dark"||(t===null||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}`}
        </Script>
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
