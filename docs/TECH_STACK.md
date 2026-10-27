# Voltify MVP: tech stack (bản dùng cho slide)

## Một câu

Toàn bộ viết bằng **TypeScript**, một repo **npm workspaces** gồm 3 gói: `shared` (AI engine + logic nền tảng), `api` (Node.js + Fastify) và `web` (React + Vite). AI của PoC được dùng lại nguyên vẹn ở cả máy chủ và trình duyệt.

## Bảng công nghệ

| Lớp | Công nghệ (phiên bản) | Dùng để làm gì |
|---|---|---|
| Ngôn ngữ | TypeScript 7 (strict) | Một ngôn ngữ cho web, API và AI; một kiểu dữ liệu dùng chung, sửa một chỗ là trình biên dịch báo mọi chỗ còn lại |
| Giao diện web | React 19, Vite 8 | App tài xế mô phỏng, trung tâm điều hành, trang tích hợp |
| Định dạng giao diện | Tailwind CSS 4, giao diện sáng/tối | Màu rủi ro luôn đi kèm biểu tượng và chữ |
| Bản đồ | Leaflet 1.9 + OpenStreetMap | Vị trí 40 xe theo mức rủi ro, trạm đổi pin |
| Đa ngôn ngữ | i18next 26 (tiếng Việt, tiếng Anh) | Mọi màn hình và mọi thông báo gửi tài xế có 2 ngôn ngữ |
| Quản lý trạng thái | Zustand 5 | Một store chung cho cả 3 màn hình |
| Chạy nền trong trình duyệt | Web Worker | Mô phỏng + AI chạy riêng luồng nên giao diện mượt; web là site tĩnh, demo không cần máy chủ |
| Backend API | Node.js 22+, Fastify 5 | REST API cho đối tác (xe, telemetry, sự cố, thông báo, webhook) |
| Kiểm tra dữ liệu vào | Zod 4 | Từ chối gói tin sai, trả lỗi 400 kèm danh sách lỗi |
| Cập nhật trực tiếp | Server-Sent Events (SSE) | Đẩy dữ liệu sống tới dashboard, đơn giản hơn WebSocket |
| Webhook | HTTP POST + chữ ký HMAC-SHA256, thử lại 3 lần | Báo sự cố và thông báo tài xế cho app đối tác |
| Bảo mật API | API key (header `x-api-key`) | Mỗi đối tác một khóa |
| Mô tả API | OpenAPI 3.1 | Lập trình viên đối tác tự đọc, mở bằng Swagger/Postman |
| AI engine | 4 module (nhiệt, điện áp, quá tải, SOH) + Risk Score + giải thích (từ PoC) | Chấm điểm rủi ro 0 đến 100 và nói lý do |
| Mô phỏng | Mô hình mạch tương đương pin, nhiệt, lão hóa (từ PoC) + 40 xe, tài xế, trạm đổi pin | Sinh dữ liệu thay cho đội xe thật |
| Kiểm thử | Vitest 5 (170 test) | Vật lý, AI, adapter (từ PoC) + luật cảnh báo, API, chữ ký webhook (mới) |
| CI/CD | GitHub Actions + GitHub Pages | Mỗi lần push: test, build; nhánh main tự đăng web |

## Kiến trúc (vẽ lại trên slide)

```
Pin + BMS → máy chủ hãng xe → [ Voltify API: adapter → AI → luật sự cố → thông báo ] → webhook → app đối tác → tài xế
                                                     └──────── SSE ────────→ trung tâm điều hành (quản lý đội xe)
```

## Điểm nhấn kỹ thuật để nói khi thuyết trình

1. **API-first, B2B:** sản phẩm chính là API + webhook; tài xế không cài app mới, thông báo hiện trong app của đối tác.
2. **Voltify viết sẵn lời nhắn:** webhook mang sẵn tiêu đề và nội dung tiếng Việt, tiếng Anh, kèm mức hiển thị (trong app, đẩy, khẩn cấp). Đối tác không cần hiểu AI.
3. **Chống báo động giả làm phiền:** mức "Theo dõi" không gửi thông báo; mỗi loại cảnh báo chỉ gửi một lần cho mỗi sự cố.
4. **Đo được giả thuyết của MVP:** console ghi thời gian từ cảnh báo đến lúc quản lý tiếp nhận (F5) và nhãn "cảnh báo đúng / báo nhầm" của quản lý (F6, để tính Precision thật khi pilot).
5. **Một mã AI chạy hai nơi:** cùng code chạy trong trình duyệt (demo offline) và trên máy chủ (tích hợp thật).
6. **Webhook an toàn:** có chữ ký HMAC để đối tác kiểm tra nguồn gửi, tự thử lại khi máy chủ đối tác lỗi.

## Bước tiếp theo (chưa có trong MVP này)

| Hạng mục | Công nghệ dự kiến (theo kế hoạch MVP) |
|---|---|
| Lưu trữ chuỗi thời gian | PostgreSQL + TimescaleDB (hiện dữ liệu nằm trong bộ nhớ) |
| Đăng nhập quản lý | Auth.js hoặc Supabase Auth |
| Kênh cảnh báo thêm | Telegram Bot API / Zalo OA, email qua Resend |
| Đóng gói, triển khai backend | Docker Compose; Render / Fly.io hoặc VPS nhỏ |
| Dữ liệu thật | ESP32 + cảm biến trên 2 đến 3 xe của nhóm, rồi đội xe pilot |
