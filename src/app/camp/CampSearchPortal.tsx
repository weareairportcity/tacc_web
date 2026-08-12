"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, MapPin, Users, Key, ChevronLeft, Building2, Loader2, X } from "lucide-react";
import { searchCampAttendees, getRoomAssignmentDetails, AttendeePublic, CampDetails } from "./actions";

interface Props {
  camp: CampDetails | null;
}

export function CampSearchPortal({ camp }: Props) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<AttendeePublic[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<AttendeePublic | null>(null);
  const [roommates, setRoommates] = useState<AttendeePublic[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Secret 3-click logo easter egg to open secret admin portal
  const handleLogoClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 3) { setClickCount(0); router.push("/portal-admin-26"); }
    setTimeout(() => setClickCount(0), 1000);
  };

  // 300ms debounced search
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    const t = setTimeout(async () => {
      const { results } = await searchCampAttendees(searchTerm, camp?.id);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, camp?.id]);

  const handleSelectPerson = async (person: AttendeePublic) => {
    setIsLoading(true);
    const { person: fullPerson, roommates: mates } = await getRoomAssignmentDetails(person.id, camp?.id);
    setSelectedPerson(fullPerson || person);
    setRoommates(mates);
    setIsLoading(false);
    setSearchTerm("");
    setSearchResults([]);
  };

  const handleBack = () => { setSelectedPerson(null); setSearchResults([]); setSearchTerm(""); };

  const campName = camp?.name || "Camp 2026";
  // Extract a short display name (e.g. "TACC Church Camp Meeting 2026" → "Camp Meeting 2026" or just the full name)
  const displayName = campName;

  return (
    <div className="min-h-screen w-full bg-[#fafaf9] text-[#78716c] font-sans antialiased flex flex-col items-center pt-8 px-4 sm:px-6">

      {/* Top Header Bar */}
      <header className="w-full max-w-[1200px] flex justify-between items-center mb-12 sm:mb-16 select-none">
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-2 text-[#0c0a09] font-medium text-[14px] cursor-pointer hover:opacity-80 transition-opacity"
          title="Click 3 times for Admin Portal"
        >
          <Image src="/logo.png" alt="TACC" width={28} height={28} className="rounded object-contain" />
          <span className="font-display font-medium">CampFinder</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-[1200px] flex-grow flex flex-col items-center">

        {isLoading && (
          <div className="fixed inset-0 bg-[#fafaf9]/80 backdrop-blur-xs z-50 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#3ba6f1] animate-spin mb-4" />
            <p className="font-display text-[#0c0a09] text-[20px] font-medium">Finding your room...</p>
          </div>
        )}

        {/* VIEW 1: SEARCH */}
        {!selectedPerson && (
          <div className="w-full max-w-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Camp Logo */}
            {camp?.logo_url && (
              <div className="mb-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={camp.logo_url}
                  alt={campName}
                  className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-[#e8e6e5] shadow-sm"
                />
              </div>
            )}

            <div className="text-center mb-10 max-w-lg">
              <h1 className="font-display-large text-[40px] sm:text-[52px] font-normal text-[#0c0a09] leading-[1.12] mb-4 tracking-[-1.092px]">
                Welcome to{" "}
                <span className="text-[#3398e1] bg-[#c1e1f7] px-2.5 py-0.5 rounded-[4px] font-normal">
                  {displayName}
                </span>
              </h1>
              <p className="text-[16px] leading-[1.69] text-[#78716c]">
                Enter your name below to find your assigned room, building, and check who has the key.
              </p>
            </div>

            {/* Search Input */}
            <div className="w-full relative max-w-xl">
              <div className="relative flex items-center w-full">
                <Search className="absolute left-4 text-[#a8a29e] w-5 h-5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Enter your full name..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-[#d6d3d1] text-[#0c0a09] text-[16px] rounded-[6px] py-4 pl-12 pr-4 focus:outline-none focus:border-[#3ba6f1] focus:ring-1 focus:ring-[#3ba6f1] transition-all placeholder:text-[#a8a29e] shadow-sm"
                  autoFocus
                />
                {isSearching && <Loader2 className="absolute right-4 w-5 h-5 text-[#3ba6f1] animate-spin" />}
              </div>

              {/* Results dropdown */}
              {searchTerm.trim().length > 0 && !isSearching && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden z-40 max-h-[300px] overflow-y-auto">
                  {searchResults.length > 0 ? (
                    searchResults.map(p => (
                      <button key={p.id} onClick={() => handleSelectPerson(p)}
                        className="w-full text-left px-4 py-3 hover:bg-[#fafaf9] transition-colors border-b border-[#fafaf9] last:border-0 flex items-center justify-between cursor-pointer">
                        <div>
                          <div className="font-medium text-[14px] text-[#0c0a09]">{p.full_name}</div>
                          <div className="text-[12px] text-[#a8a29e]">{p.fellowship}</div>
                        </div>
                        {p.room_number && (
                          <span className="font-mono text-[13px] font-semibold text-[#0c0a09] bg-[#fafaf9] border border-[#e8e6e5] px-2 py-1 rounded">{p.room_number}</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-[14px] text-[#a8a29e]">
                      No results for &ldquo;{searchTerm}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: ROOM DETAIL */}
        {selectedPerson && (
          <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button onClick={handleBack}
              className="flex items-center gap-1.5 text-[14px] text-[#78716c] hover:text-[#0c0a09] transition-colors mb-8 cursor-pointer">
              <ChevronLeft size={16} /> Search again
            </button>

            <div className="bg-white border border-[#e8e6e5] rounded-[12px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden">
              {/* Room number hero */}
              <div className="bg-[#0c0a09] px-8 py-10 text-center">
                <div className="text-[#a8a29e] text-[12px] uppercase tracking-[0.12em] mb-2 font-medium">Your Room</div>
                <div className="font-display font-normal text-[80px] sm:text-[96px] text-white leading-none tracking-tight">
                  {selectedPerson.room_number || "TBD"}
                </div>
                {selectedPerson.room_type && (
                  <div className="text-[#a8a29e] text-[14px] mt-3">{selectedPerson.room_type}</div>
                )}
              </div>

              <div className="p-6 space-y-4">
                {/* Person name */}
                <div className="flex items-center gap-3 p-4 bg-[#fafaf9] rounded-[8px] border border-[#e8e6e5]">
                  <MapPin size={16} className="text-[#3ba6f1] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[#a8a29e] uppercase tracking-wider">Name</div>
                    <div className="font-medium text-[#0c0a09]">{selectedPerson.full_name}</div>
                  </div>
                </div>

                {/* Key bearer */}
                {selectedPerson.key_bearer && (
                  <div className="flex items-center gap-3 p-4 bg-[#c1e1f7]/30 rounded-[8px] border border-[#3ba6f1]/30">
                    <Key size={16} className="text-[#3ba6f1] shrink-0" />
                    <div>
                      <div className="text-[11px] text-[#3398e1] uppercase tracking-wider font-semibold">Key Bearer</div>
                      <div className="font-medium text-[#0c0a09]">{selectedPerson.key_bearer}</div>
                    </div>
                  </div>
                )}

                {/* Roommates */}
                {roommates.length > 0 && (
                  <div className="p-4 bg-[#fafaf9] rounded-[8px] border border-[#e8e6e5]">
                    <div className="flex items-center gap-2 mb-3">
                      <Users size={15} className="text-[#3ba6f1]" />
                      <div className="text-[11px] text-[#a8a29e] uppercase tracking-wider">Roommates</div>
                    </div>
                    <div className="space-y-2">
                      {roommates.map(r => (
                        <div key={r.id} className="flex items-center justify-between">
                          <span className="text-[14px] text-[#0c0a09]">{r.full_name}</span>
                          {r.key_bearer === r.full_name && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3398e1] bg-[#c1e1f7]/50 px-2 py-0.5 rounded-full">
                              <Key size={9} /> Key
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-[1200px] py-8 mt-auto flex items-center justify-center">
        <p className="text-[12px] text-[#a8a29e]">{campName} · Room Assignment Portal</p>
      </footer>
    </div>
  );
}
