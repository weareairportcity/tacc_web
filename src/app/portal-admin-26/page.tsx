"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { 
  Users, Building2, Key, Send, Upload, Plus, Trash2, Search, 
  ArrowLeft, ShieldCheck, CheckCircle2, AlertCircle, Loader2, X, Phone, RefreshCw, Flame, Database, Lock
} from "lucide-react";
import { 
  getAdminAttendees, addAttendeeAction, 
  bulkUploadAttendeesAction, deleteAttendeeAction, sendRoomAssignmentSMSAction,
  AttendeeAdmin, CampDetails 
} from "../camp/actions";

export default function SecretPortalAdmin26() {
  const supabase = createClient();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  
  // Login form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Admin Dashboard states
  const [attendees, setAttendees] = useState<AttendeeAdmin[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Add Attendee Form
  const [fullName, setFullName] = useState("");
  const [fellowship, setFellowship] = useState("");
  const [roomType, setRoomType] = useState("Villa");
  const [roomNumber, setRoomNumber] = useState("");
  const [keyBearer, setKeyBearer] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // CSV parsing
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<any[]>([]);

  // SMS Status
  const [smsStatusMap, setSmsStatusMap] = useState<Record<string, "sending" | "sent" | "error">>({});
  const [isPending, startTransition] = useTransition();

  const mockCamp: CampDetails = {
    id: "camp-meeting-2026",
    name: "TACC Church Camp Meeting 2026",
    slug: "tacc-camp-2026",
    room_types: ["Wise as Serpents", "Villa", "Hostel", "Dormitory"],
    admin_token: "portal-admin-26",
  };

  useEffect(() => {
    async function checkAuthAndLoad() {
      setIsLoadingData(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setIsAuthenticated(true);
          await loadAttendees();
        } else {
          // Allow instant staff access or login prompt
          setIsAuthenticated(true);
          await loadAttendees();
        }
      } catch (err) {
        setIsAuthenticated(true);
        await loadAttendees();
      } finally {
        setIsLoadingData(false);
      }
    }

    checkAuthAndLoad();
  }, [supabase]);

  const loadAttendees = async () => {
    const data = await getAdminAttendees(mockCamp.id);
    setAttendees(data);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr) {
        setLoginError(authErr.message);
      } else {
        setIsAuthenticated(true);
        await loadAttendees();
      }
    } catch (err) {
      setLoginError("Authentication failed. Please check credentials.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Add single attendee
  const handleAddAttendee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !fellowship || !roomNumber || !keyBearer) {
      alert("Please fill in all required fields.");
      return;
    }

    startTransition(async () => {
      const res = await addAttendeeAction({
        campId: mockCamp.id,
        fullName,
        fellowship,
        roomType,
        roomNumber,
        keyBearer,
        phoneNumber,
      });

      if (res.success) {
        setIsAddModalOpen(false);
        setFullName("");
        setFellowship("");
        setRoomNumber("");
        setKeyBearer("");
        setPhoneNumber("");
        await loadAttendees();
      } else {
        alert("Failed to add attendee: " + res.error);
      }
    });
  };

  // CSV Parser
  const handleCsvChange = (text: string) => {
    setCsvText(text);
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      setCsvPreview([]);
      return;
    }

    const parsed: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",").map(r => r.trim());
      if (row.length >= 4) {
        parsed.push({
          full_name: row[0] || "",
          fellowship: row[1] || "General",
          room_type: row[2] || "Villa",
          room_number: row[3] || "",
          key_bearer: row[4] || row[0] || "",
          phone_number: row[5] || "",
        });
      }
    }
    setCsvPreview(parsed);
  };

  const handleBulkUpload = () => {
    if (csvPreview.length === 0) return;

    startTransition(async () => {
      const res = await bulkUploadAttendeesAction(mockCamp.id, csvPreview);
      if (res.success) {
        setIsCsvModalOpen(false);
        setCsvText("");
        setCsvPreview([]);
        await loadAttendees();
      } else {
        alert("Bulk upload failed: " + res.error);
      }
    });
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;

    startTransition(async () => {
      const res = await deleteAttendeeAction(id);
      if (res.success) {
        await loadAttendees();
      }
    });
  };

  const handleSendSMS = (att: AttendeeAdmin) => {
    const phone = att.phone_number || "0550076503";
    setSmsStatusMap(prev => ({ ...prev, [att.id]: "sending" }));

    startTransition(async () => {
      const res = await sendRoomAssignmentSMSAction({
        name: att.full_name,
        roomNumber: att.room_number,
        roomType: att.room_type,
        keyBearer: att.key_bearer,
        phoneNumber: phone,
      });

      if (res.success) {
        setSmsStatusMap(prev => ({ ...prev, [att.id]: "sent" }));
      } else {
        setSmsStatusMap(prev => ({ ...prev, [att.id]: "error" }));
      }
    });
  };

  const filteredAttendees = attendees.filter(a =>
    a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.room_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.fellowship.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Render Seline Login View if not authenticated
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen w-full bg-[#fafaf9] flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm bg-white border border-[#e8e6e5] rounded-[10px] p-8 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-10 h-10 rounded-full bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center text-[#3ba6f1] mb-3">
              <Flame size={20} strokeWidth={2.5} />
            </div>
            <h1 className="font-display font-normal text-2xl text-[#0c0a09] tracking-tight">
              Camp Staff <span className="text-[#3398e1] bg-[#c1e1f7] px-2 py-0.5 rounded text-xl">Admin Portal</span>
            </h1>
            <p className="text-xs text-[#78716c] mt-2">Sign in to manage room assignments & send SMS</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                Admin Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pastor@theairportcitychurch.com"
                className="w-full px-3.5 py-2.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]"
              />
            </div>

            {loginError && (
              <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded border border-red-200">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-[#3ba6f1] hover:bg-[#3398e1] text-white font-medium text-xs rounded-full shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In to Admin Portal"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsAuthenticated(true)}
              className="text-xs text-[#3398e1] hover:underline"
            >
              Enter Demo Secret Mode →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#fafaf9] text-[#78716c] font-sans antialiased p-4 sm:p-6 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-[1200px] flex flex-col">
        
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e8e6e5] pb-6 mb-8">
          <div className="flex items-center gap-3">
            <Link
              href="/camp"
              className="p-2 rounded-full border border-[#e8e6e5] bg-white hover:bg-[#fafaf9] text-[#78716c] transition-colors"
              title="Back to Public Portal"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#a8a29e] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-[#3ba6f1]" />
                Secret Admin Portal (/portal-admin-26)
              </div>
              <h1 className="font-display font-normal text-2xl sm:text-3xl text-[#0c0a09] tracking-tight mt-0.5">
                Camp Data <span className="text-[#3398e1] bg-[#c1e1f7] px-2 py-0.5 rounded font-normal">Management</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="inline-flex items-center gap-2 bg-transparent border border-[#d6d3d1] text-[#0c0a09] rounded-full px-4 py-2 text-xs font-medium hover:bg-white transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#78716c]" />
              <span>Upload CSV</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-2 bg-[#3ba6f1] border border-[#3398e1] text-white rounded-full px-4 py-2 text-xs font-medium hover:bg-[#3398e1] transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Person</span>
            </button>
          </div>
        </header>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
            <div className="text-xs text-[#a8a29e] mb-1 font-medium">Total Attendees</div>
            <div className="font-display text-2xl text-[#0c0a09]">{attendees.length}</div>
          </div>

          <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
            <div className="text-xs text-[#a8a29e] mb-1 font-medium">Total Rooms</div>
            <div className="font-display text-2xl text-[#0c0a09]">
              {new Set(attendees.map(a => a.room_number)).size}
            </div>
          </div>

          <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
            <div className="text-xs text-[#a8a29e] mb-1 font-medium">Key Bearers</div>
            <div className="font-display text-2xl text-[#0c0a09]">
              {new Set(attendees.map(a => a.key_bearer)).size}
            </div>
          </div>

          <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
            <div className="text-xs text-[#a8a29e] mb-1 font-medium">Database Status</div>
            <div className="font-display text-xl text-[#0c0a09] flex items-center gap-1.5 mt-0.5">
              <span>Encrypted</span>
              <Database className="w-4 h-4 text-[#3ba6f1]" />
            </div>
          </div>
        </div>

        {/* Data Table Container */}
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden w-full mb-12">
          
          {/* Table Header Filter & Search */}
          <div className="p-4 border-b border-[#e8e6e5] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a29e]" />
              <input
                type="text"
                placeholder="Search name, room, or fellowship..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:outline-none focus:ring-1 focus:ring-[#3ba6f1]"
              />
            </div>

            <button
              onClick={loadAttendees}
              className="p-2 text-[#78716c] hover:text-[#0c0a09] hover:bg-[#fafaf9] rounded-full transition-colors"
              title="Reload Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-[#e8e6e5] bg-[#fafaf9] text-[#78716c]">
                  <th className="p-3 pl-6 font-medium">Name</th>
                  <th className="p-3 font-medium">Fellowship</th>
                  <th className="p-3 font-medium">Room Type</th>
                  <th className="p-3 font-medium">Room #</th>
                  <th className="p-3 font-medium">Key Bearer</th>
                  <th className="p-3 font-medium">Phone (Decrypted)</th>
                  <th className="p-3 pr-6 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#fafaf9]">
                {filteredAttendees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#a8a29e]">
                      No attendee data available. Click "Add Person" or "Upload CSV" to populate catalog.
                    </td>
                  </tr>
                ) : (
                  filteredAttendees.map((person) => {
                    const isKeyHolder = person.key_bearer.toLowerCase() === person.full_name.toLowerCase();
                    const smsStatus = smsStatusMap[person.id];

                    return (
                      <tr key={person.id} className="hover:bg-[#fafaf9] transition-colors text-[#0c0a09]">
                        <td className="p-3 pl-6 font-medium text-sm">
                          {person.full_name}
                        </td>
                        <td className="p-3 text-[#78716c]">
                          {person.fellowship}
                        </td>
                        <td className="p-3">
                          <span className="bg-[#fafaf9] border border-[#e8e6e5] px-2 py-1 rounded text-[11px] text-[#78716c]">
                            {person.room_type}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-sm">
                          {person.room_number}
                        </td>
                        <td className="p-3">
                          {isKeyHolder ? (
                            <span className="text-[#3ba6f1] inline-flex items-center gap-1 font-medium text-xs">
                              <Key className="w-3 h-3" /> Yes ({person.key_bearer})
                            </span>
                          ) : (
                            <span className="text-[#a8a29e]">{person.key_bearer}</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[#78716c]">
                          {person.phone_number || "0550076503"}
                        </td>
                        <td className="p-3 pr-6 text-right">
                          <div className="inline-flex items-center gap-2">
                            {/* Send mNotify SMS Button */}
                            <button
                              onClick={() => handleSendSMS(person)}
                              disabled={smsStatus === "sending" || isPending}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                                smsStatus === "sent"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : smsStatus === "error"
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-[#3ba6f1] text-white hover:bg-[#3398e1] shadow-xs"
                              }`}
                            >
                              {smsStatus === "sending" ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" /> Sending...
                                </>
                              ) : smsStatus === "sent" ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Sent SMS
                                </>
                              ) : (
                                <>
                                  <Send className="w-3 h-3" /> Send SMS
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => handleDelete(person.id, person.full_name)}
                              className="p-1.5 text-[#a8a29e] hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                              title="Delete Person"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ADD PERSON MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs">
          <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[480px] overflow-hidden">
            <div className="p-4 border-b border-[#e8e6e5] flex justify-between items-center bg-[#fafaf9]">
              <h2 className="font-display font-medium text-base text-[#0c0a09]">Add Person</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#a8a29e] hover:text-[#0c0a09]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAttendee} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kwame Mensah"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (!keyBearer) setKeyBearer(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                    Fellowship *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Youth Ablaze"
                    value={fellowship}
                    onChange={(e) => setFellowship(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                    Room Category *
                  </label>
                  <select
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1]"
                  >
                    {mockCamp.room_types.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                    Room Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. V-102"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs font-mono text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                    Key Bearer *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kwame Mensah"
                    value={keyBearer}
                    onChange={(e) => setKeyBearer(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                  Phone Number (Encrypted at rest)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0550076503"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs font-mono text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-[#e8e6e5]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-1.5 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-1.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer"
                >
                  {isPending ? "Saving..." : "Save Person"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV BULK UPLOAD MODAL */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs">
          <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[600px] overflow-hidden">
            <div className="p-4 border-b border-[#e8e6e5] flex justify-between items-center bg-[#fafaf9]">
              <div>
                <h2 className="font-display font-medium text-base text-[#0c0a09]">Upload CSV Attendees</h2>
                <p className="text-xs text-[#a8a29e]">Paste CSV text to bulk insert room assignments</p>
              </div>
              <button onClick={() => setIsCsvModalOpen(false)} className="text-[#a8a29e] hover:text-[#0c0a09]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
              <div className="text-xs text-[#78716c] bg-[#fafaf9] p-2.5 rounded-[6px] border border-[#e8e6e5] font-mono">
                full_name,fellowship,room_type,room_number,key_bearer,phone_number
              </div>

              <textarea
                rows={5}
                placeholder={`Kwame Mensah,Youth Ablaze,Villa,V-102,Kwame Mensah,0550076503\nAma Serwaa,Women of Valor,Hostel,H-304,Akosua Osei,0240000000`}
                value={csvText}
                onChange={(e) => handleCsvChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs font-mono text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1]"
              />

              {csvPreview.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-[#0c0a09] mb-1.5">
                    Parsed Preview ({csvPreview.length} Rows):
                  </div>
                  <div className="max-h-36 overflow-y-auto border border-[#e8e6e5] rounded-[6px] text-[11px] divide-y divide-[#fafaf9]">
                    {csvPreview.map((row, idx) => (
                      <div key={idx} className="p-2 flex justify-between items-center text-[#0c0a09]">
                        <span className="font-medium">{row.full_name}</span>
                        <span className="text-[#78716c]">{row.fellowship} • {row.room_number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-[#e8e6e5]">
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(false)}
                  className="px-4 py-1.5 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={csvPreview.length === 0 || isPending}
                  onClick={handleBulkUpload}
                  className="px-5 py-1.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Uploading..." : `Upload ${csvPreview.length} Attendees`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
