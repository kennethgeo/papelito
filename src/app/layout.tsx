import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./paper.css";
import "./workshop.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { VersionWatcher } from "@/components/VersionWatcher";

const PREFERENCES_SCRIPT = `try{var p=JSON.parse(localStorage.getItem('papelito-accessibility')||'{}'),d=document.documentElement.dataset;d.largeText=String(p.large===true);d.highContrast=String(p.contrast===true);d.reducedMotion=String(p.motion===true);}catch(e){}`;

export const metadata: Metadata = {
  title: "Papelito — Un pequeño gran secreto",
  description:
    "Organiza intercambios de amigos secretos con total confidencialidad, temas festivos y listas de deseos.",
  manifest: "/manifest.webmanifest",
  applicationName: "Papelito",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Papelito",
  },
  icons: {
    icon: "/icon-192.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#46245D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Applied before the first paint so text size, contrast and motion
            preferences do not flash; same logic as public/preferences.js. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
        <VersionWatcher />
      </body>
    </html>
  );
}
