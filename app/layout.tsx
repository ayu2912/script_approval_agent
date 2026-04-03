import type { Metadata } from "next";
import { Oxanium, Playfair_Display, Fira_Code, Merriweather } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import ClientEditProvider from "@/components/ClientEditProvider";
import "./globals.css";

const oxanium = Oxanium({
  subsets: ["latin"],
  variable: "--font-sans",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-playfair",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Greenlit",
  description: "AI content approval command center",
};

const themeScript = `
(function() {
  try {
    var theme = localStorage.getItem('greenlit-theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${oxanium.variable} ${playfair.variable} ${firaCode.variable} ${merriweather.variable} font-sans antialiased bg-[var(--bg)] text-[var(--text)]`} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
          <ClientEditProvider>{children}</ClientEditProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
