# Judge Service v2 — Smart Cross-Platform Online Judge Sandbox

Một REST API Node.js dùng để chấm bài lập trình trực tuyến (Online Judge). Nhận source code + test case, biên dịch, chạy trong sandbox có giới hạn tài nguyên, so sánh output, trả verdict.

Phiên bản **v2.0 (Smart Cross-Platform)** được thiết kế để tự động nhận diện và hoạt động trơn tru trên cả 3 hệ điều hành: **Linux (Production)**, **macOS**, và **Windows**.

---

## 🚀 Tính năng nổi bật ở phiên bản v2.0

1. **Cross-Platform Auto-Detection**:
   - **Linux**: Hoạt động 100% công suất với `ulimit` (bảo vệ RAM, CPU, PID) và polling `/proc` (đo RAM cực chuẩn). Phù hợp cho VPS / Pterodactyl.
   - **macOS & Windows**: Tự động lược bỏ các cờ cấu hình hệ thống không tương thích (như `ulimit -v`), cho phép Dev chạy máy chấm trực tiếp trên máy tính cá nhân mà không cần dùng Docker hay Máy ảo Linux.
2. **Short-Circuit WA (Tối ưu tài nguyên)**:
   - Thêm cờ `run_all_tests` (mặc định `false`). Ngay khi thí sinh sai ở 1 Test Case, máy chấm lập tức ngưng chạy các test còn lại và trả về WA. Giúp tiết kiệm đến 95% CPU cho máy chủ khi thí sinh nộp bài sai quá nhiều.
3. **Custom Checker C++ (Base64 Encode)**:
   - Hỗ trợ truyền mã nguồn C++ của `testlib.h` qua cổng `custom_checker_code` bằng chuẩn mã hoá Base64. Giúp khắc phục hoàn toàn lỗi rớt mạng hoặc ký tự đặc biệt khi ghép API.
   - Biên dịch Checker 1 lần duy nhất, tái sử dụng cho N Test Cases.

---

## 🛠 Kiến trúc

```
judge-service/
  index.js                  # Entry point, đọc PORT từ env, khởi động Express
  routes/judge.js           # POST /judge, GET /health
  core/
    languages.js            # Config ngôn ngữ, detect compiler chéo hệ điều hành
    sandbox.js              # Sandbox thông minh: nhận diện Linux/macOS/Windows
    compiler.js             # Biên dịch source code
    checker.js              # So sánh output (diff / custom checker)
  download-gcc.js           # Script tải GCC (Tự động bỏ qua nếu không phải Linux)
  package.json
```

## 💻 Ngôn ngữ hỗ trợ

| Ngôn ngữ | Compiler/Runtime | Lệnh biên dịch |
|-----------|-----------------|-----------------|
| C++ | `g++` | `g++ -O2 -std=c++17 -o solution solution.cpp` |
| C | `gcc` | `gcc -O2 -o solution solution.c` |
| Python | `python3` | *(interpreted — không biên dịch)* |
| Pascal | `fpc` | `fpc -O2 -osolution solution.pas` |

*Lưu ý: Service tự động tìm Compiler trên máy tính của bạn khi khởi động. Không có Compiler thì ngôn ngữ đó bị vô hiệu hoá, nhưng Service không bị crash.*

---

## 🌐 API Reference

### `GET /health`
Kiểm tra trạng thái Service và sức chịu tải.
```json
{
  "status": "ok",
  "languages": { "cpp": true, "c": true, "python": true, "pascal": false },
  "active_jobs": 0,
  "max_concurrent": 8
}
```

### `POST /judge`
```json
{
  "language": "cpp",
  "source_code": "#include <iostream>\nusing namespace std;\nint main() { cout << \"OK\"; }",
  "time_limit_ms": 2000,
  "memory_limit_mb": 256,
  "test_cases": [
    { "input": "", "expected_output": "OK" }
  ],
  "run_all_tests": false
}
```

#### Các trường Payload mở rộng:
- `source_code`: Code nộp của thí sinh (Hỗ trợ Text thường HOẶC Base64).
- `run_all_tests`: `true` = Chạy toàn bộ test kể cả khi sai. `false` = Dừng ngay lập tức ở test sai đầu tiên.
- `checker_type`: `"diff"` (So sánh text thuần túy) hoặc `"custom"` (Dùng C++ Checker).
- `custom_checker_code`: (Chỉ dành cho `"custom"`). Code C++ của checker, bắt buộc mã hóa Base64 nếu có chứa file Header `testlib.h`.

---

## ⚠️ Giới hạn bảo mật của Sandbox
**Sandbox này được thiết kế theo hướng Best-Effort (Chạy trên môi trường Node.js trần).**
1. **Linux**: Bắt được MLE, TLE, Fork Bomb, Memory Leak rất hiệu quả thông qua `ulimit` và `/proc`.
2. **macOS / Windows**: (Môi trường Dev) Máy chấm sẽ chấm đúng kết quả AC, WA, CE, RE. Tuy nhiên các lỗi MLE và TLE sẽ không được đo đạc chính xác tuyệt đối do giới hạn phần cứng của hệ điều hành.

👉 **Mời bạn xem file `DEPLOY.md` để biết cách cài đặt trên từng hệ điều hành!**
