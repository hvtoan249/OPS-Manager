import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend, 
  ArcElement, 
  PointElement, 
  LineElement, 
  Filler,
  getElementAtEvent
} from 'chart.js';
import { Bar, Doughnut, Line, getElementAtEvent as getElementAtEventReact } from 'react-chartjs-2';
import { 
  LucideHome, LucideBarChart2, LucidePrinter, 
  LucideDownload, LucideCalendar, LucideFilter, LucideRefreshCw, 
  LucideArrowRight, LucideX, LucideMap, LucidePieChart, LucideList, 
  LucidePlane, LucideArrowRightLeft, LucideLayout, LucideMaximize2,
  LucideGitCompare, LucideTrendingUp, LucideFileSpreadsheet, LucidePlaneTakeoff
} from 'lucide-react';
import FileUpload from '../components/FileUpload';
import { Flight, AIRLINE_MAP, AIRPORT_NAMES } from '../types';
import { parseExcelDate } from '../utils/dateUtils';

// Register ChartJS
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, Filler);

// --- TYPES ---
interface RouteStat {
    code: string;
    name: string;
    total: number;
    arr: number;
    dep: number;
    arrPax: number;
    depPax: number;
    d30: number;
    cancelled: number;
}

interface AirlineStat {
    flights: number;
    pax: number;
    otp: number;
    lf: number;
    cancelRate: number; 
    _d15: number;
    _cancel: number;
    _flown: number;
}

interface AnalyticsMetrics {
    totalFlights: number;
    arrFlights: number;
    depFlights: number;
    totalPax: number;
    loadFactor: number;
    cancelled: number;
    d15: number; 
    d30: number;
    otp: number;
    
    hourlyDistribution: number[];
    hourlyStats: { totalFlown: number; onTime: number }[];
    aircraftBreakdown: Record<string, number>;
    aircraftByAirline: Record<string, Record<string, number>>; 
    airlineStats: Record<string, AirlineStat>;
    routeStats: Record<string, RouteStat>;
}

type ViewMode = 'overview' | 'compare_time' | 'compare_airline';

const Analytics: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [flights, setFlights] = useState<Flight[]>([]);
  
  // --- CORE STATES ---
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  
  // Date Ranges
  const [rangeA, setRangeA] = useState({ from: '', to: '' }); 
  const [rangeB, setRangeB] = useState({ from: '', to: '' }); 

  // Airline Filters
  const [selectedAirline, setSelectedAirline] = useState('ALL'); 
  const [airlineA, setAirlineA] = useState(''); 
  const [airlineB, setAirlineB] = useState(''); 
  
  // Lists
  const [airlineList, setAirlineList] = useState<string[]>([]);

  // UI States
  const [marketShareLimit, setMarketShareLimit] = useState<5 | 10>(5);
  const [airlineTableLimit, setAirlineTableLimit] = useState<'top10' | 'full'>('full');
  const [routeTableLimit, setRouteTableLimit] = useState<'top10' | 'full'>('full');
  const [isExporting, setIsExporting] = useState(false);

  // Modals
  const [selectedAircraftDetail, setSelectedAircraftDetail] = useState<string | null>(null);
  const [selectedAirlineDetail, setSelectedAirlineDetail] = useState<string | null>(null);
  const [airlineDetailTab, setAirlineDetailTab] = useState<'routes' | 'flights'>('routes'); // New state for tab switching

  const [selectedRouteDetail, setSelectedRouteDetail] = useState<string | null>(null);
  const [showRouteComparison, setShowRouteComparison] = useState(false);
  
  const aircraftChartRef = useRef<any>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // --- DATA LOADING ---
  const handleDataReady = (rawData: any[], headers: string[], map: Record<string, number>, config: any) => {
     const newFlights: Flight[] = [];
     for(let i=1; i<rawData.length; i++) {
        const r = rawData[i];
        const arrFlt = map['arrFlt']!=-1 ? r[map['arrFlt']] : null;
        const depFlt = map['depFlt']!=-1 ? r[map['depFlt']] : null;
        if(!arrFlt && !depFlt) continue;

        const sta = map['sta']!=-1 ? parseExcelDate(r[map['sta']], 'auto', config.fixTz) : null;
        const ata = map['ata']!=-1 ? parseExcelDate(r[map['ata']], 'auto', config.fixTz) : null;
        const std = map['std']!=-1 ? parseExcelDate(r[map['std']], 'auto', config.fixTz) : null;
        const atd = map['atd']!=-1 ? parseExcelDate(r[map['atd']], 'auto', config.fixTz) : null;
        
        const date = sta || std || ata || atd;
        if(!date) continue;

        const acType = r[map['acType']] ? String(r[map['acType']]).trim() : 'UNK';
        let cap = 180; 
        if(acType.includes('321')) cap = 230;
        if(acType.includes('787') || acType.includes('350')) cap = 300;
        if(acType.includes('AT7')) cap = 70;
        
        const fromLoc = r[map['from']] ? String(r[map['from']]).trim().toUpperCase() : '';
        const toLoc = r[map['to']] ? String(r[map['to']]).trim().toUpperCase() : '';

        const safeStr = (v: any) => v ? String(v).trim() : '';

        const f: Flight = {
            id: arrFlt || depFlt,
            gate: '', target: date, isEtd: false, acType, acCode: '', checkinData: [],
            arrFlt, depFlt, 
            arrSts: map['arrSts']!=-1 ? safeStr(r[map['arrSts']]) : '', 
            depSts: map['depSts']!=-1 ? safeStr(r[map['depSts']]) : '',
            sta, ata, std, atd,
            arrPax: parseInt(r[map['arrPax']])||0,
            depPax: parseInt(r[map['depPax']])||0,
            from: fromLoc, to: toLoc, cap, date,
            alCode: (arrFlt || depFlt).substring(0,2).toUpperCase()
        };
        newFlights.push(f);
     }
     
     if(newFlights.length > 0) {
        const sorted = newFlights.sort((a,b) => a.date!.getTime() - b.date!.getTime());
        const d1 = sorted[0].date!;
        const d2 = sorted[sorted.length-1].date!;
        
        const fmtDate = (d: Date) => d.toISOString().split('T')[0];
        setRangeA({ from: fmtDate(d1), to: fmtDate(d2) });
        
        const diff = d2.getTime() - d1.getTime();
        const prevEnd = new Date(d1.getTime() - 86400000);
        const prevStart = new Date(prevEnd.getTime() - diff);
        setRangeB({ from: fmtDate(prevStart), to: fmtDate(prevEnd) });

        const als = Array.from(new Set(newFlights.map(f => f.alCode).filter(Boolean))).sort();
        setAirlineList(als);
        if(als.length > 0) setAirlineA(als[0]);
        if(als.length > 1) setAirlineB(als[1]);

        setFlights(newFlights);
        setStep(2);
     }
  };

  // --- CALCULATION ENGINE --- (Same as before)
  const calculateMetrics = (subset: Flight[], startStr: string, endStr: string): AnalyticsMetrics => {
      const m: AnalyticsMetrics = {
          totalFlights: 0, arrFlights: 0, depFlights: 0, totalPax: 0, loadFactor: 0, cancelled: 0, d15: 0, d30: 0, otp: 0,
          hourlyDistribution: Array(24).fill(0),
          hourlyStats: Array.from({length: 24}, () => ({ totalFlown: 0, onTime: 0 })),
          aircraftBreakdown: {}, aircraftByAirline: {}, airlineStats: {}, routeStats: {}
      };

      if(!startStr || !endStr) return m;
      const s = new Date(startStr); s.setHours(0,0,0,0);
      const e = new Date(endStr); e.setHours(23,59,59,999);

      let totalSeats = 0;
      let totalFlownForOTP = 0;

      subset.forEach(f => {
          const legs = [];
          if(f.arrFlt) legs.push({ type: 'ARR', act: f.ata, sch: f.sta || f.ata, pax: f.arrPax||0, sts: f.arrSts, route: f.from || 'UNK' });
          if(f.depFlt) legs.push({ type: 'DEP', act: f.atd, sch: f.std || f.atd, pax: f.depPax||0, sts: f.depSts, route: f.to || 'UNK' });

          legs.forEach(leg => {
              const t = leg.sch || leg.act;
              if(!t || t < s || t > e) return;

              m.totalFlights++;
              if(leg.type === 'ARR') m.arrFlights++; else m.depFlights++;
              m.totalPax += leg.pax;
              totalSeats += f.cap || 180;

              const h = t.getHours();
              if(leg.type === 'DEP') m.hourlyDistribution[h]++;

              const sts = (leg.sts || '').toUpperCase();
              const isCnl = sts.includes('CX') || sts.includes('CNL') || sts.includes('CAN') || sts.includes('HUY') || sts.includes('HỦY');
              let isD15 = false;
              let isD30 = false;
              
              if(isCnl) {
                  m.cancelled++;
              } else {
                  if(leg.act && leg.sch) {
                      const diff = leg.act.getTime() - leg.sch.getTime();
                      const dMin = diff / 60000;
                      
                      totalFlownForOTP++;
                      m.hourlyStats[h].totalFlown++;
                      
                      if(dMin > 15) { m.d15++; isD15=true; }
                      if(dMin > 30) { m.d30++; isD30=true; }
                      if(dMin <= 15) m.hourlyStats[h].onTime++;
                  }
              }
              
              const al = f.alCode || 'UNK';
              if(!m.airlineStats[al]) m.airlineStats[al] = { flights:0, pax:0, otp:0, lf:0, cancelRate:0, _d15:0, _cancel:0, _flown:0 };
              const as = m.airlineStats[al];
              as.flights++;
              as.pax += leg.pax;
              if(isCnl) as._cancel++;
              else if(leg.act) {
                  as._flown++;
                  if(isD15) as._d15++;
              }

              const r = leg.route;
              if(!m.routeStats[r]) m.routeStats[r] = { code: r, name: AIRPORT_NAMES[r]||r, total:0, arr:0, dep:0, arrPax:0, depPax:0, d30:0, cancelled:0 };
              const rs = m.routeStats[r];
              rs.total++;
              if(leg.type==='ARR') { rs.arr++; rs.arrPax+=leg.pax; } else { rs.dep++; rs.depPax+=leg.pax; }
              if(isCnl) rs.cancelled++;
              if(isD30) rs.d30++;

              if(f.acType) {
                  m.aircraftBreakdown[f.acType] = (m.aircraftBreakdown[f.acType]||0) + 1;
                  if(f.alCode) {
                      if(!m.aircraftByAirline[f.acType]) m.aircraftByAirline[f.acType] = {};
                      m.aircraftByAirline[f.acType][f.alCode] = (m.aircraftByAirline[f.acType][f.alCode] || 0) + 1;
                  }
              }
          });
      });

      if(totalFlownForOTP > 0) m.otp = ((totalFlownForOTP - m.d15) / totalFlownForOTP) * 100;
      if(totalSeats > 0) m.loadFactor = (m.totalPax / totalSeats) * 100;

      Object.values(m.airlineStats).forEach(s => {
          if(s.flights > 0) {
             const seats = s.flights * 180; 
             s.lf = (s.pax / seats) * 100;
             s.cancelRate = (s._cancel / s.flights) * 100;
          }
          if(s._flown > 0) {
             s.otp = ((s._flown - s._d15) / s._flown) * 100;
          } else {
             s.otp = 100; 
          }
      });

      return m;
  };

  // --- MEMOIZED DATASETS ---
  
  const overviewData = useMemo(() => {
      const subset = selectedAirline === 'ALL' ? flights : flights.filter(f => f.alCode === selectedAirline);
      return calculateMetrics(subset, rangeA.from, rangeA.to);
  }, [flights, rangeA, selectedAirline]);

  const statsA = useMemo(() => {
      if(viewMode === 'compare_time') {
          // Allow filtering by airline in Time Comparison mode
          const subset = selectedAirline === 'ALL' ? flights : flights.filter(f => f.alCode === selectedAirline);
          return calculateMetrics(subset, rangeA.from, rangeA.to);
      } else if(viewMode === 'compare_airline') {
          return calculateMetrics(flights.filter(f => f.alCode === airlineA), rangeA.from, rangeA.to);
      }
      return overviewData; 
  }, [flights, viewMode, rangeA, airlineA, selectedAirline, overviewData]);

  const statsB = useMemo(() => {
      if(viewMode === 'compare_time') {
          // Allow filtering by airline in Time Comparison mode
          const subset = selectedAirline === 'ALL' ? flights : flights.filter(f => f.alCode === selectedAirline);
          return calculateMetrics(subset, rangeB.from, rangeB.to);
      } else if(viewMode === 'compare_airline') {
          return calculateMetrics(flights.filter(f => f.alCode === airlineB), rangeA.from, rangeA.to);
      }
      return overviewData;
  }, [flights, viewMode, rangeB, rangeA, airlineB, selectedAirline, overviewData]);

  // Route Comparison Data
  const routeComparisonData = useMemo(() => {
    if(!showRouteComparison) return null;
    const rA = statsA.routeStats;
    const rB = statsB.routeStats;
    const codesA = new Set(Object.keys(rA));
    const codesB = new Set(Object.keys(rB));
    
    const common = [...codesA].filter(x => codesB.has(x)).map(c => ({
        code: c,
        name: rA[c].name,
        valA: rA[c].total,
        valB: rB[c].total,
        paxA: rA[c].arrPax + rA[c].depPax,
        paxB: rB[c].arrPax + rB[c].depPax
    })).sort((a,b) => b.valA - a.valA);

    const uniqueA = [...codesA].filter(x => !codesB.has(x)).map(c => rA[c]).sort((a,b) => b.total - a.total);
    const uniqueB = [...codesB].filter(x => !codesA.has(x)).map(c => rB[c]).sort((a,b) => b.total - a.total);
    
    return { common, uniqueA, uniqueB };
  }, [showRouteComparison, statsA, statsB]);

  // --- DRILL DOWN HELPERS ---
  const getAirlineRoutes = (alCode: string) => {
      const routes: Record<string, {flights: number, pax: number}> = {};
      const s = new Date(rangeA.from); s.setHours(0,0,0,0);
      const e = new Date(rangeA.to); e.setHours(23,59,59,999);

      flights.filter(f => f.alCode === alCode).forEach(f => {
          if(f.arrFlt && f.from) {
               const t = f.sta || f.ata;
               if(t && t >= s && t <= e) {
                   const r = f.from;
                   if(!routes[r]) routes[r] = {flights:0, pax:0};
                   routes[r].flights++; routes[r].pax += f.arrPax||0;
               }
          }
          if(f.depFlt && f.to) {
               const t = f.std || f.atd;
               if(t && t >= s && t <= e) {
                   const r = f.to;
                   if(!routes[r]) routes[r] = {flights:0, pax:0};
                   routes[r].flights++; routes[r].pax += f.depPax||0;
               }
          }
      });
      return (Object.entries(routes) as [string, {flights: number, pax: number}][]).sort((a,b) => b[1].flights - a[1].flights);
  };

  const getAirlineFlightStats = (alCode: string) => {
      const stats: Record<string, { count: number, pax: number, hours: Set<string>, dest: string }> = {};
      const s = new Date(rangeA.from); s.setHours(0,0,0,0);
      const e = new Date(rangeA.to); e.setHours(23,59,59,999);
      
      const oneDay = 24 * 60 * 60 * 1000;
      const days = Math.round(Math.abs((s.getTime() - e.getTime()) / oneDay)) + 1;
      const weeks = Math.max(1, days / 7);

      flights.filter(f => f.alCode === alCode && f.depFlt).forEach(f => {
          const t = f.std || f.atd;
          if(t && t >= s && t <= e) {
              const flt = f.depFlt!;
              if(!stats[flt]) stats[flt] = { count: 0, pax: 0, hours: new Set(), dest: f.to || 'UNK' };
              stats[flt].count++;
              stats[flt].pax += f.depPax || 0;
              const h = t.getHours();
              stats[flt].hours.add(`${h.toString().padStart(2, '0')}:00`);
          }
      });
      
      return Object.entries(stats)
          .map(([flt, data]) => ({
              flt,
              ...data,
              hoursStr: Array.from(data.hours).sort().join(', '),
              freq: (data.count / weeks).toFixed(1)
          }))
          .sort((a,b) => b.count - a.count);
  };

  const getAirlinesByRoute = (stationCode: string) => {
      const airlineMap: Record<string, { flights: number, pax: number, acTypes: Set<string> }> = {};
      const s = new Date(rangeA.from); s.setHours(0,0,0,0);
      const e = new Date(rangeA.to); e.setHours(23,59,59,999);
      
      flights.forEach(f => {
          if (f.arrFlt && f.from === stationCode) {
              const t = f.sta || f.ata;
              if(t && t >= s && t <= e) {
                  const al = f.alCode || 'UNK';
                  if(!airlineMap[al]) airlineMap[al] = { flights: 0, pax: 0, acTypes: new Set() };
                  airlineMap[al].flights++; airlineMap[al].pax += f.arrPax||0;
                  if(f.acType) airlineMap[al].acTypes.add(f.acType);
              }
          }
          if (f.depFlt && f.to === stationCode) {
              const t = f.std || f.atd;
              if(t && t >= s && t <= e) {
                  const al = f.alCode || 'UNK';
                  if(!airlineMap[al]) airlineMap[al] = { flights: 0, pax: 0, acTypes: new Set() };
                  airlineMap[al].flights++; airlineMap[al].pax += f.depPax||0;
                  if(f.acType) airlineMap[al].acTypes.add(f.acType);
              }
          }
      });
      return Object.entries(airlineMap).sort((a,b) => b[1].flights - a[1].flights);
  };

  const getDiff = (a: number, b: number, inverse = false) => {
      if(b === 0) return { val: 0, class: 'text-slate-300' };
      const pct = ((a - b) / b) * 100;
      const isPos = pct > 0;
      let color = isPos ? 'text-emerald-500' : 'text-red-500';
      if(inverse) color = isPos ? 'text-red-500' : 'text-emerald-500';
      return { val: Math.abs(pct).toFixed(1) + '%', sign: isPos ? '+' : '-', class: `text-[10px] font-bold ${color} bg-white/80 px-1 rounded ml-2 border border-slate-100` };
  };

  const renderKPICard = (title: string, valA: number, valB: number, type: 'number'|'percent' = 'number', inverse = false, onClick?: () => void) => {
      const diff = getDiff(valA, valB, inverse);
      const displayA = type === 'percent' ? valA.toFixed(1) + '%' : valA.toLocaleString();
      const displayB = type === 'percent' ? valB.toFixed(1) + '%' : valB.toLocaleString();

      const labelA = viewMode === 'compare_time' ? 'Kỳ A' : airlineA;
      const labelB = viewMode === 'compare_time' ? 'Kỳ B' : airlineB;

      return (
          <div 
            className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between h-32 relative overflow-hidden group hover:shadow-md transition-all ${onClick ? 'cursor-pointer hover:border-blue-300' : ''}`}
            onClick={onClick}
          >
              <div className="flex justify-between items-start z-10">
                  <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{title}</h4>
                  {viewMode === 'compare_airline' && <LucidePlane className="text-slate-200 group-hover:text-blue-100 transition-colors transform group-hover:scale-110" size={24}/>}
              </div>
              <div className="z-10 mt-2">
                  <div className="flex items-baseline justify-between">
                      <div className="text-2xl font-black text-slate-800">{displayA}</div>
                      <div className="text-sm font-bold text-slate-400 opacity-80 text-right">{labelB}: {displayB}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">{labelA}</span>
                      <span className={diff.class}>{diff.sign}{diff.val}</span>
                  </div>
              </div>
              <div className="absolute right-0 bottom-0 w-16 h-16 bg-gradient-to-tl from-slate-50 to-transparent rounded-tl-full pointer-events-none"></div>
          </div>
      );
  };

  // --- EXPORT LOGIC ---
  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    setIsExporting(true);

    try {
        const element = dashboardRef.current;
        const scrollables = element.querySelectorAll('.analytics-scrollable-table');
        const originalStyles: {el: Element, height: string, overflow: string}[] = [];
        
        scrollables.forEach(el => {
            const htmlEl = el as HTMLElement;
            originalStyles.push({ el: htmlEl, height: htmlEl.style.maxHeight, overflow: htmlEl.style.overflow });
            htmlEl.style.maxHeight = 'none';
            htmlEl.style.overflow = 'visible';
        });

        const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false, windowWidth: element.scrollWidth, height: element.scrollHeight });
        
        scrollables.forEach((el, i) => {
            const htmlEl = el as HTMLElement;
            htmlEl.style.maxHeight = originalStyles[i].height;
            htmlEl.style.overflow = originalStyles[i].overflow;
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        let heightLeft = pdfHeight;
        let position = 0;
        let page = 1;

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, -page * pageHeight, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;
            page++;
        }
        pdf.save(`OpsMaster_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
        console.error("Export failed:", error);
        alert("Failed to export report.");
    } finally {
        setIsExporting(false);
    }
  };

  const handleExportExcel = () => {
      // Create a workbook
      const wb = XLSX.utils.book_new();

      // 1. Summary Sheet
      const summaryData = [
          ["Metric", "Value"],
          ["Total Flights", overviewData.totalFlights],
          ["Arrivals", overviewData.arrFlights],
          ["Departures", overviewData.depFlights],
          ["Total Pax", overviewData.totalPax],
          ["Load Factor (%)", overviewData.loadFactor.toFixed(2)],
          ["Cancelled", overviewData.cancelled],
          ["OTP 15 (%)", overviewData.otp.toFixed(2)],
          ["Delay > 15", overviewData.d15],
          ["Delay > 30", overviewData.d30]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Overview");

      // 2. Airlines Sheet
      const airlineData = Object.entries(overviewData.airlineStats).map(([code, val]) => {
          const s = val as AirlineStat;
          return {
            Code: code,
            Name: AIRLINE_MAP[code] || code,
            Flights: s.flights,
            Pax: s.pax,
            "OTP 15 (%)": (s.otp || 0).toFixed(2),
            Cancelled: s._cancel,
            "Cancel Rate (%)": (s.cancelRate || 0).toFixed(2),
            "Load Factor (%)": (s.lf || 0).toFixed(2)
          };
      });
      const wsAirlines = XLSX.utils.json_to_sheet(airlineData);
      XLSX.utils.book_append_sheet(wb, wsAirlines, "Airline Stats");

      // 3. Routes Sheet
      const routeData = Object.values(overviewData.routeStats).map((val) => {
          const r = val as RouteStat;
          return {
            Route: r.code,
            Airport: r.name,
            Total: r.total,
            Arr: r.arr,
            Dep: r.dep,
            "Arr Pax": r.arrPax,
            "Dep Pax": r.depPax,
            "Delay > 30": r.d30,
            Cancelled: r.cancelled
          };
      });
      const wsRoutes = XLSX.utils.json_to_sheet(routeData);
      XLSX.utils.book_append_sheet(wb, wsRoutes, "Route Network");

      // 4. Hourly Sheet
      const hourlyData = overviewData.hourlyStats.map((h, i) => ({
          Hour: `${i}:00`,
          "Total Flown": h.totalFlown,
          "On Time": h.onTime,
          "OTP (%)": h.totalFlown > 0 ? ((h.onTime/h.totalFlown)*100).toFixed(2) : 0,
          "Traffic Volume": overviewData.hourlyDistribution[i]
      }));
      const wsHourly = XLSX.utils.json_to_sheet(hourlyData);
      XLSX.utils.book_append_sheet(wb, wsHourly, "Hourly Ops");

      // Save file
      XLSX.writeFile(wb, `OpsMaster_Analytics_Data_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // --- CHART DATA PREP --- (Rest of the component remains similar)
  const flightDistData = {
      labels: Array.from({length:24},(_,i)=>`${i}h`),
      datasets: [{ label: 'Chuyến bay', data: overviewData.hourlyDistribution, backgroundColor: '#3b82f6', borderRadius: 4, barPercentage: 0.6 }]
  };
  const otpChartData = {
      labels: Array.from({length:24},(_,i)=>`${i}h`),
      datasets: [{
          label: 'OTP 15 (%)',
          data: overviewData.hourlyStats.map(h => h.totalFlown > 0 ? (h.onTime / h.totalFlown) * 100 : null),
          borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.3, fill: true, pointRadius: 3
      }]
  };
  const acData = {
      labels: Object.keys(overviewData.aircraftBreakdown),
      datasets: [{ label: 'Flights', data: Object.values(overviewData.aircraftBreakdown), backgroundColor: ['#f97316', '#3b82f6', '#10b981', '#6366f1', '#ec4899'], borderRadius: 4 }]
  };
  const lfChartData = {
      labels: Object.keys(overviewData.airlineStats),
      datasets: [{ label: 'LF (%)', data: Object.values(overviewData.airlineStats).map((s: AirlineStat) => s.lf), backgroundColor: '#8b5cf6', borderRadius: 4 }]
  };
  const marketShareEntries = Object.entries(overviewData.airlineStats) as [string, AirlineStat][];
  const marketShareSorted = marketShareEntries.sort((a,b) => b[1].pax - a[1].pax).slice(0, marketShareLimit);
  const marketShareData = {
      labels: marketShareSorted.map(([code]) => code),
      datasets: [{ data: marketShareSorted.map(([_, s]) => s.pax), backgroundColor: ['#3b82f6', '#6366f1', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'], borderWidth: 2 }]
  };

  const onAircraftChartClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const chart = aircraftChartRef.current;
    if (!chart) return;
    const element = getElementAtEventReact(chart, event);
    if (!element.length) return;
    const { index } = element[0];
    const type = Object.keys(overviewData.aircraftBreakdown)[index];
    setSelectedAircraftDetail(type);
  };

  // Comparison Charts
  const labelA = viewMode === 'compare_time' ? 'Kỳ A' : airlineA;
  const labelB = viewMode === 'compare_time' ? 'Kỳ B' : airlineB;
  const volData = {
      labels: ['Tổng chuyến', 'Chuyến Đến', 'Chuyến Đi', 'Khách (k)'],
      datasets: [
          { label: labelA, data: [statsA.totalFlights, statsA.arrFlights, statsA.depFlights, statsA.totalPax/1000], backgroundColor: '#3b82f6', borderRadius: 4 },
          { label: labelB, data: [statsB.totalFlights, statsB.arrFlights, statsB.depFlights, statsB.totalPax/1000], backgroundColor: '#93c5fd', borderRadius: 4 }
      ]
  };
  const lfData = {
      labels: ['Load Factor %'],
      datasets: [
          { label: labelA, data: [statsA.loadFactor], backgroundColor: '#8b5cf6', borderRadius: 4, barThickness: 40 },
          { label: labelB, data: [statsB.loadFactor], backgroundColor: '#c4b5fd', borderRadius: 4, barThickness: 40 }
      ]
  };
  const qualityData = {
      labels: ['Chậm >30p', 'Hủy'],
      datasets: [
          { label: labelA, data: [statsA.d30, statsA.cancelled], backgroundColor: '#ef4444', borderRadius: 4, barThickness: 40 },
          { label: labelB, data: [statsB.d30, statsB.cancelled], backgroundColor: '#fca5a5', borderRadius: 4, barThickness: 40 }
      ]
  };

  if(step === 1) return <FileUpload title="Analytics Module" mappings={[{key:'arrFlt', label:'Arr Flight'}, {key:'depFlt', label:'Dep Flight'}, {key:'arrSts', label:'Arr Status', optional: true}, {key:'depSts', label:'Dep Status', optional: true}, {key:'sta', label:'STA'}, {key:'ata', label:'ATA', optional: true}, {key:'std', label:'STD'}, {key:'atd', label:'ATD', optional: true}, {key:'arrPax', label:'Arr Pax', optional: true}, {key:'depPax', label:'Dep Pax', optional: true}, {key:'from', label:'From', optional: true}, {key:'to', label:'To', optional: true}, {key:'acType', label:'AC Type', optional: true}]} onDataReady={handleDataReady} />;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-900">
       <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
           <div className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-blue-600 text-white p-1.5 rounded-lg"><LucideBarChart2 size={20}/></div>
                    <span className="font-bold text-lg text-slate-800">Analytics: Production Release</span>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => navigate('/home')} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-md transition-colors flex items-center gap-2"><LucideHome size={14}/> Home</button>
                    
                    <button 
                        onClick={handleExportExcel}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm flex items-center gap-2 transition-all"
                    >
                        <LucideFileSpreadsheet size={14}/> Excel Data
                    </button>

                    <button 
                        onClick={handleExportPDF} 
                        disabled={isExporting}
                        className={`px-3 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-black rounded-md shadow-sm flex items-center gap-2 transition-all ${isExporting ? 'opacity-75 cursor-wait' : ''}`}
                    >
                        {isExporting ? <LucideRefreshCw size={14} className="animate-spin"/> : <LucidePrinter size={14}/>} 
                        {isExporting ? 'Generating...' : 'Export Report'}
                    </button>
                </div>
           </div>
           
           <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-6 items-end">
               <div>
                   <label className="text-[10px] font-extrabold text-slate-400 uppercase mb-1.5 block">CHẾ ĐỘ XEM</label>
                   <div className="relative">
                       <select value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)} className="bg-white border-2 border-slate-200 text-blue-700 text-xs font-bold rounded-lg px-3 py-2 pr-8 focus:border-blue-500 outline-none shadow-sm appearance-none min-w-[160px] cursor-pointer">
                           <option value="overview">📊 Tổng quan (Overview)</option>
                           <option value="compare_time">⏳ So sánh Thời gian</option>
                           <option value="compare_airline">✈️ So sánh Hãng bay</option>
                       </select>
                       <LucideArrowRightLeft size={12} className="absolute right-3 top-2.5 text-blue-400 pointer-events-none"/>
                   </div>
               </div>
               
               {/* FILTERS RENDERING */}
               {viewMode === 'overview' && (
                   <>
                       <div>
                           <label className="text-[10px] font-extrabold text-slate-500 uppercase mb-1.5 block">THỜI GIAN</label>
                           <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
                               <input type="date" value={rangeA.from} onChange={e => setRangeA({...rangeA, from: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                               <span className="text-slate-300">➜</span>
                               <input type="date" value={rangeA.to} onChange={e => setRangeA({...rangeA, to: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                           </div>
                       </div>
                       <div>
                           <label className="text-[10px] font-extrabold text-slate-500 uppercase mb-1.5 block">LỌC HÃNG</label>
                           <select value={selectedAirline} onChange={e => setSelectedAirline(e.target.value)} className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-3 py-2 w-32 shadow-sm outline-none focus:border-blue-500">
                               <option value="ALL">-- Tất cả --</option>
                               {airlineList.map(a => <option key={a} value={a}>{a}</option>)}
                           </select>
                       </div>
                   </>
               )}

               {viewMode === 'compare_time' && (
                   <div className="flex gap-4 items-end">
                       <div>
                           <label className="text-[10px] font-extrabold text-slate-500 uppercase mb-1.5 block">Lọc Hãng (Tùy chọn)</label>
                           <select value={selectedAirline} onChange={e => setSelectedAirline(e.target.value)} className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-3 py-2 w-32 shadow-sm outline-none focus:border-blue-500">
                               <option value="ALL">-- Tất cả --</option>
                               {airlineList.map(a => <option key={a} value={a}>{a}</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="text-[10px] font-extrabold text-blue-600 uppercase mb-1.5 block">Kỳ A (Gốc)</label>
                           <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
                               <input type="date" value={rangeA.from} onChange={e => setRangeA({...rangeA, from: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                               <span className="text-slate-300">➜</span>
                               <input type="date" value={rangeA.to} onChange={e => setRangeA({...rangeA, to: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                           </div>
                       </div>
                       <div>
                           <label className="text-[10px] font-extrabold text-red-500 uppercase mb-1.5 block">Kỳ B (So sánh)</label>
                           <div className="flex items-center gap-1 bg-white border border-red-200 rounded-lg p-1 shadow-sm">
                               <input type="date" value={rangeB.from} onChange={e => setRangeB({...rangeB, from: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                               <span className="text-red-200">➜</span>
                               <input type="date" value={rangeB.to} onChange={e => setRangeB({...rangeB, to: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                           </div>
                       </div>
                   </div>
               )}

               {viewMode === 'compare_airline' && (
                   <>
                       <div>
                           <label className="text-[10px] font-extrabold text-slate-500 uppercase mb-1.5 block">THỜI GIAN</label>
                           <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1 shadow-sm">
                               <input type="date" value={rangeA.from} onChange={e => setRangeA({...rangeA, from: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                               <span className="text-slate-300">➜</span>
                               <input type="date" value={rangeA.to} onChange={e => setRangeA({...rangeA, to: e.target.value})} className="text-xs font-bold text-slate-900 border-none outline-none bg-transparent px-1 py-1 w-28"/>
                           </div>
                       </div>
                       <div className="flex gap-4">
                           <div>
                               <label className="text-[10px] font-extrabold text-blue-600 uppercase mb-1.5 block">Hãng A</label>
                               <select value={airlineA} onChange={e => setAirlineA(e.target.value)} className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-3 py-2 w-32 shadow-sm outline-none focus:border-blue-500">
                                   {airlineList.map(a => <option key={a} value={a}>{a}</option>)}
                               </select>
                           </div>
                           <div>
                               <label className="text-[10px] font-extrabold text-red-500 uppercase mb-1.5 block">Hãng B</label>
                               <select value={airlineB} onChange={e => setAirlineB(e.target.value)} className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-lg px-3 py-2 w-32 shadow-sm outline-none focus:border-red-500">
                                   {airlineList.map(a => <option key={a} value={a}>{a}</option>)}
                               </select>
                           </div>
                       </div>
                   </>
               )}
           </div>
       </div>

       {/* MAIN CONTENT AREA */}
       <div className="flex-1 overflow-auto bg-slate-50 relative">
           <div ref={dashboardRef} className="p-6 min-h-full">
           {viewMode === 'overview' ? (
               // --- OVERVIEW DASHBOARD ---
               <>
                   {/* KPI Row 1 */}
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                       <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                           <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider relative z-10">Tổng chuyến</h4>
                           <div className="text-2xl font-black text-slate-800 mt-1 relative z-10">{overviewData.totalFlights.toLocaleString()}</div>
                       </div>
                       <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <div><h4 className="text-[10px] font-extrabold text-slate-400 uppercase">Chuyến đến</h4><div className="text-xl font-black text-slate-800">{overviewData.arrFlights.toLocaleString()}</div></div>
                                <div className="h-full w-px bg-slate-100 mx-2"></div>
                                <div><h4 className="text-[10px] font-extrabold text-slate-400 uppercase">Chuyến đi</h4><div className="text-xl font-black text-slate-800">{overviewData.depFlights.toLocaleString()}</div></div>
                            </div>
                       </div>
                       <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 border-l-4 border-l-red-500">
                           <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Hủy chuyến</h4>
                           <div className="text-2xl font-black text-slate-800 mt-1">{overviewData.cancelled}</div>
                           <div className="text-[10px] text-slate-400 mt-1">Rate: {overviewData.totalFlights>0 ? ((overviewData.cancelled/overviewData.totalFlights)*100).toFixed(2) : 0}%</div>
                       </div>
                       <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200 border-l-4 border-l-emerald-500">
                           <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Tổng khách</h4>
                           <div className="text-2xl font-black text-slate-800 mt-1">{overviewData.totalPax.toLocaleString()}</div>
                       </div>
                   </div>

                   {/* KPI Row 2 */}
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                           <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Hệ số tải (LF)</h4>
                           <div className="text-xl font-black text-blue-600 mt-1">{overviewData.loadFactor.toFixed(1)}%</div>
                        </div>
                        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                           <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Mạng đường bay</h4>
                           <div className="text-xl font-black text-slate-800 mt-1">{Object.keys(overviewData.routeStats).length} <span className="text-sm font-normal text-slate-400">Sân bay</span></div>
                        </div>
                        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                           <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Chậm > 15 phút (Toàn mạng)</h4>
                           <div className="text-xl font-black text-amber-500 mt-1">{overviewData.d15} <span className="text-xs text-slate-400">chuyến</span></div>
                        </div>
                   </div>

                   {/* Charts Grid */}
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-xs font-bold text-slate-600 mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Phân bổ Giờ bay (Dep)</h3>
                            <div className="h-64"><Bar data={flightDistData} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }} /></div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-xs font-bold text-slate-600 mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Xu hướng OTP 15 (Toàn mạng)</h3>
                            <div className="h-64"><Line data={otpChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { min: 0, max: 100 } } }} /></div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-xs font-bold text-slate-600 mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Hệ số Tải (LF)</h3>
                            <div className="h-48"><Bar data={lfChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { min: 40, max: 100 } }, plugins: { legend: { display: false } } }} /></div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                             <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xs font-bold text-slate-600 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Thị phần Khách</h3>
                                <div className="flex gap-2">
                                    <button onClick={() => setMarketShareLimit(5)} className={`text-[10px] font-bold px-2 py-1 rounded border ${marketShareLimit===5 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>Top 5</button>
                                    <button onClick={() => setMarketShareLimit(10)} className={`text-[10px] font-bold px-2 py-1 rounded border ${marketShareLimit===10 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>Top 10</button>
                                </div>
                             </div>
                             <div className="h-48 flex justify-center"><Doughnut data={marketShareData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } } } }} /></div>
                        </div>
                        <div className="col-span-1 lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                             <h3 className="text-xs font-bold text-slate-600 mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-500"></span> Cơ cấu Tàu bay (Click cột để xem chi tiết)</h3>
                             <div className="h-48"><Bar ref={aircraftChartRef} onClick={onAircraftChartClick} data={acData} options={{ responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } }, plugins: { legend: { display: false } }, onHover: (e, el) => { const t = e.native?.target as HTMLElement; if(t) t.style.cursor = el.length ? 'pointer' : 'default'; } }} /></div>
                        </div>
                   </div>

                   {/* Tables */}
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                       {/* Airline Table */}
                       <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                           <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                               <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2"><LucideLayout size={14}/> Thống kê Hãng Hàng không</h3>
                               <div className="flex gap-1">
                                    <button onClick={() => setAirlineTableLimit('top10')} className={`text-[10px] px-2 py-1 rounded border ${airlineTableLimit==='top10'?'bg-blue-50 text-blue-600 border-blue-200':'bg-white text-slate-500'}`}>Top 10</button>
                                    <button onClick={() => setAirlineTableLimit('full')} className={`text-[10px] px-2 py-1 rounded border ${airlineTableLimit==='full'?'bg-blue-50 text-blue-600 border-blue-200':'bg-white text-slate-500'}`}>Xem tất cả</button>
                               </div>
                           </div>
                           <div className="max-h-80 overflow-y-auto analytics-scrollable-table">
                               <table className="w-full text-xs text-left">
                                   <thead className="bg-white text-slate-500 font-bold border-b border-slate-100 sticky top-0"><tr><th className="px-6 py-3 w-16">Mã</th><th className="px-6 py-3">Tên Hãng</th><th className="px-6 py-3 text-right">Chuyến</th><th className="px-6 py-3 text-right">Khách</th><th className="px-6 py-3 text-right">OTP 15</th><th className="px-6 py-3 text-right text-red-500">Số Hủy</th><th className="px-6 py-3 text-right text-red-500">% Hủy</th><th className="px-6 py-3 text-right">Hệ số Tải</th><th className="px-6 py-3 text-right"></th></tr></thead>
                                   <tbody className="divide-y divide-slate-100">
                                       {(airlineTableLimit === 'top10' ? Object.keys(overviewData.airlineStats).sort((a,b)=>overviewData.airlineStats[b].flights-overviewData.airlineStats[a].flights).slice(0,10) : Object.keys(overviewData.airlineStats).sort((a,b)=>overviewData.airlineStats[b].flights-overviewData.airlineStats[a].flights)).map(c => {
                                           const s = overviewData.airlineStats[c];
                                           return <tr key={c} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-3 font-bold text-slate-800">{c}</td><td className="px-6 py-3 text-slate-500">{AIRLINE_MAP[c] || c}</td><td className="px-6 py-3 text-right text-slate-800">{s.flights.toLocaleString()}</td><td className="px-6 py-3 text-right text-slate-800">{s.pax.toLocaleString()}</td><td className={`px-6 py-3 text-right font-bold ${s.otp<85?'text-red-500':'text-emerald-500'}`}>{s.otp.toFixed(1)}%</td><td className="px-6 py-3 text-right text-red-600 font-bold">{s._cancel}</td><td className={`px-6 py-3 text-right font-bold ${s.cancelRate>1?'text-red-500':'text-slate-400'}`}>{s.cancelRate.toFixed(1)}%</td><td className="px-6 py-3 text-right text-slate-600 font-bold">{s.lf.toFixed(1)}%</td><td className="px-6 py-3 text-right"><button onClick={() => { setSelectedAirlineDetail(c); setAirlineDetailTab('routes'); }} className="border border-slate-200 px-2 py-1 rounded hover:bg-blue-50 hover:text-blue-600 text-slate-600 text-[10px] transition-all">Chi tiết</button></td></tr>
                                       })}
                                   </tbody>
                               </table>
                           </div>
                       </div>
                       
                       {/* Route Table */}
                       <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                           <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                               <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2"><LucideMap size={14}/> Thống kê Mạng đường bay</h3>
                               <div className="flex gap-1">
                                    <button onClick={() => setRouteTableLimit('top10')} className={`text-[10px] px-2 py-1 rounded border ${routeTableLimit==='top10'?'bg-emerald-50 text-emerald-600 border-emerald-200':'bg-white text-slate-500'}`}>Top 10</button>
                                    <button onClick={() => setRouteTableLimit('full')} className={`text-[10px] px-2 py-1 rounded border ${routeTableLimit==='full'?'bg-emerald-50 text-emerald-600 border-emerald-200':'bg-white text-slate-500'}`}>Xem tất cả</button>
                               </div>
                           </div>
                           <div className="max-h-80 overflow-y-auto analytics-scrollable-table">
                               <table className="w-full text-xs text-left">
                                   <thead className="bg-white text-slate-500 font-bold border-b border-slate-100 sticky top-0"><tr><th className="px-6 py-3">Mã Chặng</th><th className="px-6 py-3">Tên Sân bay</th><th className="px-6 py-3 text-center">Tổng chuyến</th><th className="px-6 py-3 text-center">Đến/Đi</th><th className="px-6 py-3 text-right">Khách Đến</th><th className="px-6 py-3 text-right">Khách Đi</th><th className="px-6 py-3 text-center">Delay >30p</th><th className="px-6 py-3 text-center">Hủy (SL)</th><th className="px-6 py-3 text-center">Tỷ lệ</th><th className="px-6 py-3 text-right"></th></tr></thead>
                                   <tbody className="divide-y divide-slate-100">
                                       {(routeTableLimit === 'top10' ? 
                                            Object.values(overviewData.routeStats).sort((a: RouteStat, b: RouteStat) => b.total - a.total).slice(0,10) : 
                                            Object.values(overviewData.routeStats).sort((a: RouteStat, b: RouteStat) => b.total - a.total)
                                       ).map((s: RouteStat) => (
                                           <tr key={s.code} className="hover:bg-slate-50 transition-colors"><td className="px-6 py-3 font-bold font-mono text-slate-900">{s.code}</td><td className="px-6 py-3 text-slate-500">{s.name}</td><td className="px-6 py-3 text-center font-bold text-slate-800">{s.total.toLocaleString()}</td><td className="px-6 py-3 text-center text-xs"><span className="text-emerald-600 font-bold">{s.arr}</span> / <span className="text-blue-600 font-bold">{s.dep}</span></td><td className="px-6 py-3 text-right text-emerald-700">{s.arrPax.toLocaleString()}</td><td className="px-6 py-3 text-right text-blue-700">{s.depPax.toLocaleString()}</td><td className="px-6 py-3 text-center">{s.d30>0?<span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{((s.d30/s.total)*100).toFixed(1)}%</span>:<span className="text-slate-300">-</span>}</td><td className="px-6 py-3 text-center text-red-600 font-bold">{s.cancelled}</td><td className="px-6 py-3 text-center">{s.cancelled>0?<span className="bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-bold">{((s.cancelled/s.total)*100).toFixed(1)}%</span>:<span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[10px] font-bold">0.0%</span>}</td><td className="px-6 py-3 text-right"><button onClick={() => setSelectedRouteDetail(s.code)} className="border border-slate-200 px-2 py-1 rounded hover:bg-emerald-50 hover:text-emerald-600 text-slate-600 text-[10px] transition-all">Chi tiết</button></td></tr>
                                       })}
                                   </tbody>
                               </table>
                           </div>
                       </div>
                   </div>
               </>
           ) : (
               // --- COMPARISON DASHBOARD ---
               <>
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                       {renderKPICard('Tổng chuyến', statsA.totalFlights, statsB.totalFlights)}
                       {renderKPICard('Chuyến Đến', statsA.arrFlights, statsB.arrFlights)}
                       {renderKPICard('Chuyến Đi', statsA.depFlights, statsB.depFlights)}
                       {renderKPICard('Tổng khách', statsA.totalPax, statsB.totalPax)}
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                       {renderKPICard('Hệ số tải (LF)', statsA.loadFactor, statsB.loadFactor, 'percent')}
                       {renderKPICard('Mạng đường bay (Click so sánh)', Object.keys(statsA.routeStats).length, Object.keys(statsB.routeStats).length, 'number', false, () => setShowRouteComparison(true))}
                       {renderKPICard('Hủy chuyến', statsA.cancelled, statsB.cancelled, 'number', true)}
                       {renderKPICard('Chậm >30 phút', statsA.d30, statsB.d30, 'number', true)}
                   </div>
                   <div className="flex items-center gap-4 mb-6">
                       <div className="h-px bg-slate-200 flex-1"></div>
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Biểu đồ so sánh chi tiết</span>
                       <div className="h-px bg-slate-200 flex-1"></div>
                   </div>
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                       <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                           <h3 className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2"><LucideBarChart2 size={16} className="text-blue-500"/> 📊 So sánh Sản lượng</h3>
                           <div className="flex-1 min-h-[250px]"><Bar data={volData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6, font: {size: 10, weight: 'bold'} } } }, scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' } }, x: { grid: { display: false } } } }} /></div>
                       </div>
                       <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                           <h3 className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2"><LucidePieChart size={16} className="text-purple-500"/> ⚖️ So sánh Load Factor</h3>
                           <div className="flex-1 min-h-[250px]"><Bar data={lfData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6, font: {size: 10, weight: 'bold'} } } }, scales: { y: { min: 0, max: 100, grid: { color: '#f8fafc' } }, x: { grid: { display: false } } } }} /></div>
                       </div>
                       <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                           <h3 className="text-xs font-bold text-slate-700 mb-4 flex items-center gap-2"><LucideList size={16} className="text-red-500"/> ⚠️ So sánh Chất lượng</h3>
                           <div className="flex-1 min-h-[250px]"><Bar data={qualityData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6, font: {size: 10, weight: 'bold'} } } }, scales: { y: { beginAtZero: true, grid: { color: '#f8fafc' } }, x: { grid: { display: false } } } }} /></div>
                       </div>
                   </div>
               </>
           )}
           </div>
       </div>

       {/* --- MODALS (RESTORED) --- */}
       
       {selectedAircraftDetail && (
           <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                   <div className="bg-slate-800 p-4 flex justify-between items-center text-white">
                       <h3 className="font-bold text-lg flex items-center gap-2"><LucidePieChart size={20}/> Khai thác: {selectedAircraftDetail}</h3>
                       <button onClick={() => setSelectedAircraftDetail(null)} className="hover:text-red-300"><LucideX size={20}/></button>
                   </div>
                   <div className="p-6">
                       <div className="h-64">
                           <Bar 
                                data={{
                                    labels: Object.keys(overviewData.aircraftByAirline[selectedAircraftDetail] || {}),
                                    datasets: [{ label: 'Số chuyến', data: Object.values(overviewData.aircraftByAirline[selectedAircraftDetail] || {}), backgroundColor: '#3b82f6', borderRadius: 4 }]
                                }}
                                options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }}
                           />
                       </div>
                   </div>
               </div>
           </div>
       )}

       {selectedAirlineDetail && (
           <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
                   <div className="bg-slate-800 p-4 flex justify-between items-center text-white flex-shrink-0">
                       <h3 className="font-bold text-lg flex items-center gap-2"><span className="bg-white/10 px-2 py-0.5 rounded text-sm">{selectedAirlineDetail}</span> Chi tiết khai thác</h3>
                       <button onClick={() => setSelectedAirlineDetail(null)} className="hover:text-red-300"><LucideX size={20}/></button>
                   </div>
                   
                   {/* Tabs */}
                   <div className="flex bg-slate-100 border-b border-slate-200">
                       <button 
                         onClick={() => setAirlineDetailTab('routes')}
                         className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${airlineDetailTab === 'routes' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
                       >
                           <LucideMap size={16}/> Mạng bay
                       </button>
                       <button 
                         onClick={() => setAirlineDetailTab('flights')}
                         className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${airlineDetailTab === 'flights' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
                       >
                           <LucidePlaneTakeoff size={16}/> Chuyến bay
                       </button>
                   </div>

                   <div className="overflow-y-auto flex-1 p-0">
                       {airlineDetailTab === 'routes' ? (
                           <table className="w-full text-sm text-left">
                               <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0"><tr><th className="px-6 py-3">Sân bay</th><th className="px-6 py-3 text-right">Số chuyến</th><th className="px-6 py-3 text-right">Khách</th><th className="px-6 py-3 text-right">Trung bình/Chuyến</th></tr></thead>
                               <tbody className="divide-y divide-slate-100">
                                   {getAirlineRoutes(selectedAirlineDetail).map(([station, s]) => (
                                       <tr key={station} className="hover:bg-slate-50"><td className="px-6 py-3 font-bold font-mono text-slate-900">{station}</td><td className="px-6 py-3 text-right font-medium text-slate-800">{s.flights.toLocaleString()}</td><td className="px-6 py-3 text-right text-slate-800">{s.pax.toLocaleString()}</td><td className="px-6 py-3 text-right text-blue-600 font-bold">{Math.round(s.pax / s.flights)}</td></tr>
                                   ))}
                                   {getAirlineRoutes(selectedAirlineDetail).length === 0 && (<tr><td colSpan={4} className="p-8 text-center text-slate-400">Không có dữ liệu chặng bay</td></tr>)}
                               </tbody>
                           </table>
                       ) : (
                           <table className="w-full text-sm text-left">
                               <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0">
                                   <tr>
                                       <th className="px-6 py-3 w-20">Mã</th>
                                       <th className="px-6 py-3">Chặng</th>
                                       <th className="px-6 py-3 text-right">Số chuyến</th>
                                       <th className="px-6 py-3 text-right">Tần suất/tuần</th>
                                       <th className="px-6 py-3 text-right">Tổng Khách</th>
                                       <th className="px-6 py-3 text-left w-1/3">Khung giờ bay</th>
                                   </tr>
                               </thead>
                               <tbody className="divide-y divide-slate-100">
                                   {getAirlineFlightStats(selectedAirlineDetail).map((f) => (
                                       <tr key={f.flt} className="hover:bg-slate-50">
                                           <td className="px-6 py-3 font-bold font-mono text-blue-600">{f.flt}</td>
                                           <td className="px-6 py-3 font-medium text-slate-600">{f.dest}</td>
                                           <td className="px-6 py-3 text-right font-bold text-slate-800">{f.count}</td>
                                           <td className="px-6 py-3 text-right font-bold text-slate-700">{f.freq}</td>
                                           <td className="px-6 py-3 text-right text-slate-600">{f.pax.toLocaleString()}</td>
                                           <td className="px-6 py-3 text-xs text-slate-500 italic break-words">{f.hoursStr}</td>
                                       </tr>
                                   ))}
                                   {getAirlineFlightStats(selectedAirlineDetail).length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-slate-400">Không có dữ liệu chuyến bay</td></tr>)}
                               </tbody>
                           </table>
                       )}
                   </div>
               </div>
           </div>
       )}

       {selectedRouteDetail && (
           <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
                   <div className="bg-slate-800 p-4 flex justify-between items-center text-white flex-shrink-0">
                       <h3 className="font-bold text-lg flex items-center gap-2"><LucideList size={20}/> Thống kê chặng bay: <span className="bg-white/10 px-2 py-0.5 rounded text-sm font-mono">{selectedRouteDetail}</span></h3>
                       <button onClick={() => setSelectedRouteDetail(null)} className="hover:text-red-300"><LucideX size={20}/></button>
                   </div>
                   <div className="overflow-y-auto flex-1 p-0">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0"><tr><th className="px-6 py-3 w-16">Mã Hãng</th><th className="px-6 py-3">Tên Hãng</th><th className="px-6 py-3 text-center">Tàu bay khai thác</th><th className="px-6 py-3 text-right">Số chuyến</th><th className="px-6 py-3 text-right">Thị phần</th></tr></thead>
                           <tbody className="divide-y divide-slate-100">
                               {getAirlinesByRoute(selectedRouteDetail).map(([alCode, data], i) => {
                                   const total = overviewData.routeStats[selectedRouteDetail]?.total || 1;
                                   const share = (data.flights / total) * 100;
                                   return (
                                       <tr key={i} className="hover:bg-slate-50">
                                           <td className="px-6 py-3 font-bold font-mono text-slate-900">{alCode}</td><td className="px-6 py-3 font-medium text-slate-600">{AIRLINE_MAP[alCode] || alCode}</td>
                                           <td className="px-6 py-3 text-center text-slate-500 text-xs">{Array.from(data.acTypes).map(ac => (<span key={ac} className="inline-block bg-slate-100 border border-slate-200 px-1.5 rounded mr-1 mb-1">{ac}</span>))}</td>
                                           <td className="px-6 py-3 text-right font-bold text-slate-800">{data.flights}</td>
                                           <td className="px-6 py-3 text-right"><div className="flex items-center justify-end gap-2"><span className="font-bold text-xs text-slate-600">{share.toFixed(1)}%</span><div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${share}%` }}></div></div></div></td>
                                       </tr>
                                   );
                               })}
                           </tbody>
                       </table>
                   </div>
               </div>
           </div>
       )}

       {showRouteComparison && routeComparisonData && (
           <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                   <div className="bg-slate-800 p-4 flex justify-between items-center text-white flex-shrink-0">
                       <h3 className="font-bold text-lg flex items-center gap-2">
                           <LucideGitCompare size={20}/> So sánh Mạng đường bay
                           <span className="text-xs bg-white/20 px-2 py-0.5 rounded font-normal ml-2">
                               {viewMode === 'compare_time' ? `Kỳ A vs Kỳ B` : `${airlineA} vs ${airlineB}`}
                           </span>
                       </h3>
                       <button onClick={() => setShowRouteComparison(false)} className="hover:text-red-300"><LucideX size={20}/></button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto p-0 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                       
                       {/* Column 1: Unique to A */}
                       <div className="flex flex-col">
                           <div className="p-3 bg-blue-50 border-b border-blue-100 sticky top-0 z-10">
                               <h4 className="font-bold text-blue-800 text-sm flex items-center gap-2">
                                   <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                   Riêng {viewMode === 'compare_time' ? 'Kỳ A' : airlineA}
                                   <span className="ml-auto bg-blue-200 text-blue-800 text-xs px-1.5 rounded-full">{routeComparisonData.uniqueA.length}</span>
                               </h4>
                           </div>
                           <div className="flex-1 overflow-y-auto">
                               <table className="w-full text-xs text-left">
                                   <tbody className="divide-y divide-slate-50">
                                       {routeComparisonData.uniqueA.map(r => (
                                           <tr key={r.code} className="hover:bg-blue-50/50">
                                               <td className="p-3 font-bold text-slate-700">{r.code}</td>
                                               <td className="p-3 text-slate-500 truncate max-w-[100px]">{r.name}</td>
                                               <td className="p-3 text-right font-bold">{r.total} chuyến</td>
                                           </tr>
                                       ))}
                                       {routeComparisonData.uniqueA.length === 0 && <tr className="text-center text-slate-400 italic"><td colSpan={3} className="p-6">Không có chặng bay riêng</td></tr>}
                                   </tbody>
                               </table>
                           </div>
                       </div>

                       {/* Column 2: Common Routes */}
                       <div className="flex flex-col bg-slate-50/50">
                           <div className="p-3 bg-purple-50 border-b border-purple-100 sticky top-0 z-10">
                               <h4 className="font-bold text-purple-800 text-sm flex items-center gap-2">
                                   <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                   Bay Chung (Cả 2)
                                   <span className="ml-auto bg-purple-200 text-purple-800 text-xs px-1.5 rounded-full">{routeComparisonData.common.length}</span>
                               </h4>
                           </div>
                           <div className="flex-1 overflow-y-auto">
                               <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 text-slate-500 sticky top-0">
                                        <tr><th className="p-2">Chặng</th><th className="p-2 text-center text-blue-600">A</th><th className="p-2 text-center text-red-600">B</th><th className="p-2 text-right">Diff</th></tr>
                                    </thead>
                                   <tbody className="divide-y divide-slate-100">
                                       {routeComparisonData.common.map(r => {
                                           const diff = r.valA - r.valB;
                                           return (
                                               <tr key={r.code} className="hover:bg-purple-50/50">
                                                   <td className="p-3 font-bold text-slate-700">{r.code}</td>
                                                   <td className="p-3 text-center font-bold text-blue-700">{r.valA}</td>
                                                   <td className="p-3 text-center font-bold text-red-600 opacity-70">{r.valB}</td>
                                                   <td className="p-3 text-right">
                                                       <span className={`font-bold px-1.5 py-0.5 rounded ${diff > 0 ? 'bg-emerald-100 text-emerald-700' : (diff < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500')}`}>
                                                           {diff > 0 ? '+' : ''}{diff}
                                                       </span>
                                                   </td>
                                               </tr>
                                           );
                                       })}
                                   </tbody>
                               </table>
                           </div>
                       </div>

                       {/* Column 3: Unique to B */}
                       <div className="flex flex-col">
                           <div className="p-3 bg-red-50 border-b border-red-100 sticky top-0 z-10">
                               <h4 className="font-bold text-red-800 text-sm flex items-center gap-2">
                                   <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                   Riêng {viewMode === 'compare_time' ? 'Kỳ B' : airlineB}
                                   <span className="ml-auto bg-red-200 text-red-800 text-xs px-1.5 rounded-full">{routeComparisonData.uniqueB.length}</span>
                               </h4>
                           </div>
                           <div className="flex-1 overflow-y-auto">
                               <table className="w-full text-xs text-left">
                                   <tbody className="divide-y divide-slate-50">
                                       {routeComparisonData.uniqueB.map(r => (
                                           <tr key={r.code} className="hover:bg-red-50/50">
                                               <td className="p-3 font-bold text-slate-700">{r.code}</td>
                                               <td className="p-3 text-slate-500 truncate max-w-[100px]">{r.name}</td>
                                               <td className="p-3 text-right font-bold">{r.total} chuyến</td>
                                           </tr>
                                       ))}
                                       {routeComparisonData.uniqueB.length === 0 && <tr className="text-center text-slate-400 italic"><td colSpan={3} className="p-6">Không có chặng bay riêng</td></tr>}
                                   </tbody>
                               </table>
                           </div>
                       </div>

                   </div>
               </div>
           </div>
       )}

    </div>
  );
};

export default Analytics;