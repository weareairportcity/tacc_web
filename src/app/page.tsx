import Link from "next/link";
import { BookOpen, Users, UserPlus, Quote, ArrowRight, Mail, Phone, Link as LinkIcon, Camera, MessageCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="dark bg-background text-foreground min-h-screen flex flex-col font-sans">
      {/* Hero Section */}
      <section className="relative px-6 py-24 md:py-32 lg:py-40 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#2a3b4c] rounded-full blur-[120px] opacity-20 -z-10"></div>
        <div className="container max-w-5xl mx-auto flex flex-col items-start gap-6">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-balance max-w-3xl leading-tight">
            Discover Peace through Christ, <br className="hidden md:block" />
            One Prayer at a Time.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl text-balance">
            Whether multiple orthogonal meaning making within our community to highest immaterial reach and church.
          </p>
          <div className="mt-4">
            <Link 
              href="/timewithpastor" 
              className="inline-flex h-12 items-center justify-center rounded-md bg-white text-black px-8 text-sm font-medium transition-colors hover:bg-gray-200"
            >
              Book Time with Pastor
            </Link>
          </div>
        </div>
      </section>

      {/* Features / Guided Programs */}
      <section className="py-24 bg-white dark:bg-[#f8fafc] text-slate-900 rounded-t-[3rem] -mt-10 z-10 relative">
        <div className="container max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight">Features/Guided Programs</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<BookOpen className="w-6 h-6 text-white" />}
              title="Scripture Study"
              description="Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore."
            />
            <FeatureCard 
              icon={<Users className="w-6 h-6 text-white" />}
              title="Community Prayer"
              description="Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia."
            />
            <FeatureCard 
              icon={<UserPlus className="w-6 h-6 text-white" />}
              title="Leadership Guidance"
              description="Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi."
            />
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-gradient-to-b from-[#475569] to-[#0f172a] text-white">
        <div className="container max-w-6xl mx-auto px-6">
          <div className="text-center mb-16 text-balance">
            <p className="text-sm font-medium text-slate-300 uppercase tracking-wider mb-2">Testimonials</p>
            <h2 className="text-3xl md:text-4xl font-bold">Testimonials & Community</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TestimonialCard name="Sarah J." role="Congregation Member" />
            <TestimonialCard name="Mark T." role="Elder" />
            <TestimonialCard name="Rebecca L." role="Youth Leader" />
          </div>
          <div className="flex justify-center gap-2 mt-10">
            <div className="w-2 h-2 rounded-full bg-white"></div>
            <div className="w-2 h-2 rounded-full bg-white/30"></div>
            <div className="w-2 h-2 rounded-full bg-white/30"></div>
            <div className="w-2 h-2 rounded-full bg-white/30"></div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0f172a] text-slate-400 py-16 border-t border-slate-800">
        <div className="container max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4 text-white">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <div className="w-4 h-4 bg-white rounded-full"></div>
              </div>
              <span className="text-xl font-bold">The Airport City Church</span>
            </div>
            <p className="text-sm mb-6 max-w-md">
              Restoring hope through Christ, our endless light and salvation. Join us in worship and prayer.
            </p>
            <div className="flex gap-4">
              <a href="#" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"><MessageCircle className="w-4 h-4" /></a>
              <a href="#" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"><LinkIcon className="w-4 h-4" /></a>
              <a href="#" className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors"><Camera className="w-4 h-4" /></a>
            </div>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Community</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Our Ministries</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Testimonials</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-4">Contact</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> support@theairportcitychurch.com</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> +1244 5947 3890</li>
            </ul>
          </div>
        </div>
        <div className="container max-w-6xl mx-auto px-6 mt-16 pt-8 border-t border-slate-800 text-xs flex flex-col md:flex-row justify-between items-center gap-4">
          <p>Copyright © All About Ministries</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-[#0f172a] text-white p-8 rounded-2xl flex flex-col items-start gap-4 h-full">
      <div className="w-12 h-12 border border-slate-700 rounded-lg flex items-center justify-center bg-slate-800/50">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mt-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed flex-1">
        {description}
      </p>
      <Link href="#" className="inline-flex items-center text-sm font-medium mt-4 hover:text-slate-300 transition-colors">
        Learn More <ArrowRight className="w-4 h-4 ml-1" />
      </Link>
    </div>
  );
}

function TestimonialCard({ name, role }: { name: string, role: string }) {
  return (
    <div className="bg-[#1e293b] p-8 rounded-2xl border border-slate-700 flex flex-col gap-6">
      <Quote className="w-8 h-8 text-slate-500" />
      <p className="text-sm leading-relaxed text-slate-300">
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut sed ex euismod tempor incididunt ut labore et dolore magna aliqua. Quis ipsum suspendisse ultrices gravida."
      </p>
      <div className="flex items-center gap-3 mt-auto pt-4 border-t border-slate-700/50">
        <div className="w-10 h-10 rounded-full bg-slate-600"></div>
        <div>
          <p className="font-semibold text-sm">{name}</p>
          <p className="text-xs text-slate-400">{role}</p>
        </div>
      </div>
    </div>
  );
}
