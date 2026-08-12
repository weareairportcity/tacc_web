"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Users, Key, ChevronLeft, Building2, Flame, Loader2, X } from "lucide-react";
import { searchCampAttendees, getRoomAssignmentDetails, AttendeePublic } from "./actions";

export default function CampPublicSearchPortal() {
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

    if (newCount >= 3) {
      setClickCount(0);
      router.push("/portal-admin-26");
    }

    setTimeout(() => setClickCount(0), 1000);
  };

  // 300ms debounced search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      const { results } = await searchCampAttendees(searchTerm);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleSelectPerson = async (person: AttendeePublic) => {
    setIsLoading(true);
    const { person: fullPerson, roommates: mates } = await getRoomAssignmentDetails(person.id);
    setSelectedPerson(fullPerson || person);
    setRoommates(mates);
    setIsLoading(false);
    setSearchTerm("");
    setSearchResults([]);
  };

  const handleBack = () => {
    setSelectedPerson(null);
    setSearchResults([]);
    setSearchTerm("");
  };

  return (
    <div className="min-h-screen w-full bg-[#fafaf9] text-[#78716c] font-sans antialiased flex flex-col items-center pt-8 px-4 sm:px-6">
      
      {/* Top Header Bar */}
      <header className="w-full max-w-[1200px] flex justify-between items-center mb-12 sm:mb-20 select-none">
        <div
          onClick={handleLogoClick}
          className="flex items-center gap-2 text-[#0c0a09] font-medium text-[14px] cursor-pointer hover:opacity-80 transition-opacity"
          title="Click 3 times for Admin Portal"
        >
          <Flame size={16} strokeWidth={2.5} className="text-[#3ba6f1]" />
          <span className="font-display font-medium">CampFinder</span>
        </div>

        <button
          onClick={() => router.push("/portal-admin-26")}
          className="text-[14px] text-[#78716c] hover:text-[#0c0a09] transition-colors cursor-pointer"
        >
          Portal Access
        </button>
      </header>

      {/* Main Content Container */}
      <main className="w-full max-w-[1200px] flex-grow flex flex-col items-center">

        {/* Global Loading Overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-[#fafaf9]/80 backdrop-blur-xs z-50 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#3ba6f1] animate-spin mb-4" />
            <p className="font-display text-[#0c0a09] text-[20px] font-medium">Finding your room...</p>
          </div>
        )}

        {/* VIEW 1: SEARCH INTERFACE */}
        {!selectedPerson && (
          <div className="w-full max-w-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="text-center mb-10 max-w-lg">
              <h1 className="font-display-large text-[40px] sm:text-[52px] font-normal text-[#0c0a09] leading-[1.12] mb-4 tracking-[-1.092px]">
                Welcome to <span className="text-[#3398e1] bg-[#c1e1f7] px-2.5 py-0.5 rounded-[4px] font-normal">Camp 2026</span>
              </h1>
              <p className="text-[16px] leading-[1.69] text-[#78716c]">
                Enter your name below to find your assigned room, building, and check who has the key.
              </p>
            </div>

            {/* Search Input Container */}
            <div className="w-full relative max-w-xl">
              <div className="relative flex items-center w-full">
                <Search className="absolute left-4 text-[#a8a29e] w-5 h-5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Enter your full name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#d6d3d1] text-[#0c0a09] text-[16px] rounded-[6px] py-4 pl-12 pr-4 focus:outline-none focus:border-[#3ba6f1] focus:ring-1 focus:ring-[#3ba6f1] transition-all placeholder:text-[#a8a29e] shadow-sm"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="absolute right-4 w-5 h-5 text-[#3ba6f1] animate-spin" />
                )}
              </div>

              {/* Search Results Dropdown */}
              {searchTerm.trim().length > 0 && !isSearching && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#ffffff] border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden z-40 max-h-[300px] overflow-y-auto">
                  {searchResults.length > 0 ? (
                    <ul className="py-2">
                      {searchResults.map((person) => (
                        <li key={person.id}>
                          <button
                            onClick={() => handleSelectPerson(person)}
                            className="w-full text-left px-4 py-3 hover:bg-[#fafaf9] flex flex-col gap-1 transition-colors group cursor-pointer"
                          >
                            <span className="text-[16px] text-[#0c0a09] font-medium group-hover:text-[#3398e1] transition-colors">{person.full_name}</span>
                            <span className="text-[13px] text-[#78716c]">{person.fellowship} • {person.room_type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-4 py-8 text-center text-[#78716c] text-[14px]">
                      No attendee found matching "{searchTerm}"
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Decorative Seline Line-Art Mascot Beat */}
            <div className="mt-20 opacity-60 flex flex-col items-center pointer-events-none mb-12">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0c0a09" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(rgba(0,0,0,0.1) 0px 2px 4px)' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="text-[12px] mt-4 text-[#a8a29e]">Quiet lookup</span>
            </div>

          </div>
        )}

        {/* VIEW 2: DETAILED ROOM REVEAL */}
        {selectedPerson && (
          <div className="w-full max-w-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-500">
            
            {/* Seline Floating Hero Reveal Card */}
            <div className="w-full bg-[#ffffff] rounded-[16px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] p-8 sm:p-12 text-center mb-8 border border-[#e8e6e5]">
              <h2 className="text-[20px] font-medium text-[#78716c] mb-1">{selectedPerson.full_name}</h2>
              <p className="text-[14px] text-[#a8a29e] mb-8">{selectedPerson.fellowship}</p>
              
              <div className="font-display-large text-[80px] sm:text-[120px] font-normal text-[#0c0a09] leading-none mb-6 tracking-tighter select-all">
                {selectedPerson.room_number}
              </div>

              <div className="text-[20px] sm:text-[24px] font-medium text-[#78716c] tracking-wide">
                {selectedPerson.room_type}
              </div>
            </div>

            {/* Roommates Card */}
            <div className="w-full bg-[#ffffff] rounded-[10px] border border-[#e8e6e5] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] p-6 sm:p-8 mb-24">
              <h3 className="font-display text-[20px] text-[#0c0a09] mb-6 flex items-center gap-2">
                <Users size={20} className="text-[#a8a29e]"/> 
                Roommates
              </h3>

              <ul className="space-y-4">
                {/* Self */}
                <li className="flex justify-between items-center py-2 border-b border-[#fafaf9]">
                  <span className="text-[16px] text-[#78716c]">{selectedPerson.full_name} (You)</span>
                  {selectedPerson.key_bearer.toLowerCase() === selectedPerson.full_name.toLowerCase() && (
                    <span className="flex items-center gap-1 text-[12px] text-[#3ba6f1] bg-[#c1e1f7]/50 px-2.5 py-1 rounded-[4px] font-medium">
                      <Key size={12} /> Key Bearer
                    </span>
                  )}
                </li>

                {/* Others */}
                {roommates.map((roommate) => {
                  const isKeyHolder = selectedPerson.key_bearer.toLowerCase() === roommate.full_name.toLowerCase();
                  return (
                    <li key={roommate.id} className="flex justify-between items-center py-2 border-b border-[#fafaf9] last:border-0">
                      <span className="text-[16px] text-[#0c0a09] font-medium">{roommate.full_name}</span>
                      {isKeyHolder && (
                        <span className="flex items-center gap-1 text-[12px] text-[#3ba6f1] bg-[#c1e1f7]/50 px-2.5 py-1 rounded-[4px] font-medium">
                          <Key size={12} /> Key Bearer
                        </span>
                      )}
                    </li>
                  );
                })}
                
                {roommates.length === 0 && (
                  <li className="text-[14px] text-[#a8a29e] py-2">You have the room to yourself.</li>
                )}
              </ul>
            </div>

            {/* Fixed Bottom Action - Seline Primary Cyan CTA Button */}
            <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 z-10 pointer-events-none">
              <button
                onClick={handleBack}
                className="pointer-events-auto bg-[#3ba6f1] hover:bg-[#3398e1] text-white border border-[#3398e1] rounded-full px-6 py-3 sm:px-8 sm:py-4 font-medium text-[16px] shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                <ChevronLeft size={20} />
                Check Another Person
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
