"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, MapPin, Users, Key, Building2, Flame, Loader2, RefreshCw, Sparkles, ShieldCheck } from "lucide-react";
import { searchCampAttendees, getRoomAssignmentDetails, AttendeePublic } from "./actions";

export default function CampPublicSearchPortal() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<AttendeePublic[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<AttendeePublic | null>(null);
  const [roommates, setRoommates] = useState<AttendeePublic[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search bar on mount
  useEffect(() => {
    if (searchInputRef.current && !selectedPerson) {
      searchInputRef.current.focus();
    }
  }, [selectedPerson]);

  // 300ms debounced search keystrokes calling Server Action
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const handler = setTimeout(async () => {
      const { results } = await searchCampAttendees(searchTerm);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm]);

  const handleSelectPerson = async (person: AttendeePublic) => {
    setIsLoadingDetails(true);
    const { person: fullPerson, roommates: roomMatesList } = await getRoomAssignmentDetails(person.id);
    setSelectedPerson(fullPerson || person);
    setRoommates(roomMatesList);
    setIsLoadingDetails(false);
    setSearchTerm("");
    setSearchResults([]);
  };

  const handleResetSearch = () => {
    setSelectedPerson(null);
    setRoommates([]);
    setSearchTerm("");
    setSearchResults([]);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#78716c] font-sans antialiased flex flex-col items-center justify-between p-4 sm:p-6 md:p-8 w-full max-w-[1200px] mx-auto select-none">
      
      {/* Top Header */}
      <header className="w-full flex justify-between items-center py-4 mb-8 sm:mb-12">
        <div className="flex items-center gap-2 text-[#0c0a09] font-medium text-[15px]">
          <div className="w-8 h-8 rounded-full bg-white border border-[#e8e6e5] flex items-center justify-center text-[#3ba6f1] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
            <Flame className="w-4 h-4 fill-current" />
          </div>
          <span className="font-display font-medium tracking-tight text-[#0c0a09] text-base">TACC CampFinder</span>
        </div>

        <Link
          href="/camp/admin/create"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#e8e6e5] bg-white text-xs font-medium text-[#78716c] hover:text-[#0c0a09] hover:border-[#d6d3d1] transition-all shadow-[rgba(0,0,0,0.05)_0px_1px_2px_0px]"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-[#3ba6f1]" />
          <span>Camp Staff</span>
        </Link>
      </header>

      {/* Main Container */}
      <main className="w-full max-w-[560px] my-auto flex flex-col items-center">

        {/* VIEW 1: SEARCH STATE */}
        {!selectedPerson && (
          <div className="w-full flex flex-col items-center text-center animate-fadeIn">
            
            {/* Header Title */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#c1e1f7]/40 text-[#3398e1] text-xs font-medium mb-6 border border-[#c1e1f7]/60">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Church Camp Meeting 2026</span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-normal text-[#0c0a09] tracking-[-0.025em] leading-[1.15] mb-4">
              Find your <span className="text-[#3398e1] bg-[#c1e1f7] px-2.5 py-0.5 rounded-md font-normal inline-block">room & key</span>
            </h1>

            <p className="text-sm sm:text-base text-[#78716c] mb-8 max-w-[420px] leading-relaxed">
              Search your name below to instantly view your building, assigned room number, and key bearer.
            </p>

            {/* Centered Search Bar Input */}
            <div className="relative w-full mb-4">
              <div className="relative flex items-center">
                <Search className="absolute left-4 w-5 h-5 text-[#a8a29e] pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Type your full name (e.g. Kwame Mensah)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-10 py-3.5 bg-white border border-[#e8e6e5] rounded-[10px] text-base text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1] focus:border-transparent shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-all"
                />
                {isSearching ? (
                  <Loader2 className="absolute right-4 w-5 h-5 text-[#3ba6f1] animate-spin" />
                ) : searchTerm ? (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-4 text-[#a8a29e] hover:text-[#0c0a09] text-xs font-semibold uppercase tracking-wider"
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              {/* Skeleton Loader State */}
              {isSearching && (
                <div className="mt-3 w-full bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] space-y-3">
                  <div className="h-4 bg-[#fafaf9] rounded animate-pulse w-3/4" />
                  <div className="h-4 bg-[#fafaf9] rounded animate-pulse w-1/2" />
                  <div className="h-4 bg-[#fafaf9] rounded animate-pulse w-2/3" />
                </div>
              )}

              {/* Live Search Results Dropdown */}
              {!isSearching && searchResults.length > 0 && (
                <div className="mt-2 w-full bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] max-h-[320px] overflow-y-auto divide-y divide-[#fafaf9] text-left z-20">
                  {searchResults.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => handleSelectPerson(person)}
                      className="w-full px-4 py-3.5 hover:bg-[#fafaf9] flex items-center justify-between group transition-colors text-left"
                    >
                      <div>
                        <div className="text-[#0c0a09] font-medium text-sm group-hover:text-[#3398e1] transition-colors">
                          {person.full_name}
                        </div>
                        <div className="text-xs text-[#a8a29e] flex items-center gap-2 mt-0.5">
                          <span>{person.fellowship}</span>
                          <span>•</span>
                          <span className="text-[#78716c] font-medium">{person.room_type}</span>
                        </div>
                      </div>
                      <div className="text-xs font-mono font-semibold px-2 py-1 bg-[#fafaf9] border border-[#e8e6e5] rounded text-[#0c0a09]">
                        {person.room_number}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No Results Fallback */}
              {!isSearching && searchTerm.trim().length > 2 && searchResults.length === 0 && (
                <div className="mt-3 w-full bg-white border border-[#e8e6e5] rounded-[10px] p-6 text-center shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
                  <p className="text-sm text-[#0c0a09] font-medium mb-1">No attendee found matching "{searchTerm}"</p>
                  <p className="text-xs text-[#a8a29e]">Please check the spelling or ask camp info desk for help.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: ROOM ASSIGNMENT RESULT VIEW */}
        {selectedPerson && (
          <div className="w-full flex flex-col items-center text-center animate-fadeIn">
            
            {/* Loading Indicator when details are fetched */}
            {isLoadingDetails ? (
              <div className="p-12 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#3ba6f1] animate-spin mb-3" />
                <p className="text-sm text-[#78716c]">Retrieving your room assignment...</p>
              </div>
            ) : (
              <div className="w-full">
                
                {/* Person Badge */}
                <div className="mb-6 inline-flex flex-col items-center">
                  <h2 className="text-lg font-medium text-[#0c0a09] tracking-tight">
                    {selectedPerson.full_name}
                  </h2>
                  <span className="text-xs text-[#a8a29e] uppercase tracking-wider font-medium mt-0.5">
                    {selectedPerson.fellowship}
                  </span>
                </div>

                {/* Main Floating Card */}
                <div className="w-full bg-white border border-[#e8e6e5] rounded-[10px] p-8 sm:p-10 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] flex flex-col items-center mb-8 relative overflow-hidden">
                  
                  {/* Subtle top cyan line indicator */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#3ba6f1]" />

                  <span className="text-xs uppercase tracking-widest text-[#a8a29e] font-semibold mb-2">
                    Assigned Room Number
                  </span>

                  {/* MASSIVE TYPOGRAPHY FOR ROOM NUMBER (80px+) */}
                  <div className="font-display font-normal text-[88px] sm:text-[104px] text-[#0c0a09] leading-none tracking-[-0.04em] my-2 select-all">
                    {selectedPerson.room_number}
                  </div>

                  {/* Room Type directly beneath */}
                  <div className="text-base sm:text-lg text-[#0c0a09] font-medium mt-1 mb-8 flex items-center justify-center gap-2">
                    <Building2 className="w-4 h-4 text-[#3ba6f1]" />
                    <span>{selectedPerson.room_type}</span>
                  </div>

                  {/* Key Bearer Box */}
                  <div className="w-full bg-[#fafaf9] border border-[#e8e6e5] rounded-[10px] p-4 flex items-center justify-between text-left mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#c1e1f7] text-[#3398e1] flex items-center justify-center flex-shrink-0">
                        <Key className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs text-[#a8a29e] font-medium uppercase tracking-wider">
                          Holds Physical Key
                        </div>
                        <div className="text-sm font-semibold text-[#0c0a09] mt-0.5">
                          {selectedPerson.key_bearer}
                        </div>
                      </div>
                    </div>

                    {selectedPerson.key_bearer.toLowerCase() === selectedPerson.full_name.toLowerCase() ? (
                      <span className="text-[11px] font-semibold bg-[#3ba6f1] text-white px-2.5 py-1 rounded-full uppercase tracking-wider">
                        You Have Key
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-[#78716c] bg-white border border-[#e8e6e5] px-2.5 py-1 rounded-full">
                        Roommate
                      </span>
                    )}
                  </div>

                  {/* Roommates List */}
                  <div className="w-full text-left pt-4 border-t border-[#e8e6e5]">
                    <div className="text-xs font-semibold text-[#a8a29e] uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#78716c]" />
                        Roommates ({roommates.length + 1} Total)
                      </span>
                    </div>

                    <div className="space-y-2">
                      {/* Self item */}
                      <div className="p-2.5 rounded-lg bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#0c0a09]">
                          {selectedPerson.full_name} <span className="text-[#a8a29e] font-normal">(You)</span>
                        </span>
                        {selectedPerson.key_bearer.toLowerCase() === selectedPerson.full_name.toLowerCase() && (
                          <span className="inline-flex items-center gap-1 text-[#3398e1] font-semibold">
                            <Key className="w-3 h-3" /> Key Bearer
                          </span>
                        )}
                      </div>

                      {/* Roommates list */}
                      {roommates.map((rm) => {
                        const isKeyHolder = rm.full_name.toLowerCase() === selectedPerson.key_bearer.toLowerCase();
                        return (
                          <div
                            key={rm.id}
                            className="p-2.5 rounded-lg bg-white border border-[#e8e6e5] flex items-center justify-between text-xs text-[#0c0a09]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{rm.full_name}</span>
                              <span className="text-[#a8a29e]">• {rm.fellowship}</span>
                            </div>
                            {isKeyHolder && (
                              <span className="inline-flex items-center gap-1 text-[#3398e1] font-semibold bg-[#c1e1f7]/50 px-2 py-0.5 rounded">
                                <Key className="w-3 h-3" /> Key Bearer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Fixed "Check Another Person" Button */}
                <div className="w-full flex justify-center">
                  <button
                    onClick={handleResetSearch}
                    className="w-full sm:w-auto px-8 py-3.5 bg-[#3ba6f1] hover:bg-[#3398e1] text-white font-medium text-sm rounded-full shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Check Another Person</span>
                  </button>
                </div>

              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full py-6 mt-12 text-center text-xs text-[#a8a29e] border-t border-[#e8e6e5] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          © 2026 TACC Church Camp Meeting • All rights reserved
        </div>
        <div className="flex items-center gap-4 text-[#78716c]">
          <Link href="/camp/admin/create" className="hover:text-[#0c0a09] transition-colors">
            Camp Admin Dashboard
          </Link>
        </div>
      </footer>

    </div>
  );
}
