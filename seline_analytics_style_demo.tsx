import React, { useState, useEffect } from 'react';
import { Search, MapPin, Users, Key, ChevronLeft, Building2, Flame, Loader2, Upload, Database, X, Plus } from 'lucide-react';

// Mock data for the camp attendees
const mockAttendees = [
  { id: '1', name: 'Kwame Mensah', fellowship: 'Youth Ablaze', roomType: 'Villa', roomNumber: 'V-102', keyBearer: 'Kwame Mensah' },
  { id: '2', name: 'Ama Serwaa', fellowship: 'Women of Valor', roomType: 'Hostel', roomNumber: 'H-304', keyBearer: 'Akosua Osei' },
  { id: '3', name: 'Akosua Osei', fellowship: 'Women of Valor', roomType: 'Hostel', roomNumber: 'H-304', keyBearer: 'Akosua Osei' },
  { id: '4', name: 'Yaw Osei', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-01', keyBearer: 'Kofi Annan' },
  { id: '5', name: 'Abena Mensah', fellowship: 'Youth Ablaze', roomType: 'Wise as Serpents', roomNumber: 'W-05', keyBearer: 'Abena Mensah' },
  { id: '6', name: 'Kofi Annan', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-01', keyBearer: 'Kofi Annan' },
  { id: '7', name: 'Esi Owusu', fellowship: 'Women of Valor', roomType: 'Villa', roomNumber: 'V-205', keyBearer: 'Esi Owusu' },
  { id: '8', name: 'Prince Boakye', fellowship: 'Youth Ablaze', roomType: 'Villa', roomNumber: 'V-102', keyBearer: 'Kwame Mensah' },
  { id: '9', name: 'Samuel Osei', fellowship: 'Youth Ablaze', roomType: 'Villa', roomNumber: 'V-102', keyBearer: 'Kwame Mensah' },
  { id: '10', name: 'Grace Appiah', fellowship: 'Women of Valor', roomType: 'Hostel', roomNumber: 'H-304', keyBearer: 'Akosua Osei' },
  { id: '11', name: 'Esther Baah', fellowship: 'Women of Valor', roomType: 'Hostel', roomNumber: 'H-304', keyBearer: 'Akosua Osei' },
  { id: '12', name: 'Michael Ofori', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-01', keyBearer: 'Kofi Annan' },
  { id: '13', name: 'Daniel Kwarteng', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-01', keyBearer: 'Kofi Annan' },
  { id: '14', name: 'Emmanuel Tetteh', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-01', keyBearer: 'Kofi Annan' },
  { id: '15', name: 'Isaac Addo', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-01', keyBearer: 'Kofi Annan' },
  { id: '16', name: 'Sarah Boadu', fellowship: 'Youth Ablaze', roomType: 'Wise as Serpents', roomNumber: 'W-05', keyBearer: 'Abena Mensah' },
  { id: '17', name: 'Ruth Antwi', fellowship: 'Youth Ablaze', roomType: 'Wise as Serpents', roomNumber: 'W-05', keyBearer: 'Abena Mensah' },
  { id: '18', name: 'Nana Yaa', fellowship: 'Women of Valor', roomType: 'Villa', roomNumber: 'V-205', keyBearer: 'Esi Owusu' },
  { id: '19', name: 'David Opoku', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-02', keyBearer: 'David Opoku' },
  { id: '20', name: 'John Asare', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-02', keyBearer: 'David Opoku' },
  { id: '21', name: 'Peter Arthur', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-02', keyBearer: 'David Opoku' },
  { id: '22', name: 'Paul Amoah', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-02', keyBearer: 'David Opoku' },
  { id: '23', name: 'Simon Osei', fellowship: 'Men of Honor', roomType: 'Dormitory', roomNumber: 'D-02', keyBearer: 'David Opoku' }
];

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  // Load fonts - using Inter Tight as a stand-in for Roobert's geometry
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Inter+Tight:wght@400;500&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Debounced search simulation
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(() => {
      const results = mockAttendees.filter(person => 
        person.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setSearchResults(results);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleLogoClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    
    if (newCount >= 3) {
      setIsAdmin(true);
      setClickCount(0);
      setSelectedPerson(null);
      setSearchTerm('');
    }

    // Reset click count if they don't click 3 times fast enough
    setTimeout(() => setClickCount(0), 1000);
  };

  const handleSelectPerson = (person: any) => {
    setIsLoading(true);
    // Simulate network delay for the "Wow Factor" reveal
    setTimeout(() => {
      setSelectedPerson(person);
      setIsLoading(false);
      setSearchTerm('');
    }, 400);
  };

  const handleBack = () => {
    setSelectedPerson(null);
    setSearchResults([]);
  };

  const getRoommates = (person: any) => {
    return mockAttendees.filter(p => p.roomNumber === person.roomNumber && p.id !== person.id);
  };

  // Inject custom CSS variables and utility classes matching the Seline spec
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      :root {
        --color-stone-canvas: #fafaf9;
        --color-pure-white: #ffffff;
        --color-stone-border: #e8e6e5;
        --color-stone-muted: #d6d3d1;
        --color-ash-gray: #a8a29e;
        --color-warm-gray: #78716c;
        --color-ink-black: #0c0a09;
        --color-sky-wash: #c1e1f7;
        --color-cyan-signal: #3ba6f1;
        --color-cyan-edge: #3398e1;
      }
      body {
        background-color: var(--color-stone-canvas);
        color: var(--color-warm-gray);
        font-family: 'Inter', sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .font-display {
        font-family: 'Inter Tight', sans-serif;
        letter-spacing: -0.025em;
      }
      .font-display-large {
        font-family: 'Inter Tight', sans-serif;
        letter-spacing: -1.092px;
      }
      .seline-shadow-card {
        box-shadow: rgba(0, 0, 0, 0.05) 0px 4px 16px 0px;
      }
      .seline-shadow-hero {
        box-shadow: rgba(17, 12, 46, 0.12) 0px 12px 45px 0px;
      }
      .cyan-highlight {
        color: var(--color-cyan-edge);
        background-color: var(--color-sky-wash);
        padding: 2px 8px;
        border-radius: 4px;
      }
      /* Custom scrollbar for search results */
      ::-webkit-scrollbar {
        width: 6px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      ::-webkit-scrollbar-thumb {
        background: var(--color-stone-muted);
        border-radius: 10px;
      }
      /* Admin Table Styles */
      .admin-table th {
        font-weight: 500;
        color: var(--color-warm-gray);
        border-bottom: 1px solid var(--color-stone-border);
        padding: 12px 16px;
        text-align: left;
        font-size: 13px;
      }
      .admin-table td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--color-stone-canvas);
        color: var(--color-ink-black);
        font-size: 14px;
      }
      .admin-table tr:hover td {
        background-color: var(--color-stone-canvas);
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center pt-8 px-4 sm:px-6 w-full max-w-[1200px] mx-auto">
      
      {}
      <header className="w-full flex justify-between items-center mb-16 sm:mb-24 select-none">
        <div 
          onClick={handleLogoClick}
          className="flex items-center gap-2 text-[#0c0a09] font-medium text-[14px] cursor-pointer hover:opacity-80 transition-opacity"
          title="Click 3 times for Admin"
        >
          <Flame size={16} strokeWidth={2.5} />
          <span>CampFinder</span>
        </div>
        {!selectedPerson && !isAdmin && (
          <div className="text-[14px] text-[#78716c]">
            Portal Access
          </div>
        )}
        {isAdmin && (
          <button 
            onClick={() => setIsAdmin(false)}
            className="flex items-center gap-1 text-[14px] text-[#78716c] hover:text-[#0c0a09] transition-colors"
          >
            <X size={16} /> Exit Admin
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main className="w-full flex-grow flex flex-col items-center">
        
        {/* Loading State Overlay */}
        {isLoading && (
          <div className="fixed inset-0 bg-[#fafaf9]/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
             <Loader2 className="w-8 h-8 text-[#3ba6f1] animate-spin mb-4" />
             <p className="font-display text-[#0c0a09] text-[20px] font-medium">Finding your room...</p>
          </div>
        )}

        {}
        {isAdmin && (
          <div className="w-full max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
              <div>
                <h1 className="font-display-large text-[32px] font-normal text-[#0c0a09] leading-tight">
                  Camp Data <span className="cyan-highlight">Management</span>
                </h1>
                <p className="text-[14px] text-[#78716c] mt-2">Manage attendees, rooms, and key bearers securely.</p>
              </div>
              
              <div className="flex gap-3 w-full sm:w-auto">
                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-transparent border border-[#d6d3d1] text-[#0c0a09] rounded-full px-4 py-2 text-[14px] font-medium hover:bg-[#ffffff] transition-colors">
                  <Upload size={16} />
                  Upload CSV
                </button>
                <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#3ba6f1] border border-[#3398e1] text-[#ffffff] rounded-full px-4 py-2 text-[14px] font-medium hover:bg-[#3398e1] transition-colors shadow-sm">
                  <Plus size={16} />
                  Add Person
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Attendees', value: mockAttendees.length },
                { label: 'Total Rooms', value: new Set(mockAttendees.map(a => a.roomNumber)).size },
                { label: 'Key Bearers', value: new Set(mockAttendees.map(a => a.keyBearer)).size },
                { label: 'Database Status', value: 'Encrypted', icon: <Database size={14} className="text-[#3ba6f1] inline ml-1" /> }
              ].map((stat, i) => (
                <div key={i} className="bg-[#ffffff] border border-[#e8e6e5] rounded-[10px] p-4 shadow-subtle">
                  <div className="text-[13px] text-[#a8a29e] mb-1">{stat.label}</div>
                  <div className="font-display text-[24px] text-[#0c0a09]">{stat.value} {stat.icon}</div>
                </div>
              ))}
            </div>

            {/* Data Table */}
            <div className="bg-[#ffffff] border border-[#e8e6e5] rounded-[10px] shadow-subtle overflow-hidden w-full">
              <div className="overflow-x-auto">
                <table className="w-full admin-table whitespace-nowrap">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Fellowship</th>
                      <th>Room Type</th>
                      <th>Room #</th>
                      <th>Key Bearer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockAttendees.map((person) => (
                      <tr key={person.id}>
                        <td className="font-medium">{person.name}</td>
                        <td>{person.fellowship}</td>
                        <td>
                          <span className="bg-[#fafaf9] border border-[#e8e6e5] px-2 py-1 rounded-[4px] text-[12px] text-[#78716c]">
                            {person.roomType}
                          </span>
                        </td>
                        <td>{person.roomNumber}</td>
                        <td>
                          {person.keyBearer === person.name ? (
                            <span className="text-[#3ba6f1] flex items-center gap-1 text-[13px]">
                              <Key size={12} /> Yes
                            </span>
                          ) : (
                            <span className="text-[#a8a29e] text-[13px]">{person.keyBearer}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* View 1: Search Interface */}
        {!selectedPerson && !isAdmin && (
          <div className="w-full max-w-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="text-center mb-10 max-w-lg">
              <h1 className="font-display-large text-[40px] sm:text-[52px] font-normal text-[#0c0a09] leading-[1.12] mb-4">
                Welcome to <span className="cyan-highlight">Camp 2026</span>
              </h1>
              <p className="text-[16px] leading-[1.69] text-[#78716c]">
                Enter your name below to find your assigned room, building, and check who has the key.
              </p>
            </div>

            {/* Search Input Container */}
            <div className="w-full relative">
              <div className="relative flex items-center w-full">
                <Search className="absolute left-4 text-[#a8a29e] w-5 h-5" />
                <input
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
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#ffffff] border border-[#e8e6e5] rounded-[10px] seline-shadow-card overflow-hidden z-40 max-h-[300px] overflow-y-auto">
                  {searchResults.length > 0 ? (
                    <ul className="py-2">
                      {searchResults.map((person) => (
                        <li key={person.id}>
                          <button
                            onClick={() => handleSelectPerson(person)}
                            className="w-full text-left px-4 py-3 hover:bg-[#fafaf9] flex flex-col gap-1 transition-colors group"
                          >
                            <span className="text-[16px] text-[#0c0a09] font-medium group-hover:text-[#3398e1] transition-colors">{person.name}</span>
                            <span className="text-[13px] text-[#78716c]">{person.fellowship}</span>
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

            {/* Decorative Seline-style mascot / personality beat */}
            <div className="mt-24 opacity-60 flex flex-col items-center pointer-events-none">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0c0a09" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(rgba(0,0,0,0.1) 0px 2px 4px)' }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="text-[12px] mt-4 text-[#a8a29e]">Quiet lookup</span>
            </div>
          </div>
        )}

        {/* View 2: Detailed Room Reveal */}
        {selectedPerson && !isAdmin && (
          <div className="w-full max-w-2xl flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-500">
            
            {/* The Big Reveal - Seline style Floating Dashboard feel */}
            <div className="w-full bg-[#ffffff] rounded-[16px] seline-shadow-hero p-8 sm:p-12 text-center mb-8 border border-[#e8e6e5]">
              <h2 className="text-[20px] font-medium text-[#78716c] mb-2">{selectedPerson.name}</h2>
              <p className="text-[14px] text-[#a8a29e] mb-8">{selectedPerson.fellowship}</p>
              
              <div className="font-display-large text-[80px] sm:text-[120px] font-normal text-[#0c0a09] leading-none mb-6 tracking-tighter">
                {selectedPerson.roomNumber}
              </div>

              <div className="text-[20px] sm:text-[24px] font-medium text-[#78716c] tracking-wide">
                {selectedPerson.roomType}
              </div>
            </div>

            {/* Roommates Card */}
            <div className="w-full bg-[#ffffff] rounded-[10px] border border-[#e8e6e5] seline-shadow-card p-6 sm:p-8 mb-24">
              <h3 className="font-display text-[20px] text-[#0c0a09] mb-6 flex items-center gap-2">
                <Users size={20} className="text-[#a8a29e]"/> 
                Roommates
              </h3>

              <ul className="space-y-4">
                {/* Self */}
                <li className="flex justify-between items-center py-2 border-b border-[#fafaf9]">
                  <span className="text-[16px] text-[#78716c]">{selectedPerson.name} (You)</span>
                  {selectedPerson.keyBearer === selectedPerson.name && (
                    <span className="flex items-center gap-1 text-[12px] text-[#3ba6f1] bg-[#c1e1f7]/50 px-2 py-1 rounded-[4px]">
                      <Key size={12} /> Key Bearer
                    </span>
                  )}
                </li>

                {/* Others */}
                {getRoommates(selectedPerson).map(roommate => (
                  <li key={roommate.id} className="flex justify-between items-center py-2 border-b border-[#fafaf9] last:border-0">
                    <span className="text-[16px] text-[#0c0a09] font-medium">{roommate.name}</span>
                    {selectedPerson.keyBearer === roommate.name && (
                      <span className="flex items-center gap-1 text-[12px] text-[#3ba6f1] bg-[#c1e1f7]/50 px-2 py-1 rounded-[4px]">
                        <Key size={12} /> Key Bearer
                      </span>
                    )}
                  </li>
                ))}
                
                {getRoommates(selectedPerson).length === 0 && (
                  <li className="text-[14px] text-[#a8a29e] py-2">You have the room to yourself.</li>
                )}
              </ul>
            </div>

            {/* Fixed Bottom Action - Seline Primary CTA Button */}
            <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4 z-10 pointer-events-none">
              <button
                onClick={handleBack}
                className="pointer-events-auto bg-[#3ba6f1] hover:bg-[#3398e1] text-[#ffffff] border border-[#3398e1] rounded-full px-6 py-3 sm:px-8 sm:py-4 font-medium text-[16px] shadow-md transition-all flex items-center gap-2 active:scale-95"
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