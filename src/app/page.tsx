import Link from "next/link";
import { Calendar, Mail, Instagram, Facebook, Twitter } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans relative overflow-hidden selection:bg-slate-100 selection:text-black">
      {/* Subtle Background Accent */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(#e5e5e5_1px,transparent_1px)] [background-size:40px_40px] opacity-40"></div>

      {/* Navigation */}
      <nav className="relative z-10 w-full px-6 py-8 flex justify-between items-center max-w-7xl mx-auto border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black flex items-center justify-center text-white font-black text-lg">
            T
          </div>
          <span className="hidden sm:block font-bold text-black tracking-tight">The Airport City Church</span>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-8 text-sm font-medium">
          <Link href="/timewithpastor" className="text-black hover:underline transition-all">Book a meeting</Link>
          <a href="#about" className="text-slate-500 hover:text-black transition-colors hidden md:block">Who we are</a>
          <a href="#contact" className="text-slate-500 hover:text-black transition-colors">Contact us</a>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center max-w-5xl mx-auto -mt-12 md:-mt-24">
        <div className="space-y-0 mb-12">
          <h1 className="text-5xl md:text-[6rem] font-bold text-slate-200 leading-[1.1] tracking-tight select-none">
            We are
          </h1>
          <h1 className="text-5xl md:text-[7rem] font-bold text-slate-300 leading-[1] tracking-tight select-none">
            building something
          </h1>
          <h2 className="text-6xl md:text-[8rem] font-bold text-black leading-[0.9] tracking-tighter flex items-center justify-center gap-4">
            Amazing<span className="w-3 h-3 md:w-6 md:h-6 bg-black rounded-full inline-block mt-4"></span>
          </h2>
        </div>

        <p className="text-lg md:text-xl text-slate-500 mb-12 max-w-xl font-medium leading-relaxed">
          The digital sanctuary of The Airport City Church is under construction. We are building a new way for you to connect and belong.
        </p>

        <Link 
          href="/timewithpastor" 
          className="group relative inline-flex items-center justify-center px-12 py-5 font-bold text-white transition-all duration-200 bg-black hover:bg-slate-800"
        >
          <Calendar className="w-5 h-5 mr-3" />
          Book a meeting with Pastor
        </Link>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-6 max-w-7xl mx-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest border-t border-slate-100">
        <div className="flex gap-6">
          <a href="#" className="hover:text-black transition-colors">Instagram</a>
          <a href="#" className="hover:text-black transition-colors">Facebook</a>
          <a href="#" className="hover:text-black transition-colors">Twitter</a>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-600">Coming Soon 2026</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span>Accra, Ghana</span>
        </div>
      </footer>
    </div>
  );
}


