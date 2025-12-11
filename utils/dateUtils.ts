export const parseExcelDate = (v: any, fmt: string, fixTz: boolean): Date | null => {
  if (v === undefined || v === null || v === '') return null;
  
  let dt: Date | null = null;
  
  try {
    if (typeof v === 'number') {
      // Excel serial date (days since Dec 30 1899)
      const utc_days  = Math.floor(v - 25569);
      const utc_value = utc_days * 86400;                                        
      const date_info = new Date(utc_value * 1000);
      
      const fractional_day = v - Math.floor(v) + 0.0000001;
      let total_seconds = Math.floor(86400 * fractional_day);
      const seconds = total_seconds % 60;
      total_seconds -= seconds;
      
      const hours = Math.floor(total_seconds / (60 * 60));
      const minutes = Math.floor(total_seconds / 60) % 60;
      
      dt = new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
    } else {
      const s = String(v).trim();
      
      // Regex for DD/MM/YYYY HH:mm (e.g., 01/01/2025 9:05 or 13/05/2025 14:00)
      const dmyRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
      const match = s.match(dmyRegex);

      if (match) {
        // Explicitly parse DD/MM/YYYY to avoid US format confusion
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // Month is 0-indexed
        const year = parseInt(match[3], 10);
        const hour = match[4] ? parseInt(match[4], 10) : 0;
        const min = match[5] ? parseInt(match[5], 10) : 0;
        const sec = match[6] ? parseInt(match[6], 10) : 0;
        dt = new Date(year, month, day, hour, min, sec);
      } else {
        // Fallback to standard parser
        dt = new Date(s);
      }
    }
  } catch (e) {
    console.warn("Date parse error for value:", v);
    return null;
  }

  return (dt && !isNaN(dt.getTime())) ? dt : null;
};

export const toISOLocal = (d: Date): string => {
  if(!d || isNaN(d.getTime())) return '';
  const o = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - o).toISOString().slice(0, 16);
};

export const fmtTime = (d: Date): string => {
  if(!d || isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export const getFlightColor = (str: string): string => {
  if(!str) return '#cbd5e1';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Generate pastel colors but slightly more saturated for better visibility against white
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 85%, 88%)`;
};