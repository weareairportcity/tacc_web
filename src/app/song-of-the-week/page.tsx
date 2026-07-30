import { getSongs } from "@/lib/songs-db";
import Link from "next/link";
import Image from "next/image";
import { Music, Search, Plus, ExternalLink } from "lucide-react";
import CatalogGrid from "./CatalogGrid";

// Accent gradients for fallback catalog cards matching the brand blue
const COVERS = [
  "linear-gradient(135deg, rgba(60, 194, 207, 0.18) 0%, rgba(60, 194, 207, 0.06) 100%)",
  "linear-gradient(135deg, rgba(60, 194, 207, 0.12) 0%, rgba(96, 165, 250, 0.12) 100%)",
  "linear-gradient(135deg, rgba(60, 194, 207, 0.15) 0%, rgba(242, 242, 242, 0.6) 100%)",
];

export const revalidate = 0; // Fetch fresh data on load

export default async function SongOfTheWeekPortal() {
  const songs = await getSongs(true); // Fetch only published songs

  return (
    <div className="min-h-screen bg-paper font-euclid-circular-a text-ink-black antialiased flex flex-col relative overflow-x-hidden selection:bg-brand-blue selection:text-white">

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-snow rounded-b-[10px] border-b border-hairline shadow-subtle px-4 sm:px-6 h-[64px] flex items-center justify-between">
        <div className="max-w-[1200px] mx-auto w-full flex items-center justify-between gap-4">
          
          {/* Logo (Left-aligned) */}
          <Link href="/song-of-the-week" className="flex items-center gap-2 group shrink-0">
            <Image 
              src="/logo.png" 
              alt="The Airport City Church Logo" 
              width={100} 
              height={32} 
              className="object-contain" 
            />
            <span className="h-4 w-[1px] bg-hairline" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-ink">SOTW</span>
          </Link>

          {/* Centered Mock Search Bar */}
          <div className="hidden md:flex items-center gap-2 bg-paper border border-hairline rounded-[10px] px-3 py-1.5 w-[380px] hover:border-graphite transition-all group">
            <Search className="w-4 h-4 text-ash-gray group-hover:text-ink-black transition-colors" />
            <span className="text-sm text-ash-gray flex-1">Search lyrics or artists...</span>
            <kbd className="bg-snow text-[10px] text-ash-gray font-sans border border-hairline rounded px-1.5 py-0.5 shadow-sm">⌘K</kbd>
          </div>

          {/* Right Navigation Cluster */}
          <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm font-semibold">
            <Link href="/" className="hover:text-brand-blue transition-colors hidden sm:inline-block">Home</Link>
            <Link href="/timewithpastor" className="hover:text-brand-blue transition-colors hidden sm:inline-block">Bookings</Link>
          </div>
        </div>
      </header>

      {/* Main Catalog Content */}
      <main className="flex-grow max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-12 md:py-16 flex flex-col gap-[64px]">
        
        {/* Hero Headline Block */}
        <div className="text-center flex flex-col items-center max-w-[1100px] mx-auto pt-6 pb-2">
          {/* Category Tag Header */}
          <span className="text-[11px] font-bold text-brand-blue uppercase tracking-widest mb-3">
            SONG OF THE WEEK
          </span>
          
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-[-0.5px] sm:tracking-[-1.5px] md:tracking-[-4.97px] leading-[1.05] md:leading-[1.0] text-ink-black max-w-5xl text-balance mb-6">
            Teaching and Admonishing Through Psalms and Hymns
          </h1>
          
          <p className="text-base sm:text-[18px] tracking-[-0.11px] leading-[1.5] text-graphite max-w-[860px] text-balance mb-8 font-medium">
            Make learning one new song a weekly habit. It deepens your worship and ensures you always have the perfect words of praise ready for any moment.
          </p>

          <div className="flex gap-3">
            <Link 
              href="#catalog" 
              className="px-6 py-3 bg-brand-blue text-white font-semibold text-sm rounded-[10px] shadow-subtle hover:opacity-90 transition-all"
            >
              Explore Lyrics
            </Link>
          </div>
        </div>

        {/* Catalog Section */}
        <div id="catalog" className="space-y-6">
          <div className="border-b border-hairline pb-4 flex justify-between items-end">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-[-0.48px] text-ink-black uppercase">
                Weekly Song Catalog
              </h2>
              <p className="text-xs text-ash-gray mt-1 font-semibold uppercase tracking-wider">
                Discover hymns and lyrics
              </p>
            </div>
            
            <div className="flex items-center bg-fog border border-hairline rounded-[10px] p-0.5 gap-1">
              <span className="bg-snow text-ink-black text-xs font-bold rounded-[8px] px-3 py-1 shadow-sm">All Weeks</span>
              <span className="text-graphite text-xs font-semibold px-3 py-1 cursor-not-allowed">Featured</span>
            </div>
          </div>

          {/* Compact Product Catalog Grid */}
          <CatalogGrid songs={songs} />
        </div>

        {/* Company Logo Wall (Social Proof in Craftwork spec) */}
        <div className="border-t border-hairline pt-12 pb-6">
          <p className="text-center text-[11px] uppercase tracking-widest text-ash-gray font-bold mb-8">
            The Airport City Church Fellowship
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-60">
            <span className="text-sm font-bold text-graphite tracking-widest uppercase">LOVEWORLD</span>
            <span className="text-sm font-bold text-graphite tracking-widest uppercase">CHRIST EMBASSY</span>
            <span className="text-sm font-bold text-graphite tracking-widest uppercase">TACC SINGERS</span>
            <span className="text-sm font-bold text-graphite tracking-widest uppercase">WORSHIP TEAM</span>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-obsidian text-ash-gray border-t border-hairline py-12 px-6 mt-16">
        <div className="max-w-[1200px] mx-auto w-full flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Image 
              src="/logo.png" 
              alt="TACC Logo" 
              width={90} 
              height={30} 
              className="object-contain brightness-0 invert" 
            />
            <p className="text-[10px] text-ash-gray">© {new Date().getFullYear()} The Airport City Church. All rights reserved.</p>
          </div>
          <div className="flex gap-6 text-xs text-ash-gray font-semibold">
            <Link href="/" className="hover:text-snow transition-colors">Home</Link>
            <Link href="/timewithpastor" className="hover:text-snow transition-colors">Bookings</Link>
            <Link href="/song-of-the-week" className="hover:text-snow transition-colors">Songs</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
