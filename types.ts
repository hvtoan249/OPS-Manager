
export interface CheckinData {
  ctr: string;
  start: Date;
  end: Date;
}

export interface Flight {
  recordId?: string; // Supabase UUID
  id: string; // Flight Number (Display ID)
  gate: string;
  target: Date; // The operative date (STD or ETD)
  isEtd: boolean; // True if using ETD
  acType: string;
  acCode: string; // C, E, F category
  checkinData: CheckinData[];
  
  // Computed for Gantt
  gStart?: Date;
  gEnd?: Date;
  conflict?: boolean;
  
  // Raw Data fields (for analytics)
  arrFlt?: string;
  depFlt?: string;
  arrSts?: string;
  depSts?: string;
  sta?: Date | null;
  ata?: Date | null;
  std?: Date | null;
  atd?: Date | null;
  arrPax?: number;
  depPax?: number;
  from?: string;
  to?: string;
  cap?: number;
  alCode?: string;
  date?: Date;
}

export interface AcDbEntry {
  [key: string]: number;
}

export type ViewMode = 'single' | 'comp-time' | 'comp-airline';

export const AC_CODE_MAP: Record<string, string> = {
  '32Q': 'C', '321': 'C', '32N': 'C', '320': 'C', '738': 'C', '7M8': 'C', 
  'AT7': 'C', '319': 'C', 'E90': 'C', '7M9': 'C', '739': 'C',
  '333': 'E', '789': 'E', '788': 'E', '772': 'E', '781': 'E', '339': 'E', 
  '359': 'E', '77W': 'E', '330': 'E', '332': 'E', '773': 'E',
  '763': 'D', '380': 'F', '747': 'F'
};

export const AIRLINE_MAP: Record<string, string> = {
  'VN':'Vietnam Airlines','VJ':'Vietjet Air','QH':'Bamboo Airways','VU':'Vietravel Airlines',
  'EK':'Emirates','KE':'Korean Air','SQ':'Singapore Airlines','BR':'Eva Air',
  'CI':'China Airlines','VZ':'Thai Vietjet'
};

export const AIRPORT_NAMES: Record<string, string> = {
  'HAN':'Nội Bài','SGN':'Tân Sơn Nhất','DAD':'Đà Nẵng','CXR':'Cam Ranh','PQC':'Phú Quốc',
  'ICN':'Seoul','PUS':'Busan','BKK':'Bangkok','SIN':'Singapore','TPE':'Taipei','HKG':'Hong Kong','NRT':'Narita'
};
