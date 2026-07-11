# Judge Service — Online Judge Sandbox

Một REST API Node.js chấm bài lập trình trực tuyến (Online Judge). Nhận source code + test case, biên dịch, chạy trong sandbox có giới hạn tài nguyên, so sánh output, trả verdict.

Thiết kế để deploy trên **Pterodactyl / Pelican hosting** (Node.js egg) — không yêu cầu Docker, root access, hay bất kỳ system package nào ngoài những gì image đã cung cấp sẵn.

---

## Kiến trúc

```
judge-service/
  index.js                  # Entry point, đọc PORT từ env, khởi động Express
  routes/judge.js           # POST /judge, GET /health
  core/
    languages.js            # Config ngôn ngữ, detect compiler khi khởi động
    sandbox.js              # Chạy process con với ulimit + timeout + env rỗng
    compiler.js             # Biên dịch source code
    checker.js              # So sánh output (diff / custom checker)
  test/test-judge.js        # Script test tự động
  .env.example              # Mẫu biến môi trường
  package.json
```

## Ngôn ngữ hỗ trợ

| Ngôn ngữ | Compiler/Runtime | Lệnh biên dịch |
|-----------|-----------------|-----------------|
| C++ | `g++` | `g++ -O2 -std=c++17 -o solution solution.cpp` |
| C | `gcc` | `gcc -O2 -o solution solution.c` |
| Python | `python3` | *(interpreted — không biên dịch)* |
| Pascal | `fpc` | `fpc -O2 -osolution solution.pas` |

Service tự detect compiler khả dụng khi khởi động. Nếu thiếu compiler nào, ngôn ngữ đó bị vô hiệu hóa (trả 400 khi request) nhưng service **không crash**.

---

## Deploy lên Pterodactyl / Pelican

### 1. Upload code

SFTP vào server, upload toàn bộ thư mục `judge-service/` vào thư mục gốc của container.

### 2. Cài dependencies

Trong **Console** của panel, chạy:

```bash
cd judge-service && npm install
```

### 3. Cấu hình khởi động

Trong tab **Startup** (Khởi động) của panel:

| Biến | Giá trị |
|------|---------|
| `MAIN_FILE` | `judge-service/index.js` |
| `PORT` | *(để hosting tự inject)* |

### 4. Cấu hình `.env` (tuỳ chọn)

Tạo file `.env` trong thư mục `judge-service/` (hoặc cấu hình qua panel):

```env
# API key bảo vệ endpoint /judge (khuyến nghị đặt!)
JUDGE_API_KEY=your-secret-key-here

# Số job chạy song song tối đa (mặc định 3)
JUDGE_MAX_CONCURRENT=2
```

### 5. Khởi động

Restart server từ panel. Kiểm tra log khởi động:

```
[INIT] Judge Service starting …
[INIT]   cpp      → ✓ available
[INIT]   c        → ✓ available
[INIT]   python   → ✓ available
[INIT]   pascal   → ✗ not found
[INIT] Compiler check: cpp=OK, c=OK, python=OK, pascal=NOT FOUND
[INIT] Judge Service listening on port 8080
```

---

## API Reference

### `GET /health`

Kiểm tra trạng thái service và compiler khả dụng.

```bash
curl http://your-server:PORT/health
```

Response:
```json
{
  "status": "ok",
  "languages": { "cpp": true, "c": true, "python": true, "pascal": false },
  "active_jobs": 0,
  "max_concurrent": 3
}
```

### `POST /judge`

Chấm bài. Gửi source code + test case, nhận verdict.

```bash
curl -X POST http://your-server:PORT/judge \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key-here" \
  -d '{
    "language": "cpp",
    "source_code": "#include <iostream>\nusing namespace std;\nint main() { int a,b; cin>>a>>b; cout<<a+b<<endl; }",
    "time_limit_ms": 2000,
    "memory_limit_mb": 256,
    "test_cases": [
      { "input": "1 2\n", "expected_output": "3\n" },
      { "input": "10 20\n", "expected_output": "30\n" }
    ]
  }'
```

Response:
```json
{
  "verdict": "AC",
  "compile_output": "",
  "test_results": [
    { "test_index": 0, "verdict": "AC", "time_ms": 15, "memory_kb": 3200, "stdout": "3\n", "stderr": "" },
    { "test_index": 1, "verdict": "AC", "time_ms": 12, "memory_kb": 3100, "stdout": "30\n", "stderr": "" }
  ]
}
```

#### Request body

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `language` | `"cpp" \| "c" \| "python" \| "pascal"` | ✓ | Ngôn ngữ lập trình |
| `source_code` | `string` | ✓ | Mã nguồn (plain text hoặc base64) |
| `time_limit_ms` | `number` | | Giới hạn thời gian mỗi test (ms). Mặc định 1000 |
| `memory_limit_mb` | `number` | | Giới hạn bộ nhớ (MB). Mặc định 256 |
| `test_cases` | `array` | ✓ | Mảng `{ input, expected_output }` |
| `checker_type` | `"diff" \| "custom"` | | Loại checker. Mặc định `"diff"` |
| `custom_checker_code` | `string` | | Source C++ của custom checker (bắt buộc khi `checker_type="custom"`) |
| `run_all_tests` | `boolean` | | `true` = chạy hết test, `false` = dừng khi gặp lỗi đầu tiên |

#### Verdicts

| Verdict | Ý nghĩa |
|---------|---------|
| `AC` | Accepted — tất cả test đúng |
| `WA` | Wrong Answer — output sai |
| `TLE` | Time Limit Exceeded — quá thời gian |
| `MLE` | Memory Limit Exceeded — quá bộ nhớ |
| `RE` | Runtime Error — lỗi runtime / exit code ≠ 0 |
| `CE` | Compilation Error — lỗi biên dịch |
| `SYSTEM_ERROR` | Lỗi hệ thống judge |

---

## Xác thực API

Nếu biến `JUDGE_API_KEY` được đặt trong `.env`, mọi request tới `/judge` phải kèm header:

```
x-api-key: your-secret-key-here
```

hoặc:

```
Authorization: Bearer your-secret-key-here
```

Endpoint `/health` **không yêu cầu** xác thực (để monitoring tools truy cập được).

---

## ⚠️ Giới hạn bảo mật của Sandbox

> **QUAN TRỌNG**: Sandbox này **KHÔNG** tương đương với Docker/isolate/chroot về mức độ cô lập. Đây là giải pháp "best-effort" cho môi trường hosting không có quyền root.

### Những gì sandbox LÀM ĐƯỢC:

- ✅ **Giới hạn thời gian**: `timeout` từ Node.js + `ulimit -t` (CPU time) — chặn vòng lặp vô hạn.
- ✅ **Giới hạn bộ nhớ**: `ulimit -v` — chặn cấp phát RAM quá mức.
- ✅ **Chặn fork bomb**: `ulimit -u` — giới hạn số process con.
- ✅ **Cô lập biến môi trường**: `env: {}` — code thí sinh **không thể** đọc API key, database URL, hay bất kỳ secret nào của judge.
- ✅ **Giới hạn output**: `maxBuffer` — chặn thí sinh in vô hạn làm tràn RAM judge.
- ✅ **Workspace riêng biệt**: Mỗi submission chạy trong thư mục UUID riêng, xóa sau khi chấm.
- ✅ **Concurrency limit**: Giới hạn số job chạy đồng thời, tránh quá tải.

### Những gì sandbox KHÔNG LÀM ĐƯỢC:

- ❌ **Không cô lập filesystem**: Code thí sinh có thể đọc file trên container (nhưng không có secret trong env). Trên Pterodactyl, container đã bị giới hạn sẵn nên rủi ro thấp hơn VPS thường.
- ❌ **Không cô lập network**: Code thí sinh có thể mở socket, gọi HTTP. Nếu cần chặn, phải cấu hình firewall ở tầng Pterodactyl/hosting.
- ❌ **Không chroot/namespace**: Không tạo filesystem ảo riêng cho mỗi submission.
- ❌ **Đo memory không chính xác 100%**: Dùng polling `/proc/<pid>/status` mỗi 50ms — có thể miss spike ngắn hơn.

### Khuyến nghị:

1. **Luôn đặt `JUDGE_API_KEY`** để chỉ backend OJ mới gọi được endpoint chấm bài.
2. Nếu hosting cho phép, cấu hình **firewall rule** chặn outbound traffic từ container.
3. Đây là giải pháp phù hợp cho **OJ quy mô nhỏ - trung bình** (trường học, CLB). Với OJ quy mô lớn hoặc yêu cầu bảo mật cao, nên dùng VPS + Docker + isolate.

---

## Chạy test cục bộ

```bash
# Terminal 1 — khởi động server
cd judge-service
npm install
npm start

# Terminal 2 — chạy test
npm test
```

## License

MIT
