import Link from "next/link";
import { Calendar, Mail, Instagram, Facebook, Twitter } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans relative overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Topographic Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 86c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm66-3c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zm-40-39c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm50 38c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM4 73c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm20-44c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm58 10c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm-46-8c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm42 54c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM22 13c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm54 57c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM38 80c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM12 27c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm82-17c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM40 20c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm50 48c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM10 6c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm82 36c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM44 90c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm36-56c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm-24-2c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM28 64c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm56 12c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM12 53c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm48-6c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm24-40c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM8 24c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm44 40c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm32 31c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM14 78c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm54-52c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm-44-10c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM8 42c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm44 44c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm32-48c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM20 70c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm64-32c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm-44-24c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM12 90c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm76-74c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zM28 6c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1zm48 38c.553 0 1-.447 1-1s-.447-1-1-1-1 .447-1 1 .447 1 1 1z' fill='%230077E6' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")` }}></div>

      {/* Navigation */}
      <nav className="relative z-10 w-full px-6 py-8 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0077E6] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-200">
            T
          </div>
          <span className="hidden sm:block font-bold text-[#1C1917] tracking-tight">The Airport City Church</span>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-8 text-sm font-medium text-slate-500">
          <Link href="/timewithpastor" className="text-[#0077E6] hover:text-blue-700 transition-colors font-semibold">Book a meeting</Link>
          <a href="#about" className="hover:text-[#1C1917] transition-colors hidden md:block">Who we are</a>
          <a href="#contact" className="hover:text-[#1C1917] transition-colors">Contact us</a>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center max-w-5xl mx-auto -mt-12 md:-mt-24">
        <div className="space-y-0 mb-12">
          <h1 className="text-5xl md:text-[6.5rem] font-bold text-slate-400/10 leading-[1.1] tracking-tight select-none">
            We are
          </h1>
          <h1 className="text-5xl md:text-[7.5rem] font-bold text-slate-400/20 leading-[1] tracking-tight select-none">
            building something
          </h1>
          <h2 className="text-6xl md:text-[8.5rem] font-bold text-[#1C1917] leading-[0.9] tracking-tighter flex items-center justify-center gap-4">
            Amazing<span className="w-4 h-4 md:w-8 md:h-8 bg-[#0077E6] rounded-full inline-block mt-4"></span>
          </h2>
        </div>

        <p className="text-lg md:text-xl text-slate-500 mb-12 max-w-xl font-medium leading-relaxed">
          The digital sanctuary of The Airport City Church is under construction. We are building a new way for you to connect and belong.
        </p>

        <Link 
          href="/timewithpastor" 
          className="group relative inline-flex items-center justify-center px-10 py-5 font-bold text-white transition-all duration-200 bg-[#0077E6] rounded-full shadow-xl shadow-blue-200 hover:bg-blue-700"
        >
          <Calendar className="w-5 h-5 mr-3" />
          Book a meeting with Pastor
        </Link>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 py-12 flex flex-col md:flex-row justify-between items-center gap-6 max-w-7xl mx-auto text-xs font-medium text-slate-400 uppercase tracking-widest">
        <div className="flex gap-6">
          <a href="#" className="hover:text-[#1C1917] transition-colors">Instagram</a>
          <a href="#" className="hover:text-[#1C1917] transition-colors">Facebook</a>
          <a href="#" className="hover:text-[#1C1917] transition-colors">Twitter</a>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-600">Coming Soon 2026</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
          <span>Accra, Ghana</span>
        </div>
      </footer>
    </div>
  );
}


