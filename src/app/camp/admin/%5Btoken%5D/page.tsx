"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Users, Building2, Key, Send, Upload, Plus, Trash2, Search, 
  ArrowLeft, ShieldCheck, CheckCircle2, AlertCircle, Loader2, X, Phone, RefreshCw, Sparkles 
} from "lucide-react";
import { 
  getCampByToken, getAdminAttendees, addAttendeeAction, 
  bulkUploadAttendeesAction, deleteAttendeeAction, sendRoomAssignmentSMSAction,
  AttendeeAdmin, CampDetails 
} from "../../actions";

export default function ProtectedCampAdminDashboard() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [camp, setCamp] = useState<CampDetails | null>(null);
  const [attendees, setAttendees] = useState<AttendeeAdmin[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [fellowship, setFellowship] = useState("");
  const [roomType, setRoomType] = useState("Villa");
  const [roomNumber, setRoomNumber] = useState("");
  const [keyBearer, setKeyBearer] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  // CSV parsing state
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<any[]>([]);

  // SMS status map
  const [smsStatusMap, setSmsStatusMap] = useState<Record<string, "sending" | "sent" | "error">>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      setError("");

      const campData = await getCampByToken(token);
      if (!campData) {
        // If demo route or fallback token
        if (token === "portal-admin-26" || token === "demo-admin-token") {
          const demoCamp: CampDetails = {
            id: "demo-camp-id",
            name: "TACC Camp Meeting 2026",
            slug: "tacc-camp-2026",
            room_types: ["Wise as Serpents", "Villa", "Hostel", "Dormitory"],
            admin_token: token,
          };
          setCamp(demoCamp);
          const atts = await getAdminAttendees(demoCamp.id);
          setAttendees(atts);
        } else {
          setError("Invalid or unauthorized camp admin portal token.");
        }
      } else {
        setCamp(campData);
        if (campData.room_types?.length > 0) {
          setRoomType(campData.room_types[0]);
        }
        const atts = await getAdminAttendees(campData.id);
        setAttendees(atts);
      }
      setIsLoading(false);
    }

    if (token) {
      loadDashboard();
    }
  }, [token]);

  // Refresh attendees list
  const refreshAttendees = async () => {
    if (!camp) return;
    const atts = await getAdminAttendees(camp.id);
    setAttendees(atts);
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
        campId: camp?.id || "demo-camp-id",
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
        await refreshAttendees();
      } else {
        alert("Failed to add attendee: " + res.error);
      }
    });
  };

  // Parse CSV text client-side
  const handleCsvChange = (text: string) => {
    setCsvText(text);
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      setCsvPreview([]);
      return;
    }

    const parsed: any[] = [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));

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

  // Handle Bulk CSV Upload
  const handleBulkUpload = () => {
    if (csvPreview.length === 0) {
      alert("No valid rows found in CSV preview.");
      return;
    }

    startTransition(async () => {
      const res = await bulkUploadAttendeesAction(camp?.id || "demo-camp-id", csvPreview);
      if (res.success) {
        setIsCsvModalOpen(false);
        setCsvText("");
        setCsvPreview([]);
        await refreshAttendees();
      } else {
        alert("Bulk upload failed: " + res.error);
      }
    });
  };

  // Delete single attendee
  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;

    startTransition(async () => {
      const res = await deleteAttendeeAction(id);
      if (res.success) {
        await refreshAttendees();
      } else {
        alert("Delete error: " + res.error);
      }
    });
  };

  // WOW Factor: Send mNotify SMS
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

  // Stats calculation
  const totalAttendees = attendees.length;
  const uniqueRooms = new Set(attendees.map(a => a.room_number)).size;
  const keyBearersCount = new Set(attendees.map(a => a.key_bearer)).size;

  const filteredAttendees = attendees.filter(a =>
    a.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.room_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.fellowship.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6">
        <Loader2 className="w-8 h-8 text-[#3ba6f1] animate-spin mb-3" />
        <p className="text-sm text-[#78716c]">Loading Protected Camp Portal...</p>
      </div>
    );
  }

  if (error || !camp) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
        <h1 className="text-xl font-bold text-[#0c0a09] mb-2">Access Restricted</h1>
        <p className="text-sm text-[#78716c] max-w-[400px] mb-6">{error || "Invalid secret portal token."}</p>
        <Link
          href="/camp/admin/create"
          className="px-6 py-2.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]"
        >
          Create New Camp Meeting
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#78716c] font-sans antialiased p-4 sm:p-6 md:p-8 w-full max-w-[1200px] mx-auto select-none">
      
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e8e6e5] pb-6 mb-8">
        <div className="flex items-center gap-3">
          <Link
            href="/camp"
            className="p-2 rounded-full border border-[#e8e6e5] bg-white hover:bg-[#fafaf9] text-[#78716c] transition-colors"
            title="Public Search Portal"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[#a8a29e] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3ba6f1]" />
              Secret Admin Portal
            </div>
            <h1 className="font-display font-normal text-2xl sm:text-3xl text-[#0c0a09] tracking-tight mt-0.5">
              {camp.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#e8e6e5] hover:border-[#d6d3d1] text-[#0c0a09] text-xs font-medium rounded-full shadow-[rgba(0,0,0,0.05)_0px_1px_2px_0px] transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#78716c]" />
            <span>Upload CSV</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Attendee</span>
          </button>
        </div>
      </header>

      {/* Seline Analytics Stats Overview Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#3ba6f1]" /> Total Attendees
          </div>
          <div className="font-display font-normal text-3xl text-[#0c0a09] mt-2">
            {totalAttendees}
          </div>
        </div>

        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#3ba6f1]" /> Assigned Rooms
          </div>
          <div className="font-display font-normal text-3xl text-[#0c0a09] mt-2">
            {uniqueRooms}
          </div>
        </div>

        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-[#3ba6f1]" /> Key Bearers
          </div>
          <div className="font-display font-normal text-3xl text-[#0c0a09] mt-2">
            {keyBearersCount}
          </div>
        </div>

        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5 text-[#3ba6f1]" /> SMS Dispatched
          </div>
          <div className="font-display font-normal text-3xl text-[#0c0a09] mt-2">
            {Object.values(smsStatusMap).filter(s => s === "sent").length}
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden">
        
        {/* Table Header Filter & Search */}
        <div className="p-4 sm:p-5 border-b border-[#e8e6e5] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a8a29e]" />
            <input
              type="text"
              placeholder="Search by name, room, or fellowship..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#fafaf9] border border-[#e8e6e5] rounded-[6px] text-xs text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]"
            />
          </div>

          <button
            onClick={refreshAttendees}
            className="p-2 text-[#78716c] hover:text-[#0c0a09] hover:bg-[#fafaf9] rounded-full transition-colors"
            title="Refresh Table"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Attendees Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#e8e6e5] bg-[#fafaf9] text-[#78716c] font-medium">
                <th className="p-3.5 pl-6 font-medium">Full Name</th>
                <th className="p-3.5 font-medium">Fellowship</th>
                <th className="p-3.5 font-medium">Room Category</th>
                <th className="p-3.5 font-medium">Room #</th>
                <th className="p-3.5 font-medium">Key Bearer</th>
                <th className="p-3.5 font-medium">Phone (Decrypted)</th>
                <th className="p-3.5 pr-6 text-right font-medium">SMS Notification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#fafaf9]">
              {filteredAttendees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#a8a29e]">
                    No attendees found. Click "Add Attendee" or "Upload CSV" to get started.
                  </td>
                </tr>
              ) : (
                filteredAttendees.map((att) => {
                  const smsStatus = smsStatusMap[att.id];
                  const isKeyHolder = att.key_bearer.toLowerCase() === att.full_name.toLowerCase();

                  return (
                    <tr key={att.id} className="hover:bg-[#fafaf9] transition-colors text-[#0c0a09]">
                      <td className="p-3.5 pl-6 font-medium text-sm">
                        {att.full_name}
                      </td>
                      <td className="p-3.5 text-[#78716c]">
                        {att.fellowship}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#fafaf9] border border-[#e8e6e5] text-[#78716c] font-medium">
                          {att.room_type}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono font-bold text-sm">
                        {att.room_number}
                      </td>
                      <td className="p-3.5">
                        {isKeyHolder ? (
                          <span className="inline-flex items-center gap-1 text-[#3398e1] font-semibold bg-[#c1e1f7]/50 px-2 py-0.5 rounded">
                            <Key className="w-3 h-3" /> {att.key_bearer}
                          </span>
                        ) : (
                          <span className="text-[#78716c]">{att.key_bearer}</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-[#78716c]">
                        {att.phone_number || "N/A"}
                      </td>
                      <td className="p-3.5 pr-6 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {/* WOW Factor Send SMS Button */}
                          <button
                            onClick={() => handleSendSMS(att)}
                            disabled={smsStatus === "sending" || isPending}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                              smsStatus === "sent"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : smsStatus === "error"
                                ? "bg-red-50 text-red-700 border border-red-200"
                                : "bg-[#3ba6f1] hover:bg-[#3398e1] text-white shadow-[rgba(0,0,0,0.05)_0px_2px_4px_0px]"
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
                            onClick={() => handleDelete(att.id, att.full_name)}
                            className="p-1.5 text-[#a8a29e] hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                            title="Delete Attendee"
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

      {/* MODAL 1: ADD SINGLE ATTENDEE */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs">
          <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[500px] overflow-hidden">
            <div className="p-5 border-b border-[#e8e6e5] flex justify-between items-center bg-[#fafaf9]">
              <h2 className="font-display font-medium text-lg text-[#0c0a09]">Add Single Attendee</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#a8a29e] hover:text-[#0c0a09]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAttendee} className="p-6 space-y-4">
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
                  className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-2 focus:ring-[#3ba6f1]"
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
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-2 focus:ring-[#3ba6f1]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                    Room Category *
                  </label>
                  <select
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-2 focus:ring-[#3ba6f1]"
                  >
                    {(camp.room_types || ["Villa", "Hostel", "Dormitory"]).map((t) => (
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
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs font-mono text-[#0c0a09] focus:ring-2 focus:ring-[#3ba6f1]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">
                    Key Bearer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kwame Mensah"
                    value={keyBearer}
                    onChange={(e) => setKeyBearer(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-2 focus:ring-[#3ba6f1]"
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
                  className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs font-mono text-[#0c0a09] focus:ring-2 focus:ring-[#3ba6f1]"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-[#e8e6e5]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer"
                >
                  {isPending ? "Saving..." : "Save Attendee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BULK CSV UPLOAD */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs">
          <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[650px] overflow-hidden">
            <div className="p-5 border-b border-[#e8e6e5] flex justify-between items-center bg-[#fafaf9]">
              <div>
                <h2 className="font-display font-medium text-lg text-[#0c0a09]">Bulk Upload CSV</h2>
                <p className="text-xs text-[#a8a29e]">Paste CSV text or upload spreadsheet data</p>
              </div>
              <button onClick={() => setIsCsvModalOpen(false)} className="text-[#a8a29e] hover:text-[#0c0a09]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              <div className="text-xs text-[#78716c] bg-[#fafaf9] p-3 rounded-[6px] border border-[#e8e6e5] font-mono">
                Format: full_name, fellowship, room_type, room_number, key_bearer, phone_number
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
                  Paste CSV Text
                </label>
                <textarea
                  rows={6}
                  placeholder={`full_name,fellowship,room_type,room_number,key_bearer,phone_number\nKwame Mensah,Youth Ablaze,Villa,V-102,Kwame Mensah,0550076503\nAma Serwaa,Women of Valor,Hostel,H-304,Akosua Osei,0240000000`}
                  value={csvText}
                  onChange={(e) => handleCsvChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs font-mono text-[#0c0a09] focus:ring-2 focus:ring-[#3ba6f1]"
                />
              </div>

              {csvPreview.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-[#0c0a09] mb-2">
                    Parsed Preview ({csvPreview.length} Attendees):
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-[#e8e6e5] rounded-[6px] text-[11px] divide-y divide-[#fafaf9]">
                    {csvPreview.map((row, idx) => (
                      <div key={idx} className="p-2 flex justify-between items-center text-[#0c0a09]">
                        <span className="font-medium">{row.full_name}</span>
                        <span className="text-[#78716c]">{row.fellowship} • {row.room_number} ({row.room_type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-2 border-t border-[#e8e6e5]">
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={csvPreview.length === 0 || isPending}
                  onClick={handleBulkUpload}
                  className="px-5 py-2 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50"
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
