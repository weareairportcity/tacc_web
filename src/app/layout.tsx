import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import GlobalAudioPlayer from "@/components/GlobalAudioPlayer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-euclid-circular-a",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Airport City Church | Discover Peace through Christ",
  description: "Book time with the Pastor or explore our guided programs like Scripture Study and Community Prayer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AudioPlayerProvider>
          {children}
          <GlobalAudioPlayer />
        </AudioPlayerProvider>
      </body>
    </html>
  );
}

