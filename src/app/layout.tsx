import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./paper.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Papelito — Un pequeño gran secreto",
  description: "Organiza intercambios de amigos secretos con total confidencialidad, temas festivos y listas de deseos.",
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
    <html lang="es">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
