import Link from "next/link";
import { Hammer, Calendar, Mail, Phone, MessageCircle, Camera, Link as LinkIcon, Instagram, Facebook, Twitter } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col font-sans relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/church-hero.jpg')" }}
      >
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px]"></div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto py-20">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/80 text-sm mb-8 animate-pulse">
          <Hammer className="w-4 h-4" />
          <span>Building for His Glory</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight leading-tight">
          Laying the Foundation for a <span className="text-indigo-400">New Experience</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-2xl leading-relaxed">
          The Airport City Church website is currently under renovation. We are crafting a digital sanctuary to better serve our community. We'll be back online soon!
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link 
            href="/timewithpastor" 
            className="inline-flex h-14 items-center justify-center rounded-full bg-white text-slate-950 px-8 text-base font-semibold transition-all hover:scale-105 active:scale-95 shadow-xl shadow-white/10"
          >
            <Calendar className="w-5 h-5 mr-2" />
            Book Time with Pastor
          </Link>
          <a 
            href="mailto:support@theairportcitychurch.com"
            className="inline-flex h-14 items-center justify-center rounded-full bg-slate-900/50 text-white border border-white/20 px-8 text-base font-semibold backdrop-blur-md transition-all hover:bg-slate-800"
          >
            Contact Support
          </a>
        </div>
      </main>

      {/* Footer / Socials */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
            <div className="w-5 h-5 bg-white rounded-full"></div>
          </div>
          <span className="text-xl font-bold tracking-tight">The Airport City Church</span>
        </div>

        <div className="flex gap-6">
          <SocialLink icon={<Instagram className="w-5 h-5" />} href="#" />
          <SocialLink icon={<Facebook className="w-5 h-5" />} href="#" />
          <SocialLink icon={<Twitter className="w-5 h-5" />} href="#" />
        </div>

        <p className="text-sm text-slate-400">
          © {new Date().getFullYear()} The Airport City Church. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function SocialLink({ icon, href }: { icon: React.ReactNode, href: string }) {
  return (
    <a 
      href={href} 
      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
    >
      {icon}
    </a>
  );
}

