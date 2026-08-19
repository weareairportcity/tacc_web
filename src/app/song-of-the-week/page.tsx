import { getSongs } from "@/lib/songs-db";
import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import CatalogGrid from "./CatalogGrid";

export const revalidate = 0;

export default async function SongOfTheWeekPortal() {
  const songs = await getSongs(true);

  return (
    <div className="min-h-screen bg-[#fafaf9] font-inter text-[#0c0a09] antialiased flex flex-col relative overflow-x-hidden selection:bg-[#c1e1f7] selection:text-[#0c0a09]">

      {/* Seline Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#ffffff] border-b border-[#e8e6e5] shadow-[0_1px_2px_rgba(0,0,0,0.05)] px-4 sm:px-6 h-[64px] flex items-center justify-between">
        <div className="max-w-[1200px] mx-auto w-full flex items-center justify-between gap-4">
          
          <Link href="/song-of-the-week" className="flex items-center gap-3 shrink-0">
            <Image 
              src="/logo.png" 
              alt="The Airport City Church Logo" 
              width={105} 
              height={34} 
              className="object-contain" 
            />
            <span className="h-4 w-[1px] bg-[#e8e6e5]" />
            <span className="text-xs font-normal text-[#78716c] font-roobert tracking-tight">Songs Portal</span>
          </Link>

          {/* Centered Search Bar */}
          <div className="hidden md:flex items-center gap-2 bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px] px-3 py-1.5 w-[360px] focus-within:border-[#3ba6f1] transition-all">
            <Search className="w-4 h-4 text-[#a8a29e]" />
            <span className="text-xs text-[#78716c] flex-1">Search lyrics, hymns, or artists...</span>
            <kbd className="bg-[#ffffff] text-[10px] text-[#a8a29e] font-sans border border-[#e8e6e5] rounded px-1.5 py-0.5 shadow-xs">⌘K</kbd>
          </div>

          <div className="flex items-center gap-4 text-xs font-normal">
            <Link href="/" className="text-[#78716c] hover:text-[#0c0a09] transition-colors hidden sm:inline-block">Home</Link>
            <Link href="/timewithpastor" className="text-[#78716c] hover:text-[#0c0a09] transition-colors hidden sm:inline-block">Bookings</Link>
          </div>
        </div>
      </header>

      {/* Main Catalog Content */}
      <main className="flex-grow max-w-[1200px] mx-auto w-full px-4 sm:px-6 py-12 md:py-16 flex flex-col gap-[64px]">
        
        {/* Seline Editorial Hero Headline Block */}
        <div className="text-center flex flex-col items-center max-w-[1000px] mx-auto pt-4 pb-2">
          
          <span className="text-xs font-normal text-[#3398e1] bg-[#c1e1f7]/60 px-3 py-1 rounded-full mb-4">
            Song of the Week Portal
          </span>
          
          {/* Roobert geometric sans headline with signature cyan highlight span */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-roobert font-normal tracking-[-1.092px] leading-[1.12] text-[#0c0a09] max-w-4xl text-balance mb-6">
            Teaching & admonishing through <span className="text-[#3398e1] bg-[#c1e1f7] px-3 py-0.5 rounded-md font-normal inline-block">psalms & hymns</span>
          </h1>
          
          <p className="text-base sm:text-lg tracking-[0.048px] leading-[1.69] text-[#78716c] max-w-[760px] text-balance mb-8 font-normal">
            Make learning one new song a weekly habit. It deepens your worship and ensures you always have the perfect words of praise ready for any moment.
          </p>

          <div className="flex gap-3">
            <Link 
              href="#catalog" 
              className="px-5 py-2.5 bg-[#3ba6f1] text-white font-medium text-xs rounded-full border border-[#3398e1] shadow-sm hover:bg-[#3398e1] transition-all"
            >
              Explore Hymns & Lyrics
            </Link>
          </div>
        </div>

        {/* Catalog Section */}
        <div id="catalog" className="space-y-6">
          <div className="border-b border-[#e8e6e5] pb-4 flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-roobert font-normal tracking-[-0.021em] text-[#0c0a09]">
                Weekly Song Catalog
              </h2>
              <p className="text-xs text-[#78716c] mt-1 font-normal">
                Official releases and published worship lyrics
              </p>
            </div>
            
            <div className="flex items-center bg-[#fafaf9] border border-[#e8e6e5] rounded-full p-0.5 text-xs font-normal">
              <span className="bg-[#ffffff] text-[#0c0a09] rounded-full px-3 py-1 shadow-xs border border-[#e8e6e5]">All Songs</span>
            </div>
          </div>

          <CatalogGrid songs={songs} />
        </div>

        {/* Church Fellowship Section */}
        <div className="border-t border-[#e8e6e5] pt-10 pb-4">
          <p className="text-center text-[11px] uppercase tracking-wider text-[#a8a29e] font-medium mb-6">
            The Airport City Church Fellowship
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4 opacity-70">
            <span className="text-xs font-normal text-[#78716c] tracking-widest uppercase">LOVEWORLD</span>
            <span className="text-xs font-normal text-[#78716c] tracking-widest uppercase">CHRIST EMBASSY</span>
            <span className="text-xs font-normal text-[#78716c] tracking-widest uppercase">TACC SINGERS</span>
            <span className="text-xs font-normal text-[#78716c] tracking-widest uppercase">LOVEWORLD SINGERS</span>
          </div>
        </div>

      </main>

      {/* Seline Footer */}
      <footer className="bg-[#ffffff] text-[#78716c] border-t border-[#e8e6e5] py-8 px-6 mt-16">
        <div className="max-w-[1200px] mx-auto w-full flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-normal">
          <div className="flex flex-col items-center md:items-start gap-1">
            <Image 
              src="/logo.png" 
              alt="TACC Logo" 
              width={90} 
              height={26} 
              className="object-contain opacity-80" 
            />
            <p className="text-[11px] text-[#a8a29e]">© {new Date().getFullYear()} The Airport City Church</p>
          </div>
          <div className="flex gap-4 text-xs text-[#78716c]">
            <Link href="/" className="hover:text-[#0c0a09] transition-colors">Home</Link>
            <Link href="/timewithpastor" className="hover:text-[#0c0a09] transition-colors">Bookings</Link>
            <Link href="/song-of-the-week" className="hover:text-[#0c0a09] transition-colors">Songs</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
