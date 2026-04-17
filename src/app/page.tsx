import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900">
      {/* Left side: Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-100">
        <Image
          src="/church-hero.jpg"
          alt="Airport City Church"
          fill
          className="object-cover"
          priority
        />
        {/* Optional overlay for better text contrast if needed, but since we don't have text on the image, a subtle blend is nice */}
        <div className="absolute inset-0 bg-blue-900/10 mix-blend-multiply" />
      </div>

      {/* Right side: Content */}
      <div className="w-full lg:w-1/2 flex flex-col p-8 md:p-12 lg:p-24 relative bg-white">
        {/* Logo / Branding */}
        <div className="font-bold text-lg text-slate-900 mb-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 rounded-md flex items-center justify-center text-white font-bold text-sm">
            T
          </div>
          Airport City Church
        </div>

        {/* Hero Content */}
        <div className="my-auto max-w-md pt-12 pb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-medium mb-6 border border-slate-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-600"></span>
            </span>
            Under Construction
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
            Welcome to <br /> Airport City Church.
          </h1>
          <p className="text-slate-500 mb-8 leading-relaxed text-sm md:text-base">
            We're building a new online space for our community to connect and grow.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link 
              href="/timewithpastor" 
              className="inline-flex items-center justify-center h-10 px-6 font-medium text-sm text-white transition-colors bg-slate-900 rounded-md hover:bg-slate-800"
            >
              Book a Meeting
            </Link>
            <Link 
              href="#about" 
              className="inline-flex items-center justify-center h-10 px-6 font-medium text-sm text-slate-900 transition-colors bg-white border border-slate-200 rounded-md hover:bg-slate-50"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* Footer / Copyright */}
        <div className="mt-auto text-xs text-slate-400 font-medium">
          © {new Date().getFullYear()} Airport City Church. All rights reserved.
        </div>
      </div>
    </div>
  );
}
