import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { LucideFileSpreadsheet, LucideArrowRight, LucideTableProperties } from 'lucide-react';

interface FileUploadProps {
  title: string;
  mappings: { key: string; label: string; optional?: boolean }[];
  onDataReady: (data: any[], headers: string[], mappings: Record<string, number>, config: any) => void;
  extraConfig?: React.ReactNode;
}

const FileUpload: React.FC<FileUploadProps> = ({ title, mappings, onDataReady, extraConfig }) => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, number>>({});
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');

  // Config State
  const [fixTz, setFixTz] = useState(true);
  const [dateFmt, setDateFmt] = useState('auto');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const r = new FileReader();
    r.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'array' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[];
      if (data && data.length > 0) {
        setHeaders(data[0] as string[]);
        setRawData(data);
        
        // Auto-match logic
        const newMap: Record<string, number> = {};
        mappings.forEach(m => {
          const idx = (data[0] as string[]).findIndex((h: string) => 
            String(h).toLowerCase().trim() === m.label.toLowerCase().trim() || 
            String(h).toLowerCase().includes(m.key.toLowerCase())
          );
          if (idx >= 0) newMap[m.key] = idx;
          else newMap[m.key] = -1;
        });
        setSelectedMap(newMap);
        setStep(2);
      }
    };
    r.readAsArrayBuffer(f);
  };

  const handleProcess = () => {
    // Basic validation
    onDataReady(rawData, headers, selectedMap, { fixTz, dateFmt });
  };

  if (step === 1) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
        <div className="bg-white/95 backdrop-blur-md p-12 rounded-3xl shadow-2xl border border-white/50 max-w-xl w-full text-center transition-all hover:shadow-blue-500/10 hover:scale-[1.01]">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl shadow-inner">
            ✈️
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">{title}</h2>
          <p className="text-slate-600 mb-10 text-base leading-relaxed">
            Upload your flight schedule Excel file (.xlsx, .xls) to initialize the operations dashboard.
          </p>
          
          <label className="group cursor-pointer bg-blue-700 hover:bg-blue-800 text-white font-bold py-4 px-8 rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg hover:shadow-blue-600/30 transform active:scale-95">
            <LucideFileSpreadsheet className="w-6 h-6 group-hover:animate-bounce" />
            <span className="text-lg">Select Excel File</span>
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFile} />
          </label>
          <p className="mt-4 text-xs text-slate-400 font-medium uppercase tracking-widest">Secure Local Processing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-screen p-6 bg-slate-50">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-6 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <LucideTableProperties size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Map Data Columns</h3>
              <p className="text-sm text-slate-500 font-medium">File: {fileName}</p>
            </div>
          </div>
          <button 
            onClick={() => setStep(1)} 
            className="text-slate-500 hover:text-red-600 text-sm font-bold px-4 py-2 hover:bg-red-50 rounded-lg transition-colors"
          >
            Cancel Upload
          </button>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Column Mapping Section */}
          <div className="lg:col-span-2 space-y-6">
            <h4 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Required Fields</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
              {mappings.map(m => (
                <div key={m.key} className="relative group">
                  <label className="block text-sm font-bold text-slate-800 mb-2 flex justify-between">
                    {m.label}
                    {m.optional && <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Optional</span>}
                  </label>
                  <div className="relative">
                    <select 
                       className="w-full p-3 pl-4 border-2 border-slate-200 rounded-lg text-slate-900 font-medium bg-slate-50 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all outline-none appearance-none hover:border-slate-300 cursor-pointer"
                       value={selectedMap[m.key]}
                       onChange={(e) => setSelectedMap({...selectedMap, [m.key]: parseInt(e.target.value)})}
                    >
                      <option value={-1} className="text-slate-400">-- Select Column --</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i} className="text-slate-900">
                          {h} (Col {String.fromCharCode(65+i)})
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-400">
                      ▼
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Config */}
          <div className="space-y-6">
            <h4 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 border-b pb-2">Configuration</h4>
            
            <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 shadow-sm">
                <label className="block text-xs font-bold text-blue-800 uppercase mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Date & Time
                </label>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Date Format</label>
                        <select 
                          value={dateFmt} 
                          onChange={e => setDateFmt(e.target.value)} 
                          className="w-full p-2.5 border border-blue-200 rounded-lg text-sm bg-white text-slate-800 focus:border-blue-500 outline-none"
                        >
                            <option value="auto">Auto Detect (Recommended)</option>
                            <option value="ddmm">dd/mm/yyyy (Asia/EU)</option>
                            <option value="mmdd">mm/dd/yyyy (US)</option>
                        </select>
                    </div>
                    
                    <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-blue-100">
                         <input 
                            type="checkbox" 
                            id="fixTz" 
                            checked={fixTz} 
                            onChange={e => setFixTz(e.target.checked)} 
                            className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" 
                         />
                         <div>
                           <label htmlFor="fixTz" className="text-sm font-bold text-slate-800 block cursor-pointer">Excel Timezone Fix</label>
                           <p className="text-xs text-slate-500 mt-1 leading-snug">
                             Adjusts dates by adding timezone offset. Enable if times appear incorrect.
                           </p>
                         </div>
                    </div>
                </div>
            </div>

            {extraConfig}

            <button 
              onClick={handleProcess} 
              className="w-full bg-slate-900 hover:bg-black text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
            >
                <span>Launch Dashboard</span>
                <LucideArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;