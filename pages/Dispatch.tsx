
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  PointElement,
  LineElement,
  Filler,
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Home, Layout, BarChart2, FileSpreadsheet, RotateCw, Printer, Settings, AlertTriangle, Plane, ChevronDown, ChevronUp, Plus, Trash2, X, GripHorizontal, Edit, Zap, Save, AlertCircle, ZoomIn, ZoomOut, Loader2, Users, DoorOpen, CalendarClock, ListFilter, Wifi, WifiOff, Cloud } from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { parseExcelDate, toISOLocal, fmtTime, getFlightColor } from '../utils/dateUtils';
import { Flight, CheckinData, AC_CODE_MAP } from '../types';
import { supabase } from '../supabaseClient';

// Register ChartJS components locally for this page
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

const QUEUE_CARD_WIDTH = 130; 

const Dispatch: React.FC = () => {
  const navigate = useNavigate();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState<'gate' | 'checkin' | 'peak'>('gate');
  
  // Realtime Status
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Peak Analysis Mode
  const [peakMode, setPeakMode] = useState<'density' | 'gate' | 'checkin'>('density');
  // New: Peak Granularity State
  const [peakGranularity, setPeakGranularity] = useState<'15m' | '1h'>('15m');

  // Zoom Control state
  const [zoom, setZoom] = useState(3); 

  // Expanded Gate List - Default to 10 Gates
  const [activeGates, setActiveGates] = useState<string[]>(
    Array.from({length: 10}, (_, i) => `G${String(i + 1).padStart(2, '0')}`)
  );
  
  // Time Controls
  const [gStart, setGStart] = useState<string>('');
  const [gEnd, setGEnd] = useState<string>('');
  
  // Specific Time Controls for Peak Analysis
  const [peakStart, setPeakStart] = useState<string>('');
  const [peakEnd, setPeakEnd] = useState<string>('');

  const [bufS, setBufS] = useState(40);
  const [bufE, setBufE] = useState(15);
  const [isQueueOpen, setIsQueueOpen] = useState(true);
  
  // Queue Resizing State
  const [queueHeight, setQueueHeight] = useState(220); 
  const [isResizing, setIsResizing] = useState(false);

  // Modals & Interactivity
  const [dragFlight, setDragFlight] = useState<{idx: number, isCk: boolean, ckIdx?: number} | null>(null);
  const [gateModalOpen, setGateModalOpen] = useState(false);
  const [checkinModal, setCheckinModal] = useState<{idx: number, ckIdx?: number} | null>(null);
  const [peakDetail, setPeakDetail] = useState<{d: string, h: number, flights: Flight[]} | null>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Refs for Scrolling
  const gateScrollRef = useRef<HTMLDivElement>(null);
  const gateHeaderRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);
  
  const ckScrollRef = useRef<HTMLDivElement>(null);
  const ckHeaderRef = useRef<HTMLDivElement>(null);

  // Initialize Counters: 01-54 and M01-M07
  const [ckRows] = useState([
      ...Array.from({length:54},(_,i)=>String(i+1).padStart(2,'0')), 
      ...Array.from({length:7},(_,i)=>"M"+String(i+1).padStart(2,'0'))
  ]);

  // Handle Window Resize Events for Queue
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const offsetTop = 128;
      const newH = e.clientY - offsetTop;
      if (newH > 60 && newH < window.innerHeight - 200) {
        setQueueHeight(newH);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // --- SUPABASE INTEGRATION ---

  // Helper to map DB row to Flight object
  const mapDbToFlight = (row: any): Flight => ({
    id: row.flight_no,
    recordId: row.id,
    gate: row.gate || 'UNASSIGNED',
    target: new Date(row.target_time),
    isEtd: row.is_etd,
    acType: row.ac_type,
    acCode: row.ac_code,
    checkinData: (row.checkin_data || []).map((c: any) => ({
        ctr: c.ctr,
        start: new Date(c.start),
        end: new Date(c.end)
    })),
    // Map raw fields if they exist
    arrFlt: row.arr_flt,
    depFlt: row.dep_flt,
    cap: row.cap,
    alCode: row.al_code,
    date: new Date(row.target_time)
  });

  // Load Data and Subscribe
  useEffect(() => {
    if (!gStart || !gEnd) return;
    
    setIsLoading(true);
    const fetchFlights = async () => {
        const { data, error } = await supabase
            .from('flights')
            .select('*')
            .gte('target_time', gStart)
            .lte('target_time', gEnd);
            
        if (data) {
            const parsed = data.map(d => mapDbToFlight(d));
            setFlights(parsed);
        } else if (error) {
            console.error('Error fetching flights:', error);
        }
        setIsLoading(false);
    };
    
    fetchFlights();
    
    // Realtime subscription
    const channel = supabase
        .channel('dispatch_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'flights' }, (payload) => {
            if (payload.eventType === 'UPDATE') {
                setFlights(prev => {
                    // Update the specific flight in the list
                    return prev.map(f => f.recordId === payload.new.id ? mapDbToFlight(payload.new) : f);
                });
            } else if (payload.eventType === 'INSERT') {
                const newF = mapDbToFlight(payload.new);
                // Check if the new flight falls within our current view window
                if (newF.target >= new Date(gStart) && newF.target <= new Date(gEnd)) {
                    setFlights(prev => [...prev, newF]);
                }
            } else if (payload.eventType === 'DELETE') {
                setFlights(prev => prev.filter(f => f.recordId !== payload.old.id));
            }
        })
        .subscribe((status) => {
            setIsLive(status === 'SUBSCRIBED');
        });
        
    return () => { supabase.removeChannel(channel); };
  }, [gStart, gEnd]);


  // Handle Data Import (Upload -> Insert DB)
  const handleDataReady = async (rawData: any[], headers: string[], map: Record<string, number>, config: any) => {
    try {
      setIsLoading(true);
      const rowsToInsert: any[] = [];
      const newFlights: Flight[] = []; // Used for calculating date range

      for(let i=1; i<rawData.length; i++) {
        const r = rawData[i];
        const fltNo = r[map['flight']];
        if(!fltNo) continue;

        const std = parseExcelDate(r[map['std']], 'auto', config.fixTz);
        const etd = map['etd'] !== -1 ? parseExcelDate(r[map['etd']], 'auto', config.fixTz) : null;
        const target = etd || std;
        if(!target) continue;

        let gate = "UNASSIGNED";
        if (map['gate'] !== -1) {
            const rawGate = String(r[map['gate']] || "").toUpperCase().trim();
            if (rawGate && rawGate !== "UNDEFINED" && rawGate !== "NIL") {
                gate = rawGate;
            }
        }
        if(gate === "CANCELLED") continue;

        const acType = r[map['ac']] || "";
        const acCode = getACCode(acType);

        rowsToInsert.push({
            flight_no: fltNo,
            gate: gate,
            target_time: target.toISOString(),
            is_etd: !!etd,
            ac_type: acType,
            ac_code: acCode,
            checkin_data: [],
            // Extra info
            al_code: fltNo.substring(0,2).toUpperCase()
        });

        newFlights.push({ id: fltNo, gate, target, isEtd: !!etd, acType, acCode, checkinData: [], date: target });
      }

      if(rowsToInsert.length === 0) { alert("No valid flights found."); setIsLoading(false); return; }
      
      // Calculate Window
      const dates = newFlights.map(f => f.target.getTime());
      const minTime = Math.min(...dates);
      const min = new Date(minTime); 
      min.setHours(min.getHours() - 2);
      const defaultEnd = new Date(min.getTime() + 12 * 60 * 60 * 1000);
      
      const isoStart = toISOLocal(min);
      const isoEnd = toISOLocal(defaultEnd);

      // Insert to Supabase
      // Chunking if too large
      const chunkSize = 100;
      for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
          const chunk = rowsToInsert.slice(i, i + chunkSize);
          const { error } = await supabase.from('flights').insert(chunk);
          if(error) {
              console.error("Insert error", error);
              alert("Error inserting data to Cloud DB");
              setIsLoading(false);
              return;
          }
      }

      setGStart(isoStart);
      setGEnd(isoEnd);
      setPeakStart(isoStart);
      setPeakEnd(isoEnd);

      setIsLoading(false);
      setStep(2);
    } catch(e: any) {
      console.error(e);
      alert("Error parsing/uploading data: " + e.message);
      setIsLoading(false);
    }
  };

  const getACCode = (t: string) => {
    if(!t) return 'UNK';
    const s = String(t).toUpperCase().trim();
    for(const k in AC_CODE_MAP) { if(s.includes(k)) return AC_CODE_MAP[k]; }
    return 'UNK';
  };

  // Sync scrolling
  const handleScroll = (sourceRef: React.RefObject<HTMLDivElement>) => {
    if(!sourceRef.current) return;
    const left = sourceRef.current.scrollLeft;
    
    const refs = [gateScrollRef, gateHeaderRef, queueScrollRef, ckScrollRef, ckHeaderRef];
    refs.forEach(r => {
        if(r.current && r !== sourceRef) {
            r.current.scrollLeft = left;
        }
    });
  };

  const calculatePos = (time: Date, start: Date) => {
    const min = (time.getTime() - start.getTime()) / 60000;
    return min * zoom;
  };

  // --- ACTIONS (UPDATED FOR SUPABASE) ---
  const handleDropGate = async (flightIdx: number, gateName: string) => {
    if (flightIdx < 0 || flightIdx >= flights.length) return;
    const f = flights[flightIdx];
    if(!f.recordId) return;

    // Optimistic Update
    const oldGate = f.gate;
    const updated = [...flights];
    updated[flightIdx] = { ...f, gate: gateName };
    setFlights(updated);

    const { error } = await supabase.from('flights').update({ gate: gateName }).eq('id', f.recordId);
    if(error) {
        console.error("Update failed", error);
        // Revert
        updated[flightIdx] = { ...f, gate: oldGate };
        setFlights(updated);
    }
  };

  const handleDropCheckin = async (flightIdx: number, ctrName: string, ctrIdx?: number) => {
     if (flightIdx < 0 || flightIdx >= flights.length) return;
     const f = flights[flightIdx];
     if(!f.recordId) return;

     const oldData = [...f.checkinData];
     const newData = f.checkinData.map((c, i) => i === ctrIdx ? { ...c, ctr: ctrName } : c);

     const updated = [...flights];
     updated[flightIdx] = { ...f, checkinData: newData };
     setFlights(updated);

     const { error } = await supabase.from('flights').update({ checkin_data: newData }).eq('id', f.recordId);
     if(error) {
         console.error("Update failed", error);
         updated[flightIdx] = { ...f, checkinData: oldData };
         setFlights(updated);
     }
  };

  const handleUnassign = async (flightIdx: number, isCk: boolean, ckIdx?: number) => {
     if (flightIdx < 0 || flightIdx >= flights.length) return;
     const f = flights[flightIdx];
     if(!f.recordId) return;

     const updated = [...flights];
     
     if (isCk) {
         if (ckIdx !== undefined && updated[flightIdx].checkinData[ckIdx]) {
             const oldData = [...f.checkinData];
             const newData = f.checkinData.filter((_, i) => i !== ckIdx);
             updated[flightIdx] = { ...f, checkinData: newData };
             setFlights(updated);

             const { error } = await supabase.from('flights').update({ checkin_data: newData }).eq('id', f.recordId);
             if(error) { 
                 updated[flightIdx] = { ...f, checkinData: oldData }; 
                 setFlights(updated); 
             }
         }
     } else {
         const oldGate = f.gate;
         updated[flightIdx] = { ...f, gate: "UNASSIGNED" };
         setFlights(updated);

         const { error } = await supabase.from('flights').update({ gate: "UNASSIGNED" }).eq('id', f.recordId);
         if(error) {
             updated[flightIdx] = { ...f, gate: oldGate };
             setFlights(updated);
         }
     }
  };

  const saveCheckinConfig = async (idx: number, data: CheckinData[]) => {
      const f = flights[idx];
      if(!f.recordId) return;

      const oldData = f.checkinData;
      const updated = [...flights];
      updated[idx].checkinData = data;
      setFlights(updated);
      setCheckinModal(null);

      const { error } = await supabase.from('flights').update({ checkin_data: data }).eq('id', f.recordId);
      if(error) {
          console.error("Update failed", error);
          updated[idx].checkinData = oldData;
          setFlights(updated);
          alert("Failed to save check-in config");
      }
  };

  // --- EXPORT FUNCTIONALITY ---
  const handleExportPDF = async () => {
      if (!gStart || !gEnd) {
        alert("Please set the View Window (TO/FROM) first.");
        return;
      }
      
      setIsExporting(true);

      setTimeout(async () => {
          if (!exportRef.current) {
              console.error("Export container not loaded.");
              setIsExporting(false);
              return;
          }

          try {
              const pdf = new jsPDF('l', 'mm', 'a4');
              const pageWidth = 297;
              const pageHeight = 210;
              const margin = 10;
              const printWidth = pageWidth - (margin * 2);
              const printHeight = pageHeight - (margin * 2);
              
              const pages = Array.from(exportRef.current.children);
              
              for (let i = 0; i < pages.length; i++) {
                  const pageElement = pages[i] as HTMLElement;
                  
                  const canvas = await html2canvas(pageElement, { 
                      scale: 2.0, 
                      logging: false,
                      useCORS: true,
                      backgroundColor: '#ffffff'
                  });
                  
                  const imgData = canvas.toDataURL('image/jpeg', 0.70);
                  const imgProps = pdf.getImageProperties(imgData);
                  
                  const pdfRatio = printWidth / printHeight;
                  const imgRatio = imgProps.width / imgProps.height;
                  
                  let finalWidth, finalHeight;
                  
                  if (imgRatio > pdfRatio) {
                      finalWidth = printWidth;
                      finalHeight = printWidth / imgRatio;
                  } else {
                      finalHeight = printHeight;
                      finalWidth = printHeight * imgRatio;
                  }
                  
                  const x = margin + (printWidth - finalWidth) / 2;
                  const y = margin + (printHeight - finalHeight) / 2;
                  
                  if (i > 0) pdf.addPage();
                  pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
              }

              pdf.save(`${tab === 'gate' ? 'Gate' : 'Checkin'}_Plan_${new Date().toISOString().split('T')[0]}.pdf`);
          } catch (error) {
              console.error("Export failed", error);
              alert("Export failed. Please try again.");
          } finally {
              setIsExporting(false);
          }
      }, 1000);
  };

  // --- DATA PREP ---
  const unassignedFlights = useMemo(() => {
    if (!gStart || !gEnd) return [];
    return flights
        .map((f, i) => ({ ...f, originalIndex: i }))
        .filter(f => tab === 'gate' ? (!f.gate || f.gate === 'UNASSIGNED') : (!f.checkinData || f.checkinData.length === 0))
        .filter(f => f.target >= new Date(gStart) && f.target <= new Date(gEnd))
        .sort((a, b) => a.target.getTime() - b.target.getTime());
  }, [flights, tab, gStart, gEnd]);

  const packedQueue = useMemo(() => {
    if (!gStart) return { items: [], lanes: 0 };
    const s = new Date(gStart);
    const lanes: number[] = []; 
    
    const getQueueTime = (f: Flight) => {
        if(tab === 'checkin' && f.checkinData.length > 0) {
             const minStart = new Date(Math.min(...f.checkinData.map(c => c.start.getTime())));
             return minStart;
        }
        if(tab === 'checkin') return new Date(f.target.getTime() - 180 * 60000); 
        return f.target; 
    };

    const items = unassignedFlights.map(f => {
       const displayTime = getQueueTime(f);
       const x = Math.max(0, calculatePos(displayTime, s));
       
       let laneIdx = -1;
       for(let i=0; i<lanes.length; i++) {
           if (lanes[i] + 10 < x) { 
               laneIdx = i;
               break;
           }
       }
       if (laneIdx === -1) {
           laneIdx = lanes.length;
           lanes.push(0);
       }
       lanes[laneIdx] = x + QUEUE_CARD_WIDTH;
       return { ...f, x, laneIdx, displayTime };
    });

    return { items, lanes: lanes.length };
  }, [unassignedFlights, gStart, tab, zoom]);


  if(step === 1) {
    return (
        <div className="relative">
             {isLoading && (
                 <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center flex-col">
                     <Loader2 className="animate-spin text-blue-600 mb-2" size={40}/>
                     <p className="font-bold text-slate-600">Syncing with Supabase...</p>
                 </div>
             )}
            <FileUpload 
              title="OpsMaster Dispatch (Cloud)" 
              mappings={[
                { key: 'flight', label: 'Flight No / Arr Flight' },
                { key: 'gate', label: 'Gate', optional: true },
                { key: 'std', label: 'Time (STD/STA)' },
                { key: 'etd', label: 'Est. Time (ETD/ETA)', optional: true },
                { key: 'ac', label: 'A/C Type' }
              ]} 
              onDataReady={handleDataReady}
              extraConfig={
                  <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 mt-4">
                      <div className="flex items-center gap-2 text-emerald-800 font-bold mb-2">
                          <Cloud size={18}/>
                          <span>Cloud Sync</span>
                      </div>
                      <p className="text-xs text-emerald-700 leading-relaxed">
                          Data will be uploaded to Supabase. Realtime collaboration will be enabled automatically for all users viewing this timeframe.
                      </p>
                  </div>
              }
            />
        </div>
    );
  }

  // --- INTERNAL COMPONENTS ---
  // (Modals omitted for brevity, logic unchanged)
  const GateManagerModal = () => {
    // ... (Keep existing implementation)
    const [newGate, setNewGate] = useState('');
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
          <div className="bg-slate-800 p-4 flex justify-between items-center">
             <h3 className="text-lg font-bold text-white flex items-center gap-2"><Settings size={20}/> Manage Gates</h3>
             <button onClick={() => setGateModalOpen(false)} className="text-slate-400 hover:text-white"><X size={20}/></button>
          </div>
          <div className="p-6">
             <div className="flex gap-2 mb-6">
                <input 
                  value={newGate} 
                  onChange={e => setNewGate(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                      if(e.key === 'Enter' && newGate && !activeGates.includes(newGate)) {
                          setActiveGates([...activeGates, newGate].sort());
                          setNewGate('');
                      }
                  }}
                  placeholder="e.g. G21"
                  className="border-2 border-slate-200 p-2.5 rounded-lg flex-1 uppercase font-bold text-slate-800 outline-none focus:border-blue-500 transition-all" 
                />
                <button 
                  onClick={() => {
                    if(newGate && !activeGates.includes(newGate)) {
                      setActiveGates([...activeGates, newGate].sort());
                      setNewGate('');
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 rounded-lg font-bold flex items-center gap-2 transition-colors"
                >
                    <Plus size={18} /> Add
                </button>
             </div>
             
             <div className="text-xs font-bold text-slate-400 uppercase mb-2">Active Gates List</div>
             <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50 grid grid-cols-3 gap-2">
                {activeGates.map(g => (
                  <div key={g} className="bg-white border border-slate-200 p-2 rounded-lg flex justify-between items-center text-sm font-bold text-slate-700 shadow-sm group">
                     {g}
                     <button onClick={() => setActiveGates(activeGates.filter(x => x !== g))} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14}/></button>
                  </div>
                ))}
             </div>
          </div>
          <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
              <button onClick={() => setGateModalOpen(false)} className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors">Done</button>
          </div>
        </div>
      </div>
    );
  };

  const CheckinEditModal = () => {
    // ... (Keep existing implementation)
     if(!checkinModal) return null;
     const f = flights[checkinModal.idx];
     const [rows, setRows] = useState<CheckinData[]>(
        f.checkinData.length > 0 
        ? f.checkinData.map(c => ({...c})) 
        : Array.from({length:3}, (_,i) => ({
            ctr: '01', 
            start: new Date(f.target.getTime()-180*60000), 
            end: new Date(f.target.getTime()-40*60000)
          }))
     );
     
     const [startCounter, setStartCounter] = useState(rows[0]?.ctr || '01');

     const checkOverlap = (ctr: string, start: Date, end: Date) => {
         let isOverlap = false;
         flights.forEach((otherF, otherIdx) => {
             if(otherIdx === checkinModal.idx) return; 
             otherF.checkinData.forEach(c => {
                 if(c.ctr === ctr) {
                     if(start < c.end && end > c.start) {
                         isOverlap = true;
                     }
                 }
             });
         });
         return isOverlap;
     };

     const updateRow = (i: number, field: keyof CheckinData, val: any) => {
         const cp = [...rows];
         (cp[i] as any)[field] = val;
         setRows(cp);
     };

     const handleAutoSequence = () => {
         const newStart = new Date(f.target.getTime() - 180 * 60000);
         const newEnd = new Date(f.target.getTime() - 40 * 60000);
         
         const idx = ckRows.indexOf(startCounter);
         const baseIdx = idx >= 0 ? idx : 0;
         
         const newRows = rows.map((r, i) => ({
             ...r,
             ctr: ckRows[baseIdx + i] || r.ctr,
             start: newStart,
             end: newEnd
         }));
         setRows(newRows);
     };

     return (
         <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
                 <div className="p-5 flex justify-between items-center border-b border-slate-100">
                     <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                         Quản lý Quầy: <span className="text-blue-600">{f.id}</span>
                     </h3>
                     <button onClick={() => setCheckinModal(null)} className="text-slate-400 hover:text-slate-600">
                         <X size={24}/>
                     </button>
                 </div>
                 
                 <div className="p-6 overflow-y-auto">
                     <div className="bg-orange-50 border border-orange-100 rounded-lg p-5 mb-6">
                         <div className="text-xs font-bold text-orange-800 uppercase mb-3">THAO TÁC NHANH</div>
                         <div className="flex gap-3 flex-wrap">
                             <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-bold py-2 px-4 rounded-md shadow-sm hover:shadow hover:bg-slate-50 transition-all text-sm">
                                 <Edit size={16} className="text-orange-500"/> Sửa
                             </button>
                             <button 
                                onClick={() => {
                                    const lastRow = rows[rows.length-1];
                                    setRows([...rows, {...lastRow}]);
                                }}
                                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-md shadow-sm transition-all text-sm"
                             >
                                 <Plus size={16}/> Thêm quầy
                             </button>
                             <button 
                                onClick={() => {
                                    if(window.confirm("Xóa toàn bộ kế hoạch quầy của chuyến bay này?")) {
                                        setRows([]);
                                    }
                                }}
                                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded-md shadow-sm transition-all text-sm"
                             >
                                 <Trash2 size={16}/> Xóa quầy này
                             </button>
                         </div>
                     </div>

                     <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-6">
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                             <div>
                                 <label className="text-xs font-bold text-slate-500 mb-1.5 block">Số lượng quầy</label>
                                 <input 
                                    type="number" 
                                    min="1" 
                                    max="50" 
                                    value={rows.length} 
                                    onChange={e => {
                                        const qty = parseInt(e.target.value) || 0;
                                        const newRows = [...rows];
                                        if(qty > rows.length) {
                                            for(let k=rows.length; k<qty; k++) {
                                                const prev = rows[rows.length-1] || {ctr:'01', start: new Date(f.target.getTime()-180*60000), end: new Date(f.target.getTime()-40*60000)};
                                                newRows.push({...prev});
                                            }
                                        } else {
                                            newRows.splice(qty);
                                        }
                                        setRows(newRows);
                                    }}
                                    className="w-full border border-slate-300 bg-white text-slate-900 rounded-md p-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" 
                                 />
                             </div>
                             <div>
                                 <label className="text-xs font-bold text-slate-500 mb-1.5 block">Bắt đầu từ</label>
                                 <select 
                                    value={startCounter}
                                    onChange={e => setStartCounter(e.target.value)}
                                    className="w-full border border-slate-300 bg-white text-slate-900 rounded-md p-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                 >
                                    {ckRows.map(k => <option key={k} value={k}>{k}</option>)}
                                 </select>
                             </div>
                             <div>
                                 <button 
                                    onClick={handleAutoSequence}
                                    className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 text-slate-600 font-bold py-2.5 rounded-md shadow-sm transition-all text-sm"
                                 >
                                     <Zap size={16} className="text-amber-500"/> Điền tự động
                                 </button>
                             </div>
                         </div>
                     </div>

                     <div className="space-y-3">
                         {rows.map((r, i) => {
                             const isOverlap = checkOverlap(r.ctr, r.start, r.end);
                             return (
                                 <div key={i} className={`flex flex-col md:flex-row gap-3 items-center p-2 rounded-lg border ${isOverlap ? 'border-red-300 bg-red-50' : 'border-slate-100 bg-white'}`}>
                                     <span className="text-xs font-black text-slate-400 w-8 md:text-right">#{i+1}</span>
                                     <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                                         <div>
                                             <select 
                                                value={r.ctr} 
                                                onChange={e => updateRow(i, 'ctr', e.target.value)} 
                                                className={`w-full p-2 border rounded-md font-bold text-slate-800 text-sm bg-white ${isOverlap ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                                             >
                                                 {ckRows.map(k => <option key={k} value={k}>{k}</option>)}
                                             </select>
                                         </div>
                                         <div className="relative">
                                             <input 
                                                type="datetime-local" 
                                                value={toISOLocal(r.start)} 
                                                onChange={e => updateRow(i, 'start', new Date(e.target.value))} 
                                                onClick={(e) => e.currentTarget.showPicker()}
                                                className={`w-full p-2 border rounded-md text-xs font-mono font-medium text-slate-900 bg-white cursor-pointer ${isOverlap ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} 
                                             />
                                         </div>
                                         <div className="relative">
                                             <input 
                                                type="datetime-local" 
                                                value={toISOLocal(r.end)} 
                                                onChange={e => updateRow(i, 'end', new Date(e.target.value))} 
                                                onClick={(e) => e.currentTarget.showPicker()}
                                                className={`w-full p-2 border rounded-md text-xs font-mono font-medium text-slate-900 bg-white cursor-pointer ${isOverlap ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} 
                                             />
                                         </div>
                                     </div>
                                     {isOverlap && (
                                         <div className="text-red-500 animate-pulse" title="Overlap Detected">
                                             <AlertCircle size={20}/>
                                         </div>
                                     )}
                                     <button 
                                        onClick={() => {
                                            const newRows = [...rows];
                                            newRows.splice(i, 1);
                                            setRows(newRows);
                                        }}
                                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                     >
                                         <Trash2 size={16}/>
                                     </button>
                                 </div>
                             );
                         })}
                     </div>
                 </div>
                 <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-white">
                     <button onClick={() => setCheckinModal(null)} className="px-6 py-2.5 border border-slate-300 text-slate-600 font-bold text-sm rounded-md hover:bg-slate-50 transition-colors">Hủy bỏ</button>
                     <button onClick={() => saveCheckinConfig(checkinModal.idx, rows)} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-md font-bold text-sm hover:bg-blue-700 shadow-md hover:shadow-blue-500/30 transition-all"><Save size={16}/> Lưu thay đổi</button>
                 </div>
             </div>
         </div>
     );
  };

  // --- RENDER FUNCTIONS ---
  const renderExportView = () => {
    // ... (Keep existing implementation)
      if (!gStart || !gEnd) return null;
      const s = new Date(gStart);
      const e = new Date(gEnd);
      
      const totalWidth = 1800; 
      const sidebarWidth = 100;
      const timelineWidth = totalWidth - sidebarWidth;
      
      const totalMin = (e.getTime() - s.getTime()) / 60000;
      const exportZoom = timelineWidth / totalMin; 
      
      const isGate = tab === 'gate';
      const rowHeight = isGate ? 60 : 28; 
      const fontSizeId = isGate ? 'text-sm' : 'text-[11px]';
      const fontSizeTime = 'text-[10px]';

      const renderSheet = (sheetTitle: string, rows: string[]) => (
          <div className="bg-white p-4 font-sans mb-8 border-4 border-slate-100" style={{ width: totalWidth + 50 }}>
              <div className="text-center mb-6">
                  <h1 className="text-3xl font-bold text-slate-900 mb-2 uppercase tracking-wide">{sheetTitle}</h1>
                  <p className="text-slate-500 font-bold text-lg">Period: {s.toLocaleString()} - {e.toLocaleString()}</p>
              </div>

              <div className="flex border-2 border-slate-800">
                  <div className="flex-shrink-0 bg-slate-100 border-r-2 border-slate-800" style={{ width: sidebarWidth }}>
                      <div className="h-10 border-b-2 border-slate-800 flex items-center justify-center font-black text-sm bg-slate-200">
                          {tab === 'gate' ? 'GATE' : 'CTR'}
                      </div>
                      {rows.map(r => (
                          <div key={r} className="flex items-center justify-center font-black text-sm text-slate-900 border-b border-slate-300" style={{ height: rowHeight }}>
                              {r}
                          </div>
                      ))}
                  </div>

                  <div className="relative bg-white" style={{ width: timelineWidth }}>
                      <div className="h-10 border-b-2 border-slate-800 relative bg-slate-50 overflow-hidden">
                          {Array.from({length: Math.ceil(totalMin/30) + 1}).map((_, i) => {
                              const m = i * 30;
                              const t = new Date(s.getTime() + m * 60000);
                              const isHour = m % 60 === 0;
                              const left = m * exportZoom;
                              
                              if (left > timelineWidth) return null;

                              return (
                                  <React.Fragment key={i}>
                                      <div className={`absolute top-0 bottom-0 border-l ${isHour ? 'border-slate-400' : 'border-slate-200'}`} style={{ left }}></div>
                                      <div className="absolute bottom-1 text-xs font-bold text-slate-700 transform -translate-x-1/2" style={{ left }}>
                                          {isHour && (
                                              <div className="text-center">
                                                  <div className="text-[9px] text-slate-500 leading-none mb-0.5">{t.getDate()}/{t.getMonth()+1}</div>
                                                  <div>{fmtTime(t)}</div>
                                              </div>
                                          )}
                                          {!isHour && <span className="text-[9px] text-slate-400">{fmtTime(t)}</span>}
                                      </div>
                                  </React.Fragment>
                              );
                          })}
                      </div>

                      <div className="relative" style={{ height: rows.length * rowHeight }}>
                          {Array.from({length: Math.ceil(totalMin/30) + 1}).map((_, i) => (
                              <div key={`vgrid-${i}`} className={`absolute top-0 bottom-0 border-l ${i % 2 === 0 ? 'border-slate-300' : 'border-slate-100 dashed'}`} style={{ left: i * 30 * exportZoom }}></div>
                          ))}

                          {rows.map((row, rIdx) => {
                              let items: any[] = [];
                              if (tab === 'gate') {
                                  items = flights
                                     .filter(f => f.gate === row && f.target >= s && f.target <= e)
                                     .map(f => ({
                                      ...f, 
                                      start: new Date(f.target.getTime() - bufS * 60000),
                                      end: new Date(f.target.getTime() + bufE * 60000)
                                  }));
                              } else {
                                  flights.forEach((f) => {
                                      f.checkinData.forEach((ck) => {
                                          if(ck.ctr === row && ck.end > s && ck.start < e) {
                                              items.push({ ...f, start: ck.start, end: ck.end });
                                          }
                                      });
                                  });
                              }

                              return (
                                  <div key={row} className="border-b border-slate-300 relative" style={{ height: rowHeight }}>
                                      {items.map((it, idx) => {
                                          const startOffset = Math.max(0, (it.start.getTime() - s.getTime()) / 60000);
                                          const duration = (it.end.getTime() - it.start.getTime()) / 60000;
                                          const left = startOffset * exportZoom;
                                          const width = Math.max(10, duration * exportZoom);
                                          const color = getFlightColor(it.id);

                                          return (
                                              <div 
                                                  key={idx}
                                                  className="absolute top-0.5 bottom-0.5 rounded border border-slate-500 flex items-center justify-center shadow-sm"
                                                  style={{ left, width, backgroundColor: color }}
                                              >
                                                  <div className={`${fontSizeId} font-black text-slate-900 z-10 leading-none text-center`}>{it.id}</div>
                                                  
                                                  {width > 25 && (
                                                      <>
                                                          <div className={`absolute top-0.5 left-1 ${fontSizeTime} font-bold text-slate-700 leading-none`}>
                                                              {fmtTime(it.start)}
                                                          </div>
                                                          <div className={`absolute bottom-0.5 right-1 ${fontSizeTime} font-bold text-slate-700 leading-none`}>
                                                              {fmtTime(it.end)}
                                                          </div>
                                                      </>
                                                  )}
                                              </div>
                                          );
                                      })}
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              </div>
          </div>
      );

      let sheets = [];
      if (tab === 'gate') {
          sheets.push({ title: 'Gate Allocation Plan', rows: activeGates });
      } else {
          const wingARows = ckRows.filter(r => {
             const n = parseInt(r);
             return (!isNaN(n) && n >= 1 && n <= 27) || ['M01', 'M02', 'M03', 'M07'].includes(r);
          }).sort((a, b) => {
             const topM = ['M01', 'M02', 'M03'];
             if(topM.includes(a) && !topM.includes(b)) return -1;
             if(!topM.includes(a) && topM.includes(b)) return 1;
             if(topM.includes(a) && topM.includes(b)) return a.localeCompare(b);
             if(a === 'M07') return 1; if(b === 'M07') return -1;
             return a.localeCompare(b);
          });
          const wingBRows = ckRows.filter(r => {
             const n = parseInt(r);
             return (!isNaN(n) && n >= 28 && n <= 54) || ['M04', 'M05', 'M06'].includes(r);
          }).sort((a, b) => {
             if(!a.startsWith('M') && b.startsWith('M')) return -1;
             if(a.startsWith('M') && !b.startsWith('M')) return 1;
             return a.localeCompare(b);
          });
          sheets.push({ title: 'Wing A Check-in Counter Allocation', rows: wingARows });
          sheets.push({ title: 'Wing B Check-in Counter Allocation', rows: wingBRows });
      }

      return (
          <div ref={exportRef}>
              {sheets.map((s, i) => <div key={i}>{renderSheet(s.title, s.rows)}</div>)}
          </div>
      );
  };

  const renderGantt = (type: 'gate' | 'checkin') => {
    // ... (Keep existing implementation)
    if(!gStart || !gEnd) return null;
    const s = new Date(gStart);
    const e = new Date(gEnd);
    const totalMin = (e.getTime() - s.getTime()) / 60000;
    const totalWidth = totalMin * zoom;
    
    const ticks = [];
    const hourLabels = [];
    
    for(let m=0; m<=totalMin; m+=5) {
      const t = new Date(s.getTime() + m * 60000);
      const isHour = m % 60 === 0;
      const isHalf = m % 30 === 0;
      let borderClass = 'border-slate-100'; 
      if (isHour) borderClass = 'border-slate-300';
      else if (isHalf) borderClass = 'border-slate-200 border-dashed';

      ticks.push(<div key={`tick-${m}`} className={`absolute top-0 bottom-0 border-l ${borderClass}`} style={{ left: m * zoom }} />);

      if(isHalf) {
          hourLabels.push(
              <div key={`lbl-${m}`} className={`absolute bottom-0 mb-1 px-1.5 py-0.5 rounded border shadow-sm transform -translate-x-1/2 flex flex-col items-center justify-center ${isHour ? 'bg-slate-800 text-white border-slate-700 z-10' : 'bg-white text-slate-500 border-slate-200 text-[10px]'}`} style={{ left: m * zoom }}>
                  <span className={isHour ? "text-xs font-bold" : "font-medium"}>{fmtTime(t)}</span>
                  {isHour && <div className="absolute -bottom-2 w-0.5 h-2 bg-slate-800"></div>}
              </div>
          );
      }
    }

    const rows = type === 'gate' ? activeGates : ckRows;
    const scrollRef = type === 'gate' ? gateScrollRef : ckScrollRef;
    const headerRef = type === 'gate' ? gateHeaderRef : ckHeaderRef;
    const currentQueueHeight = isQueueOpen ? queueHeight : 45;
    const rowHeightClass = "h-[64px]"; 

    return (
        <div className="flex flex-col h-full bg-white border-t border-slate-300 flex-1 min-h-0">
             {tab !== 'peak' && (
                <div 
                  className="flex border-b border-slate-300 bg-slate-50 flex-shrink-0 relative transition-none" 
                  style={{ height: currentQueueHeight }}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.backgroundColor = 'rgba(254, 243, 199, 0.5)'; }}
                  onDragLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
                  onDrop={e => {
                     e.preventDefault();
                     e.currentTarget.style.backgroundColor = '';
                     if(dragFlight) handleUnassign(dragFlight.idx, dragFlight.isCk, dragFlight.ckIdx);
                  }}
                >
                    <div className="w-28 flex-shrink-0 border-r border-slate-300 p-2 bg-slate-100 flex flex-col items-center justify-start pt-4 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                         <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setIsQueueOpen(!isQueueOpen)}>
                             <div className={`p-2 rounded-lg ${isQueueOpen ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}><AlertTriangle size={20} /></div>
                             <span className="text-[10px] font-black text-slate-500 uppercase text-center leading-tight">Queue</span>
                             <span className="bg-slate-800 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">{unassignedFlights.length}</span>
                             {isQueueOpen ? <ChevronUp size={14} className="text-slate-400 mt-1"/> : <ChevronDown size={14} className="text-slate-400 mt-1"/>}
                         </div>
                    </div>
                    {isQueueOpen && (
                        <div ref={queueScrollRef} onScroll={() => handleScroll(queueScrollRef)} className="flex-1 overflow-x-hidden overflow-y-auto relative bg-slate-50/50">
                             <div className="relative" style={{ width: totalWidth, minHeight: '100%' }}>
                                 {ticks}
                                 {packedQueue.items.map((it, i) => (
                                     <div
                                         key={i}
                                         draggable
                                         onDragStart={() => setDragFlight({ idx: (it as any).originalIndex, isCk: tab === 'checkin' })}
                                         onClick={() => { if(tab==='checkin') setCheckinModal({ idx: (it as any).originalIndex }) }}
                                         className="absolute rounded border border-slate-300 bg-white shadow-sm hover:shadow-md cursor-move flex flex-col justify-between p-1.5 hover:ring-2 hover:ring-blue-400 group transition-all"
                                         style={{ left: it.x, top: it.laneIdx * 45 + 10, width: QUEUE_CARD_WIDTH, height: 38 }}
                                         title={`STD: ${fmtTime(it.target)}`}
                                     >
                                         <div className="flex justify-between items-center">
                                             <span className="font-black text-xs text-slate-800">{it.id}</span>
                                             <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 rounded">{it.acCode}</span>
                                         </div>
                                         <div className="flex justify-between items-center mt-1">
                                             {tab === 'checkin' ? (
                                                  <div className="flex items-center gap-1 text-[9px] font-mono font-bold text-blue-600">
                                                      <span>{fmtTime(new Date(it.displayTime))}</span>
                                                      <span className="text-slate-400">-</span>
                                                      <span>{fmtTime(new Date(it.displayTime.getTime() + (140 * 60000)))}</span>
                                                  </div>
                                             ) : (
                                                  <span className="text-[10px] font-mono font-bold text-blue-600">{fmtTime(it.target)}</span>
                                             )}
                                             <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getFlightColor(it.id) }}></div>
                                         </div>
                                     </div>
                                 ))}
                                 {packedQueue.items.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold italic text-sm pointer-events-none">Drop flights here to unassign</div>}
                             </div>
                        </div>
                    )}
                    {isQueueOpen && (
                        <div className="absolute bottom-0 left-0 right-0 h-2 bg-transparent hover:bg-blue-400/20 cursor-row-resize flex items-center justify-center z-30 group" onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}>
                             <div className="w-12 h-1 rounded-full bg-slate-300 group-hover:bg-blue-400 transition-colors"></div>
                        </div>
                    )}
                </div>
             )}

             <div className="flex border-b border-slate-400 bg-slate-100 shadow-sm z-10 h-14 flex-shrink-0">
                 <div className="w-28 flex-shrink-0 border-r border-slate-300 p-2 font-black text-xs text-slate-800 flex items-center justify-center bg-slate-200 uppercase tracking-wider shadow-inner">
                     {type === 'gate' ? 'Resource' : 'Counter'}
                 </div>
                 <div ref={headerRef} className="flex-1 overflow-hidden relative bg-slate-50">
                     <div className="absolute top-0 bottom-0 pointer-events-none" style={{ width: totalWidth }}>
                         {hourLabels}
                         {Array.from({length: Math.ceil(totalMin/5) + 1}).map((_, i) => {
                             const isBig = i % 12 === 0; 
                             const isMed = i % 6 === 0;
                             const h = isBig ? 'h-3' : (isMed ? 'h-2' : 'h-1');
                             const color = isBig ? 'border-slate-600' : 'border-slate-300';
                             return <div key={`htick-${i}`} className={`absolute bottom-0 border-l ${color} ${h}`} style={{ left: i * 5 * zoom }}></div>
                         })}
                     </div>
                 </div>
             </div>

             <div ref={scrollRef} onScroll={() => handleScroll(scrollRef)} className="flex-1 overflow-auto bg-slate-50 relative flex flex-col">
                 <div className="flex" style={{ width: `max-content`, minWidth: '100%' }}>
                     {/* Sticky Sidebar */}
                     <div className="sticky left-0 z-[60] w-28 flex-shrink-0 border-r border-slate-300 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                         {rows.map(r => (
                             <div key={r} className={`${rowHeightClass} border-b border-slate-200 flex items-center justify-center text-sm font-bold text-slate-900 relative ${r.includes('AUTO') ? 'bg-amber-50 border-l-4 border-amber-500' : 'bg-white hover:bg-slate-50'}`}>
                                 {r}
                                 <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                             </div>
                         ))}
                     </div>
                     
                     {/* Gantt Content */}
                     <div className="relative" style={{ width: totalWidth, height: rows.length * 64 }}>
                         <div className="absolute inset-0 pointer-events-none z-0">{ticks}</div>
                         {rows.map((row, rIdx) => {
                             let items: any[] = [];
                             if (type === 'gate') {
                                 items = flights
                                    .map((f, i) => ({ ...f, originalIndex: i }))
                                    .filter(f => f.gate === row && f.target >= s && f.target <= e)
                                    .map(f => ({ ...f, start: new Date(f.target.getTime() - bufS * 60000), end: new Date(f.target.getTime() + bufE * 60000) }));
                             } else {
                                 flights.forEach((f, fIdx) => {
                                     f.checkinData.forEach((ck, ckIdx) => {
                                         if(ck.ctr === row && ck.end > s && ck.start < e) {
                                             items.push({ ...f, start: ck.start, end: ck.end, ckIdx, fIdx });
                                         }
                                     });
                                 });
                             }
                             
                             items.forEach((it, i) => {
                                 for(let j=i+1; j<items.length; j++) {
                                     if(it.start < items[j].end && it.end > items[j].start) {
                                         it.conflict = true; items[j].conflict = true;
                                     }
                                 }
                             });

                             return (
                                 <div 
                                    key={row} 
                                    className={`${rowHeightClass} border-b border-slate-200 relative group z-10 hover:bg-blue-50/20 transition-colors`}
                                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'; }}
                                    onDragLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
                                    onDrop={e => {
                                        e.preventDefault();
                                        e.currentTarget.style.backgroundColor = '';
                                        if (dragFlight) {
                                            if (type === 'gate' && !dragFlight.isCk) handleDropGate(dragFlight.idx, row);
                                            if (type === 'checkin' && dragFlight.isCk) handleDropCheckin(dragFlight.idx, row, dragFlight.ckIdx);
                                        }
                                    }}
                                 >
                                     {items.map((it, idx) => {
                                         const x = Math.max(0, calculatePos(it.start, s));
                                         const w = Math.max(20, ((it.end.getTime() - it.start.getTime())/60000) * zoom);
                                         const bgStyle = it.conflict ? 'repeating-linear-gradient(45deg, #fee2e2, #fee2e2 10px, #fecaca 10px, #fecaca 20px)' : getFlightColor(it.id);

                                         return (
                                             <div
                                                 key={idx}
                                                 draggable
                                                 onDragStart={() => setDragFlight({ idx: type === 'gate' ? it.originalIndex : it.fIdx, isCk: type === 'checkin', ckIdx: it.ckIdx })}
                                                 onClick={(e) => { e.stopPropagation(); if(type === 'checkin') setCheckinModal({ idx: it.fIdx, ckIdx: it.ckIdx }); }}
                                                 className={`absolute top-2 bottom-2 rounded-md px-2 flex flex-col justify-center cursor-move border transition-all hover:z-50 hover:shadow-xl hover:scale-[1.02] overflow-hidden select-none ${it.conflict ? 'border-red-500 text-red-900 shadow-sm' : 'border-slate-300/50 text-slate-800 shadow-md'} ${it.isEtd ? 'border-dashed border-slate-600' : ''}`}
                                                 style={{ left: x, width: w, background: it.conflict ? bgStyle : undefined, backgroundColor: !it.conflict ? bgStyle : undefined }}
                                                 title={`${it.id} | ${it.acType} | ${fmtTime(it.start)} - ${fmtTime(it.end)}`}
                                             >
                                                 <div className="flex justify-between items-center gap-1 w-full">
                                                     <div className="flex items-center gap-1 overflow-hidden">
                                                        {w > 40 && <Plane size={10} className="text-slate-500 opacity-50 flex-shrink-0"/>}
                                                        <span className="font-black text-[11px] truncate leading-tight">{it.id}</span>
                                                     </div>
                                                     {w > 100 && (
                                                         <div className="flex justify-between items-center mt-1 border-t border-black/5 pt-0.5">
                                                             <span className="text-[9px] font-mono opacity-80">{fmtTime(it.start)}</span>
                                                             <div className="h-0.5 flex-1 bg-black/10 mx-1 rounded-full"></div>
                                                             <span className="text-[9px] font-mono opacity-80">{fmtTime(it.end)}</span>
                                                         </div>
                                                     )}
                                                 </div>
                                             </div>
                                         );
                                     })}
                                 </div>
                             );
                         })}
                     </div>
                 </div>
             </div>
        </div>
    );
  };

  const renderPeakMatrix = () => {
    // ... (Keep existing implementation, logic remains valid with flight data)
    // Use Peak specific range if set, otherwise fallback to null
    if(!peakStart || !peakEnd) return null;
    const s = new Date(peakStart); 
    const e = new Date(peakEnd);
    
    // --- MODE SWITCHER & HEADER ---
    const Header = () => (
        <div className="w-full max-w-6xl flex flex-col gap-4 mb-6">
            <div className="flex justify-between items-end">
                <h3 className="font-bold text-2xl text-slate-900 flex items-center gap-2">
                    <BarChart2 className="text-blue-600"/> 
                    {peakMode === 'density' ? 'Flight Density Analysis' : (peakMode === 'gate' ? 'Gate Capacity Planning' : 'Check-in Counter Demand')}
                </h3>
                <div className="flex bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
                    <button 
                        onClick={() => setPeakMode('density')} 
                        className={`px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${peakMode === 'density' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Plane size={14}/> Flight Density
                    </button>
                    <button 
                        onClick={() => setPeakMode('gate')} 
                        className={`px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${peakMode === 'gate' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <DoorOpen size={14}/> Gate Load
                    </button>
                    <button 
                        onClick={() => setPeakMode('checkin')} 
                        className={`px-4 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${peakMode === 'checkin' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                        <Users size={14}/> Counter Load
                    </button>
                </div>
            </div>

            {/* Time Controls for Peak Analysis */}
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                         <CalendarClock size={18} className="text-slate-400"/>
                         <span className="text-xs font-bold text-slate-500 uppercase">Analysis Period</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                            <label className="text-[10px] font-bold text-slate-400">FROM</label>
                            <input 
                                type="datetime-local" 
                                value={peakStart} 
                                onChange={e => setPeakStart(e.target.value)} 
                                onClick={(e) => e.currentTarget.showPicker()}
                                className="border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 bg-white outline-none focus:border-blue-500 shadow-sm cursor-pointer"
                            />
                        </div>
                        <span className="text-slate-300">➜</span>
                        <div className="flex flex-col">
                             <label className="text-[10px] font-bold text-slate-400">TO</label>
                             <input 
                                type="datetime-local" 
                                value={peakEnd} 
                                onChange={e => setPeakEnd(e.target.value)} 
                                onClick={(e) => e.currentTarget.showPicker()}
                                className="border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 bg-white outline-none focus:border-blue-500 shadow-sm cursor-pointer"
                             />
                        </div>
                    </div>
                    <button 
                        onClick={() => {
                             setPeakStart(gStart);
                             setPeakEnd(gEnd);
                        }}
                        className="ml-2 p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Reset to Schedule Range"
                    >
                        <RotateCw size={14}/>
                    </button>
                </div>

                {/* Granularity Control - Only for Resource Modes */}
                {peakMode !== 'density' && (
                    <div className="flex items-center gap-2 pl-6 border-l border-slate-200">
                        <ListFilter size={16} className="text-slate-400"/>
                        <span className="text-xs font-bold text-slate-500 uppercase">Resolution:</span>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                             <button 
                                onClick={() => setPeakGranularity('15m')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${peakGranularity === '15m' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                             >
                                15 Mins
                             </button>
                             <button 
                                onClick={() => setPeakGranularity('1h')}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-colors ${peakGranularity === '1h' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                             >
                                Hourly Peak
                             </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    if (peakMode === 'density') {
        // --- DENSITY MODE (EXISTING) ---
        const sub = flights.filter(f => f.target >= s && f.target <= e);
        const matrix: Record<string, Record<number, {count: number, flts: Flight[]}>> = {};
        const hourlyAggregates = Array(24).fill(0);

        sub.forEach(f => {
           const d = f.target.toLocaleDateString('vi-VN');
           if(!matrix[d]) matrix[d] = {};
           const h = f.target.getHours();
           if(!matrix[d][h]) matrix[d][h] = {count: 0, flts: []};
           matrix[d][h].count++;
           matrix[d][h].flts.push(f);
           hourlyAggregates[h]++;
        });

        const hours = Array.from({length: 24}, (_, i) => i);
        const chartData = {
            labels: hours.map(h => `${h}h`),
            datasets: [{
                label: 'Tổng số chuyến bay',
                data: hourlyAggregates,
                backgroundColor: '#3b82f6',
                borderRadius: 6,
            }]
        };

        return (
            <div id="peak-wrapper" className="p-8 overflow-auto bg-slate-100 h-full flex flex-col items-center gap-8">
                <Header />
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-6xl h-80 flex flex-col">
                     <h4 className="font-bold text-sm text-slate-500 mb-4 uppercase tracking-wider">Biểu đồ phân bổ chuyến bay theo giờ</h4>
                     <div className="flex-1 relative">
                         <Bar data={chartData} options={{ maintainAspectRatio: false, responsive: true, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', padding: 12, cornerRadius: 8 } } }} />
                     </div>
                </div>
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-full max-w-6xl">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="font-bold text-sm text-slate-500 uppercase tracking-wider">Heatmap mật độ chi tiết</h4>
                        <div className="flex gap-4 text-xs font-medium bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700">
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-white border border-slate-300"></span> 0</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-200"></span> 1-2</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-100 border border-yellow-200"></span> 3-4</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-400 text-white shadow-sm"></span> 5-6</span>
                            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-600 text-white shadow-sm"></span> 7+</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-4 border-b-2 border-slate-300 text-left bg-slate-100 text-slate-800 font-bold sticky top-0 min-w-[120px]">Date / Time</th>
                                    {hours.map(h => <th key={h} className="p-2 border-b-2 border-slate-300 bg-slate-100 w-10 text-center text-slate-800 font-semibold">{h}h</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {Object.keys(matrix).sort().map(date => (
                                    <tr key={date} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 border-b border-slate-200 font-bold text-slate-800 bg-white">{date}</td>
                                        {hours.map(h => {
                                            const cell = matrix[date][h];
                                            const c = cell ? cell.count : 0;
                                            let bg = 'bg-white';
                                            if(c > 0) bg = 'bg-green-100 text-green-900 border-green-200';
                                            if(c > 2) bg = 'bg-yellow-100 text-yellow-900 border-yellow-200';
                                            if(c > 4) bg = 'bg-orange-400 text-white font-bold shadow-sm';
                                            if(c > 6) bg = 'bg-red-600 text-white font-bold shadow-md';
                                            return <td key={h} className={`border border-slate-200 text-center cursor-pointer transition-transform hover:scale-110 ${bg}`} onClick={() => { if(c>0) setPeakDetail({d: date, h, flights: cell.flts}) }} title={`${c} flights`}>{c || ''}</td>;
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    } else {
        // --- RESOURCE OCCUPANCY MODE (GATE/COUNTER) ---
        let labels: string[] = [];
        let dataPoints: number[] = [];
        const timePoints: Date[] = [];
        
        // 1. Generate 15-minute base intervals
        let curr = new Date(s);
        curr.setMinutes(Math.floor(curr.getMinutes() / 15) * 15, 0, 0);

        while(curr <= e) {
            timePoints.push(new Date(curr));
            curr = new Date(curr.getTime() + 15 * 60000);
        }

        // 2. Calculate Raw Occupancy (15 min)
        const rawOccupancy = timePoints.map(t => {
            const timeVal = t.getTime();
            if (peakMode === 'gate') {
                return flights.filter(f => {
                    if (f.target < s || f.target > e) return false;
                    const start = f.target.getTime() - (bufS * 60000);
                    const end = f.target.getTime() + (bufE * 60000);
                    return timeVal >= start && timeVal <= end;
                }).length;
            } else {
                let count = 0;
                flights.forEach(f => {
                    if (f.checkinData.length > 0) {
                        f.checkinData.forEach(ck => {
                            if (timeVal >= ck.start.getTime() && timeVal <= ck.end.getTime()) {
                                count++;
                            }
                        });
                    }
                });
                return count;
            }
        });

        // 3. Apply Granularity Logic
        if (peakGranularity === '1h') {
             // Aggregate to Hourly Peaks (Max value in the hour)
             const hourlyMap: Record<string, { max: number, time: Date }> = {};
             
             timePoints.forEach((t, i) => {
                 const hourKey = `${t.getDate()}/${t.getMonth()+1} ${t.getHours()}:00`;
                 if (!hourlyMap[hourKey]) hourlyMap[hourKey] = { max: 0, time: t };
                 if (rawOccupancy[i] > hourlyMap[hourKey].max) {
                     hourlyMap[hourKey].max = rawOccupancy[i];
                 }
             });

             const aggregated = Object.entries(hourlyMap); // Ordered by insertion naturally if iterating time
             labels = aggregated.map(([k]) => k);
             dataPoints = aggregated.map(([_, v]) => v.max);
        } else {
            // Keep 15m resolution
            labels = timePoints.map(t => fmtTime(t));
            dataPoints = rawOccupancy;
        }

        const maxVal = Math.max(...dataPoints, 5); 
        const limitLine = peakMode === 'gate' ? activeGates.length : ckRows.length;
        
        // Dynamic Chart Width for Horizontal Scrolling
        // If we have many points (e.g., > 40), expand width. 
        // 1 point approx 20px wide ensures readability.
        const minChartWidth = dataPoints.length > 40 ? dataPoints.length * 20 : '100%';

        const chartData = {
            labels,
            datasets: [
                {
                    label: peakMode === 'gate' ? 'Gate Occupancy' : 'Active Counters',
                    data: dataPoints,
                    fill: true,
                    backgroundColor: peakMode === 'gate' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    borderColor: peakMode === 'gate' ? '#2563eb' : '#059669',
                    pointRadius: peakGranularity === '1h' ? 4 : 2,
                    pointHoverRadius: 6,
                    tension: 0.3,
                }
            ]
        };

        return (
            <div id="peak-wrapper" className="p-8 overflow-auto bg-slate-100 h-full flex flex-col items-center gap-8">
                <Header />
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-6xl flex-1 min-h-[500px] flex flex-col relative overflow-hidden">
                     <div className="absolute top-6 right-6 z-10 bg-white/80 backdrop-blur border border-slate-200 p-3 rounded-lg shadow-sm">
                         <div className="text-xs font-bold text-slate-500 uppercase mb-1">Current Capacity</div>
                         <div className="text-2xl font-black text-slate-800">
                             {limitLine} <span className="text-sm font-medium text-slate-400">{peakMode === 'gate' ? 'Gates' : 'Counters'}</span>
                         </div>
                     </div>

                     <h4 className="font-bold text-sm text-slate-500 mb-6 uppercase tracking-wider flex items-center gap-2">
                         {peakMode === 'gate' 
                            ? `Gate Resource Demand (${peakGranularity === '1h' ? 'Hourly Peak' : '15m Detail'})` 
                            : `Check-in Counter Resource Demand (${peakGranularity === '1h' ? 'Hourly Peak' : '15m Detail'})`
                         }
                     </h4>
                     
                     {/* SCROLLABLE CHART CONTAINER */}
                     <div className="flex-1 relative overflow-x-auto overflow-y-hidden">
                         <div style={{ width: minChartWidth, height: '100%', minHeight: '350px' }}>
                             <Line 
                                data={chartData} 
                                options={{ 
                                    maintainAspectRatio: false, 
                                    responsive: true, 
                                    interaction: { mode: 'index', intersect: false },
                                    scales: { 
                                        y: { 
                                            beginAtZero: true, 
                                            suggestedMax: maxVal + 2,
                                            grid: { color: '#f1f5f9' },
                                            title: { display: true, text: 'Units Occupied' }
                                        }, 
                                        x: { 
                                            grid: { display: false },
                                            ticks: { maxTicksLimit: peakGranularity === '1h' ? 48 : 24 } // Show more ticks if scrolled
                                        } 
                                    }, 
                                    plugins: { 
                                        legend: { display: false }, 
                                        tooltip: { 
                                            backgroundColor: '#1e293b', 
                                            padding: 12, 
                                            cornerRadius: 8,
                                            callbacks: {
                                                label: (ctx) => `${ctx.formattedValue} ${peakMode === 'gate' ? 'Gates' : 'Counters'} (Max)`
                                            }
                                        }
                                    } 
                                }} 
                             />
                         </div>
                         
                         {/* Overlay Limit Line - Needs to match chart area, simplified here as fixed overlay might look odd on scroll */}
                         {/* For scrollable charts, standard chartjs annotation is better, but simple overlay works if width is 100%. 
                             If scrolled, we disable the CSS overlay to avoid visual glitches. */}
                         {minChartWidth === '100%' && (
                            <div 
                                className="absolute left-0 right-0 border-t-2 border-red-500/30 border-dashed pointer-events-none flex items-end justify-end pr-2"
                                style={{ 
                                    top: `${(1 - (limitLine / (Math.max(maxVal, limitLine) * 1.1))) * 100}%`, 
                                    height: 0 
                                }}
                            >
                                <span className="text-[10px] font-bold text-red-500 bg-white/80 px-1 -mt-3">Capacity Limit ({limitLine})</span>
                            </div>
                         )}
                     </div>
                     
                     <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500">
                         <strong>Methodology:</strong> 
                         {peakGranularity === '1h' 
                            ? " Shows the MAXIMUM number of resources required simultaneously within each hour hour. This ensures peak demand is not hidden by averaging."
                            : " Detailed view showing resource demand at every 15-minute interval."
                         }
                     </div>
                </div>
            </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100 text-slate-900 relative">
      {/* EXPORT HIDDEN CONTAINER */}
      {isExporting && (
          <div style={{ position: 'fixed', top: '-10000px', left: '-10000px' }}>
              {renderExportView()}
          </div>
      )}

      {/* Top Nav */}
      <div className="h-16 bg-slate-900 flex items-center justify-between px-6 shadow-md z-30 flex-shrink-0">
          <div className="flex items-center gap-8">
              <span className="font-black text-white flex items-center gap-2 text-xl tracking-tight">
                  <Plane className="text-blue-400"/> OpsMaster <span className="text-slate-500 font-light">| Dispatch</span>
              </span>
              <div className="flex gap-2 bg-slate-800/50 p-1 rounded-lg">
                  <button onClick={() => navigate('/home')} className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-all"><Home size={16}/> Home</button>
                  <button className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 shadow-lg shadow-blue-500/20 rounded-md"><Layout size={16}/> Dispatch</button>
                  <button onClick={() => navigate('/analytics')} className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-all"><BarChart2 size={16}/> Analytics</button>
              </div>
          </div>
          <div className="flex items-center gap-4">
               {step > 1 && (
                   <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isLive ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'}`}>
                       {isLive ? <Wifi size={14} className="animate-pulse"/> : <WifiOff size={14}/>}
                       {isLive ? 'Realtime Connected' : 'Connecting...'}
                   </div>
               )}
              <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white transition-colors" title="Import New File"><FileSpreadsheet size={20}/></button>
              <button onClick={() => window.location.reload()} className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold text-xs px-4 py-2 border border-red-500/20 rounded-lg transition-all">Exit Session</button>
          </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
          {/* Toolbar */}
          <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-6 flex-shrink-0 z-20 shadow-sm">
              <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  <button onClick={() => setTab('gate')} className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'gate' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Gate Gantt</button>
                  <button onClick={() => setTab('checkin')} className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'checkin' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Check-in View</button>
                  <button onClick={() => setTab('peak')} className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${tab === 'peak' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Peak Analysis</button>
              </div>

              <div className="w-px h-8 bg-slate-200"></div>

              {tab !== 'peak' && (
                  <>
                    {tab === 'gate' && (
                        <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                                <label className="text-[10px] font-black text-slate-500 uppercase">Buffer (Pre/Post)</label>
                                <div className="flex items-center gap-1">
                                    <input type="number" value={bufS} onChange={e => setBufS(parseInt(e.target.value))} className="w-14 border border-slate-600 bg-slate-700 text-white rounded px-1 py-0.5 text-xs text-center font-bold focus:border-blue-500 outline-none"/>
                                    <span className="text-slate-400 text-xs">/</span>
                                    <input type="number" value={bufE} onChange={e => setBufE(parseInt(e.target.value))} className="w-14 border border-slate-600 bg-slate-700 text-white rounded px-1 py-0.5 text-xs text-center font-bold focus:border-blue-500 outline-none"/>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center gap-3 border-l pl-4 border-slate-200">
                         <div className="flex flex-col">
                            <label className="text-[10px] font-black text-slate-500 uppercase">View Window</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="datetime-local" 
                                    value={gStart} 
                                    onChange={e => setGStart(e.target.value)} 
                                    onClick={(e) => e.currentTarget.showPicker()}
                                    className="border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 font-bold bg-slate-50 focus:border-blue-500 outline-none cursor-pointer"
                                />
                                <span className="text-slate-400 text-[10px] font-bold">TO</span>
                                <input 
                                    type="datetime-local" 
                                    value={gEnd} 
                                    onChange={e => setGEnd(e.target.value)} 
                                    onClick={(e) => e.currentTarget.showPicker()}
                                    className="border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 font-bold bg-slate-50 focus:border-blue-500 outline-none cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                  </>
              )}

              <div className="flex-1"></div>
              
              <div className="flex gap-3 items-center">
                  {/* Zoom Controls */}
                  {tab !== 'peak' && (
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 mr-2">
                          <button onClick={() => setZoom(Math.max(1, zoom - 1))} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition-colors" title="Zoom Out"><ZoomOut size={16}/></button>
                          <span className="text-xs font-bold text-slate-700 w-8 text-center">{zoom}x</span>
                          <button onClick={() => setZoom(Math.min(10, zoom + 1))} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded transition-colors" title="Zoom In"><ZoomIn size={16}/></button>
                      </div>
                  )}

                  <button onClick={() => {}} className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"><RotateCw size={20} /></button>
                  {tab === 'gate' && <button onClick={() => setGateModalOpen(true)} className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"><Settings size={20} /></button>}
                  <button 
                    onClick={handleExportPDF} 
                    disabled={isExporting}
                    className={`flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-black text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition-all ${isExporting ? 'cursor-wait opacity-80' : ''}`}
                  >
                      {isExporting ? <Loader2 size={16} className="animate-spin"/> : <Printer size={16} />} 
                      {isExporting ? 'Generating PDF...' : 'Export PDF'}
                  </button>
              </div>
          </div>

          {/* Canvas Area */}
          <div id="dispatch-gantt" className="flex-1 overflow-hidden flex flex-col relative bg-white">
              {tab !== 'peak' && (
                 <>
                   {renderGantt(tab)}
                 </>
              )}
              {tab === 'peak' && renderPeakMatrix()}
          </div>
      </div>

      {/* Modals */}
      {checkinModal && <CheckinEditModal />}
      {gateModalOpen && <GateManagerModal />}
      {peakDetail && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-96 animate-in fade-in zoom-in duration-200">
                  <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
                      <h3 className="font-bold">{peakDetail.d} <span className="opacity-50">|</span> {peakDetail.h}:00 - {peakDetail.h}:59</h3>
                      <button onClick={() => setPeakDetail(null)} className="hover:text-red-300 text-xl font-bold">×</button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto p-2">
                      {peakDetail.flights.map((f, i) => (
                          <div key={i} className="flex justify-between items-center text-sm p-3 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <div>
                                  <div className="font-bold text-slate-800">{f.id}</div>
                                  <div className="text-xs text-slate-500">{f.acType}</div>
                              </div>
                              <div className="text-right">
                                  <div className="font-mono font-bold text-blue-600">{fmtTime(f.target)}</div>
                                  <div className="text-[10px] text-slate-400 uppercase">{f.gate || 'N/A'}</div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Dispatch;
