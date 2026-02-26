import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HRMS Sidebar",
  description: "shadcn/ui sidebar layout",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <main className="flex flex-1 flex-col">
              <header className="flex h-14 items-center border-b px-4">
                <SidebarTrigger />
                <h1 className="ml-3 text-sm font-medium">HRMS</h1>
              </header>
              <div className="flex-1 p-4">{children}</div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </body>
    </html>
  );
}
