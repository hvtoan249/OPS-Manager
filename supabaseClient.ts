
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from './supabaseConfig';

// Sử dụng cấu hình từ file supabaseConfig.ts
// Điều này giúp tránh lỗi khi không tạo được file .env
const supabaseUrl = SUPABASE_CONFIG.url;
const supabaseAnonKey = SUPABASE_CONFIG.anonKey;

// Kiểm tra xem người dùng đã nhập key chưa (để cảnh báo lỗi rõ ràng hơn)
if (supabaseUrl === "https://your-project.supabase.co" || supabaseAnonKey === "your-anon-key-here") {
  console.warn("CẢNH BÁO: Bạn chưa cấu hình Supabase URL và Key trong file 'supabaseConfig.ts'. Ứng dụng Cloud sẽ không hoạt động.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
