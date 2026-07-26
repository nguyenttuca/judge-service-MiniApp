# Hướng dẫn Deploy Judge Service (v2.0 Smart Cross-Platform)

Phiên bản Judge Service mới nhất đã được nâng cấp để hoạt động trơn tru trên mọi hệ điều hành. Dưới đây là hướng dẫn triển khai cho từng môi trường:

---

## 🐧 1. Môi trường Linux (Khuyên dùng cho Production / VPS / Pterodactyl)

Trên Linux, Judge Service có thể bung 100% sức mạnh bảo mật (giới hạn bộ nhớ, CPU, fork bomb) thông qua lệnh `ulimit` và đọc RAM trực tiếp từ kernel (`/proc`).

### Cách 1: Pterodactyl / Pelican Panel
1. Tải file `judge-service-cross-platform.zip` lên thư mục gốc của server (File Manager).
2. Giải nén (Unarchive).
3. Vào tab **Console**, gõ lệnh:
   ```bash
   npm install
   ```
   *(Hệ thống sẽ tự động tải bộ biên dịch GCC Portable 135MB của Linux về thư mục `gcc-toolchain`)*.
4. Ở tab **Startup**:
   - `MAIN_FILE`: `index.js`
   - `PORT`: (Để hệ thống tự cấp)
5. Nhấn **Start** để khởi động.

### Cách 2: VPS Linux Ubuntu/CentOS (Chạy trần)
1. Yêu cầu: Đã cài đặt `Node.js` (>= v18).
2. Upload source code lên VPS.
3. Mở Terminal:
   ```bash
   cd judge-service
   npm install
   # Cài đặt trình quản lý process PM2 để chạy nền
   npm install -g pm2
   pm2 start index.js --name "judge-service"
   ```

---

## 🍎 2. Môi trường macOS (Môi trường Dev cục bộ)

Trên macOS, Service sẽ tự động bỏ qua tính năng tải GCC của Linux và bỏ qua đo RAM bằng `/proc`. Bạn phải tự cài đặt Compiler trên máy Mac của mình.

### Các bước:
1. Giải nén Source Code.
2. Cài đặt các Compiler (Nếu chưa có):
   - Mở Terminal, gõ `xcode-select --install` để cài đặt **g++** và **gcc**.
   - Cài đặt Python 3: `brew install python` (Yêu cầu Homebrew).
3. Cài đặt Dependencies:
   ```bash
   npm install
   ```
   *(Sẽ hiện thông báo: "Hệ điều hành không phải Linux. Bỏ qua tải GCC Portable").*
4. Khởi động Service:
   ```bash
   node index.js
   ```

---

## 🪟 3. Môi trường Windows (Môi trường Dev cục bộ)

Trên Windows, Sandbox sẽ tự động bỏ qua toàn bộ câu lệnh `/bin/bash` và `ulimit`. Service vẫn chạy, vẫn chấm bài ra kết quả chuẩn (AC, WA, CE), nhưng sẽ không khắt khe về giới hạn RAM/CPU được như Linux.

### Các bước:
1. Cài đặt `Node.js` cho Windows.
2. Cài đặt Compiler (Bắt buộc):
   - **C/C++**: Cài đặt MinGW hoặc MSYS2, đảm bảo thêm đường dẫn `g++.exe` vào biến môi trường **PATH**.
   - **Python**: Cài đặt Python 3 từ Microsoft Store hoặc trang chủ, nhớ tick vào ô "Add Python to PATH".
3. Mở **Command Prompt (CMD)** hoặc **PowerShell**, trỏ vào thư mục code:
   ```cmd
   cd C:\Đường_dẫn_tới\judge-service
   npm install
   ```
4. Khởi động Service:
   ```cmd
   node index.js
   ```
   *(Bạn sẽ thấy Log báo các Compiler đã sẵn sàng `✓ available` nếu bạn đã Add to PATH thành công).*

---

## 🔑 Biến môi trường tuỳ chọn (.env)

Tạo file `.env` ở cùng thư mục với `index.js`:

```env
# Mật khẩu bảo mật API (Bắt buộc thêm header x-api-key khi gọi API)
JUDGE_API_KEY=my_super_secret_key

# Số luồng chạy bài thi cùng lúc (Mặc định tự động lấy số core của CPU)
JUDGE_MAX_CONCURRENT=4
```
