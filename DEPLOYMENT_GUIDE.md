
# Hướng dẫn Deploy Airport Ops Master với Supabase

Tài liệu này hướng dẫn bạn cách thiết lập Backend (Cơ sở dữ liệu) trên Supabase và đưa Frontend (Giao diện web) lên internet sử dụng Vercel.

---

## PHẦN 1: THIẾT LẬP SUPABASE (BACKEND)

### Bước 1: Tạo Project
1. Truy cập [https://supabase.com](https://supabase.com) và đăng nhập (Sign In).
2. Nhấn **"New Project"**.
3. Chọn Organization (nếu có).
4. Điền thông tin:
   - **Name**: `Airport Ops Master`
   - **Database Password**: (Tự đặt mật khẩu mạnh và GHI NHỚ NÓ).
   - **Region**: Chọn khu vực gần bạn nhất (ví dụ: Singapore).
5. Nhấn **"Create new project"** và đợi khoảng 1-2 phút để hệ thống khởi tạo.

### Bước 2: Tạo Bảng Dữ Liệu (Database Schema)
1. Trong Dashboard dự án, nhìn menu bên trái, chọn **SQL Editor** (biểu tượng `[_>_]`).
2. Nhấn **"New Query"**.
3. Copy toàn bộ đoạn code SQL dưới đây và dán vào khung soạn thảo:

```sql
-- 1. Tạo bảng flights (chuyến bay)
CREATE TABLE public.flights (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    flight_no TEXT NOT NULL,
    gate TEXT DEFAULT 'UNASSIGNED',
    target_time TIMESTAMP WITH TIME ZONE,
    is_etd BOOLEAN DEFAULT false,
    ac_type TEXT,
    ac_code TEXT,
    checkin_data JSONB DEFAULT '[]'::jsonb,
    arr_flt TEXT,
    dep_flt TEXT,
    arr_sts TEXT,
    dep_sts TEXT,
    arr_pax INTEGER DEFAULT 0,
    dep_pax INTEGER DEFAULT 0,
    cap INTEGER DEFAULT 180,
    al_code TEXT,
    "from" TEXT,
    "to" TEXT
);

-- 2. Bật tính năng Realtime (Cập nhật thời gian thực)
ALTER PUBLICATION supabase_realtime ADD TABLE public.flights;

-- 3. Tạo Policy bảo mật (Cho phép mọi người đọc/ghi - Mode Dev)
-- Lưu ý: Khi chạy thật cần chỉnh lại quyền cho chặt chẽ hơn
ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.flights
FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON public.flights
FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON public.flights
FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON public.flights
FOR DELETE USING (true);
```

4. Nhấn nút **RUN** (màu xanh lá cây) ở góc dưới bên phải để chạy lệnh. Nếu hiện "Success" là thành công.

### Bước 3: Lấy API Key
1. Vào **Project Settings** (biểu tượng bánh răng ⚙️ dưới cùng bên trái).
2. Chọn **API**.
3. Bạn sẽ thấy 2 thông số quan trọng:
   - **Project URL**: (Ví dụ: `https://xyz...supabase.co`)
   - **Project API keys (anon / public)**: (Chuỗi ký tự dài)

---

## PHẦN 2: CẤU HÌNH CODE FRONTEND

1. Mở file `supabaseConfig.ts` trong mã nguồn của bạn.
2. Thay thế nội dung bằng thông tin bạn vừa lấy ở Bước 3:

```typescript
export const SUPABASE_CONFIG = {
  url: "https://your-project-url.supabase.co", // Dán Project URL vào đây
  anonKey: "your-anon-key-here" // Dán Key Anon/Public vào đây
};
```
3. Lưu file lại.

---

## PHẦN 3: DEPLOY LÊN VERCEL (FRONTEND)

Chúng ta sẽ sử dụng Vercel để host trang web vì nó miễn phí và tối ưu cho React/Vite.

### Cách 1: Deploy từ GitHub (Khuyên dùng)
Nếu bạn đã đẩy code này lên GitHub:
1. Truy cập [https://vercel.com](https://vercel.com) và đăng ký tài khoản.
2. Nhấn **"Add New..."** -> **"Project"**.
3. Chọn **"Continue with GitHub"**.
4. Chọn repository (kho code) `Airport Ops Master` của bạn và nhấn **Import**.
5. Trong phần **Configure Project**:
   - Framework Preset: Chọn **Vite**.
   - Root Directory: Để mặc định (`./`).
6. Nhấn **Deploy**.
7. Đợi khoảng 1 phút, Vercel sẽ cung cấp cho bạn đường link (ví dụ: `airport-ops.vercel.app`).

### Cách 2: Deploy thủ công (Nếu không dùng Git)
1. Cài đặt Vercel CLI trên máy tính của bạn:
   ```bash
   npm i -g vercel
   ```
2. Mở terminal tại thư mục dự án và chạy lệnh:
   ```bash
   vercel
   ```
3. Làm theo hướng dẫn trên màn hình (nhấn Enter để chọn mặc định cho hầu hết các câu hỏi).
4. Vercel sẽ upload code và trả về đường link Production.

---

## PHẦN 4: KIỂM TRA & SỬ DỤNG

1. Truy cập vào đường link website vừa tạo.
2. Vào màn hình **Dispatch**.
3. Upload file Excel mẫu để test.
4. Khi upload xong, dữ liệu sẽ được đẩy lên Supabase.
5. **Test Realtime**: Mở ứng dụng trên 2 tab trình duyệt khác nhau (hoặc gửi link cho bạn bè). Khi bạn kéo thả máy bay ở tab này, tab kia sẽ tự động cập nhật vị trí ngay lập tức.

## Xử lý sự cố thường gặp

- **Lỗi không hiện dữ liệu:** Kiểm tra lại tab **Table Editor** trong Supabase xem bảng `flights` đã có dữ liệu chưa. Nếu chưa, hãy kiểm tra lại Console log trên trình duyệt (F12) xem có báo lỗi kết nối không.
- **Lỗi ngày giờ:** Hệ thống mặc định dùng UTC. Nếu giờ bị lệch, hãy đảm bảo tùy chọn "Excel Timezone Fix" khi upload được chọn hoặc bỏ chọn tùy theo file Excel của bạn.
