# Voltify MVP

Web MVP của **Voltify**: cảnh báo sớm rủi ro cháy nổ pin xe máy điện, hiện ngay trong app mà tài xế đang dùng. Voltify là sản phẩm **B2B**: đối tác (hãng xe, đơn vị giao hàng, mạng lưới trạm đổi pin) gửi telemetry pin qua **API**, Voltify chạy AI rồi gửi **webhook** để app của đối tác báo cho tài xế. Web này mô phỏng đúng trải nghiệm đó để đi thuyết phục đơn vị đội xe đầu tiên chạy pilot.

> *English, in one line:* a monorepo with the Voltify partner API (Fastify), the AI engine reused from the PoC, and a React web app showing a simulated driver app with Voltify inside and a fleet-manager console. All data is simulated until a pilot fleet shares real telemetry.

**Khác với PoC:** PoC ([voltify-poc](https://github.com/drake987-ai/voltify-poc)) chứng minh AI hoạt động, với rất nhiều số liệu. MVP trả lời câu hỏi khác: *khi đưa ra thị trường thì hiển thị gì, báo cho ai, bằng lời nào*. Tài xế chỉ thấy % pin, số km và 4 trạng thái bằng lời; quản lý đội xe thấy sự cố kèm lý do và có nút xử lý.

## Ba màn hình

| Màn | Đường dẫn | Dành cho | Nội dung |
|---|---|---|---|
| App tài xế | `#/driver` | Tài xế (qua app đối tác) | Điện thoại mô phỏng một app giao hàng có thẻ "Pin xe" của Voltify; thông báo đẩy "Pin cần được kiểm tra" kèm trạm đổi pin gần nhất; màn hình đỏ toàn phần "Dừng xe ngay"; hộp thư thông báo. Bên phải: bảng điều khiển demo (gây sự cố, làm pin gần hết), "phía sau Voltify tính gì", nguyên tắc hiển thị, và webhook JSON đã gửi. |
| Trung tâm điều hành | `#/console` | Quản lý đội xe | Bản đồ 40 xe ở TP.HCM theo mức rủi ro, 8 KPI, hàng đợi sự cố (nặng nhất trước, có lý do, trạng thái đã báo tài xế / tài xế đã xác nhận), nút Tiếp nhận / Gọi tài xế / Đóng kèm nhãn "cảnh báo đúng" hoặc "báo nhầm", bảng xe có lọc, chi tiết từng xe (biểu đồ 1 giờ, lý do, diễn biến sự cố). |
| Tích hợp API | `#/integration` | Lập trình viên của đối tác | Danh sách endpoint, luồng sự kiện webhook trực tiếp, đoạn code gửi telemetry và kiểm tra chữ ký; chuyển trang sang dùng máy chủ API thật. |

Trang `#/` (Tổng quan) có sơ đồ luồng tích hợp và **kịch bản demo 3 phút**.

## Chạy nhanh

Cần Node.js 22.12 trở lên và npm.

```bash
npm install
npm run dev          # web tại http://127.0.0.1:5173 (tự mô phỏng trong trình duyệt, không cần máy chủ)
```

Chạy cả máy chủ API (để demo đúng cách đối tác tích hợp):

```bash
npm run dev:api      # API tại http://localhost:8787, khóa mặc định "demo-key"
npm run dev          # rồi mở http://127.0.0.1:5173/?api=http://localhost:8787&key=demo-key
```

| Lệnh | Việc làm |
|---|---|
| `npm run dev` | web, chế độ phát triển |
| `npm run dev:api` | API, tự khởi động lại khi sửa code |
| `npm test` | toàn bộ test (lõi dùng chung + API) |
| `npm run build` | kiểm tra kiểu cả 3 gói, build web ra `web/dist/` |
| `npm run receiver -w api` | máy chủ mẫu của đối tác nhận webhook (xem đầu file `api/examples/partner-receiver.ts`) |

## Kiến trúc

```
                     (mô phỏng, thay bằng xe thật khi có pilot)
 Pin + BMS ──► máy chủ hãng xe ──► POST /v1/telemetry ──►┌──────────── Voltify (api/) ───────────┐
 (3 định dạng hãng)                                       │ adapter → AI engine → luật sự cố      │
                                                          │ → thông báo tài xế (vi/en) → sự kiện  │
                                                          └──────┬──────────────────┬────────────┘
                                                     webhook ký HMAC          REST + SSE
                                                                 ▼                  ▼
                                                   app của đối tác → tài xế   console quản lý (web/)
```

Repo là **npm workspaces** gồm 3 gói, cùng viết bằng TypeScript:

```
shared/   @voltify/shared: dùng chung cho API và web
  src/sim/        bộ mô phỏng pin có cơ sở vật lý (lấy nguyên từ PoC)
  src/adapters/   chuẩn hóa 3 định dạng hãng về một schema (từ PoC)
  src/ai/         AI engine 4 module + Risk Score + giải thích (từ PoC)
  src/platform/   MỚI: luật mở sự cố, thông báo tài xế, nội dung 2 ngôn ngữ, sự kiện webhook, KPI
  src/world/      MỚI: 40 xe, tài xế (hư cấu) phản ứng theo thông báo, trạm đổi pin, đổi pin
  src/runtime/    MỚI: nối world với platform và chạy theo đồng hồ (dùng ở cả Web Worker và API)
  tests/          test của PoC (vật lý, AI, adapter) + test mới của platform
api/      @voltify/api: Fastify + Zod, xác thực bằng API key, SSE, webhook có chữ ký và thử lại
web/      @voltify/web: React + Vite + Tailwind, i18next (vi/en), Leaflet, Zustand
```

**Hai chế độ chạy của web.** Mặc định toàn bộ mô phỏng và nền tảng Voltify chạy trong **Web Worker** của trình duyệt, nên web là site tĩnh (GitHub Pages, Vercel) và demo được ở bất kỳ đâu. Khi có máy chủ API, web dùng đúng các endpoint mà đối tác sẽ dùng (REST + Server-Sent Events): thêm `?api=<url>&key=<khóa>` vào địa chỉ, hoặc nhập ở trang Tích hợp API.

**Ranh giới quan trọng.** `shared/src/platform` (phần chạy trên máy chủ Voltify thật) chỉ nhận gói tin của hãng, thông tin đổi pin và thao tác của tài xế/quản lý, đúng như khi triển khai thật. Nó không đọc trạng thái ẩn của bộ mô phỏng và không gửi lệnh điều khiển xe: MVP chỉ **giám sát và cảnh báo**.

### Luật cảnh báo (trong `shared/src/platform/hub.ts`)

| Mức AI (Risk Score) | Tài xế thấy | Cách báo |
|---|---|---|
| An toàn (0 đến 24) | Bình thường | không gửi gì |
| Theo dõi (25 đến 49) | Cần chú ý | chỉ đổi dòng trạng thái, không làm phiền |
| Cảnh báo (50 đến 74) | Cần kiểm tra | mở sự cố + thông báo đẩy + trạm đổi pin gần nhất |
| Nguy hiểm (75 đến 100) | Dừng xe ngay | màn hình khẩn cấp + báo đội vận hành |

Mỗi loại thông báo chỉ gửi một lần cho mỗi sự cố. Sự cố tự đóng khi đối tác báo đã đổi pin; quản lý có thể đóng và gắn nhãn (nhãn dùng để đo Precision thật khi pilot). Ngoài ra: nhắc pin yếu dưới 20%, và đánh dấu pin chai cần thay.

## API

Mô tả đầy đủ theo OpenAPI 3.1: `GET /v1/openapi.json` (mở được bằng Swagger UI, Postman, Insomnia). Xác thực bằng header `x-api-key`.

| Method | Đường dẫn | Việc làm |
|---|---|---|
| POST | `/v1/telemetry` | gửi 1 gói hoặc `{ "messages": [...] }`; tự nhận diện định dạng hãng; báo lỗi từng gói |
| POST | `/v1/vehicles` | đăng ký xe, tài xế, pin đang lắp |
| GET | `/v1/vehicles`, `/v1/vehicles/{id}` | danh sách xe, chi tiết một xe |
| GET | `/v1/vehicles/{id}/driver-view` | trạng thái rút gọn cho app tài xế |
| PUT | `/v1/vehicles/{id}/pack` | báo đã đổi pin |
| GET | `/v1/incidents?status=active` | sự cố, nặng nhất trước |
| POST | `/v1/incidents/{id}/acknowledge` \| `/call` \| `/resolve` | thao tác của quản lý |
| POST | `/v1/notifications/{id}/ack` | app báo tài xế đã bấm vào thông báo |
| POST/GET/DELETE | `/v1/webhooks`, `/v1/webhooks/{id}/deliveries` | đăng ký webhook, xem nhật ký gửi |
| GET | `/v1/stream?key=...` | luồng snapshot trực tiếp (Server-Sent Events) |
| POST | `/v1/demo/commands` | chỉ để demo: điều khiển bộ mô phỏng |

Webhook gửi kèm header `Voltify-Signature: t=<unix>,v1=<HMAC-SHA256 của "<t>.<body>">`; gửi lỗi sẽ thử lại sau 1, 5 và 20 giây. Sự kiện: `incident.opened`, `incident.escalated`, `incident.updated`, `incident.resolved`, `driver.notification`, `vehicle.pack_changed`, `battery.maintenance_due`. Sự kiện `driver.notification` có sẵn `title`/`body` tiếng Việt và tiếng Anh, và `delivery` (`in_app`, `push`, `critical`) để app đối tác chọn cách hiển thị.

Biến môi trường của API: `PORT` (8787), `HOST` (0.0.0.0), `VOLTIFY_API_KEY` (demo-key), `VOLTIFY_SIMULATOR` (on; `off` để chỉ nhận dữ liệu thật), `VOLTIFY_VEHICLES` (40), `VOLTIFY_SPEED` (20), `VOLTIFY_DEMO` (on), `CORS_ORIGIN`.

## Triển khai

- **Web (site tĩnh):** `npm run build`, thư mục `web/dist/`. Workflow `.github/workflows/ci.yml` chạy test và build ở mọi lần push; push lên `main` thì đăng lên GitHub Pages (một lần: Settings > Pages > Source: GitHub Actions). Vercel/Netlify: build command `npm run build`, output `web/dist`.
- **API:** cần một máy chủ Node.js (Render, Fly.io, Railway hoặc VPS nhỏ): `npm ci && npm run start:api`.

## Nói rõ để giữ uy tín

- Mọi dữ liệu là **mô phỏng** (40 xe, tài xế và biển số hư cấu). Nhóm chưa có đơn vị đội xe nào chia sẻ dữ liệu thật.
- AI là bản của PoC: Recall 91,9%, Precision 65,8%, lead time trung bình 19,3 phút trên dữ liệu mô phỏng; mục tiêu 30 đến 45 phút chưa đạt.
- Quãng đường còn lại là ước tính (giả định 22 Wh/km). Thời gian phản ứng của tài xế và thời gian đổi pin là giả định của bộ mô phỏng (`shared/src/world/world.ts`).
- Voltify hỗ trợ cảnh báo sớm, **không thay thế BMS** và không điều khiển xe.
- Chưa có trong MVP này (theo kế hoạch MVP): cơ sở dữ liệu (dữ liệu đang nằm trong bộ nhớ, mất khi khởi động lại), đăng nhập cho quản lý, nhiều đối tác tách dữ liệu, gửi qua Zalo/Telegram/email, báo cáo tuần.

Xem thêm [docs/TECH_STACK.md](docs/TECH_STACK.md) (tóm tắt công nghệ để đưa vào slide).
