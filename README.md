# 🖥️ WoL LINE Bot

<p align="center">
  <img src="https://cdn-icons-png.flaticon.com/512/2933/2933245.png" width="120" alt="WoL Bot Icon">
</p>

<p align="center">
  <b>LINE Bot สำหรับสั่งเปิดเครื่องคอมพิวเตอร์ระยะไกลผ่าน Wake-on-LAN (WoL)</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/Docker-Ready-blue?logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/LINE-Messaging%20API-00C300?logo=line" alt="LINE">
  <img src="https://img.shields.io/badge/License-ISC-yellow" alt="License">
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| ⚡ **Power On** | สั่งเปิดเครื่องผ่าน Wake-on-LAN |
| 📊 **Status Check** | ตรวจสอบสถานะเครื่อง (Online/Offline) ด้วย Ping |
| 📝 **Register MAC** | ลงทะเบียน MAC Address ของเครื่องที่ต้องการเปิด |
| 🌐 **Register IP** | ลงทะเบียน IP Address สำหรับตรวจสอบสถานะ |
| ❓ **Help** | แสดงวิธีใช้งานและคำสั่งทั้งหมด |
| 👥 **Multi-User** | รองรับหลาย user แยกข้อมูลกัน |

---

## 📋 Commands

| Command | Description | Example |
|---------|-------------|---------|
| `#MAC` | ลงทะเบียน MAC Address | `#00:11:22:33:44:55` |
| `@IP` | ลงทะเบียน IP Address | `@192.168.1.100` |
| `poweron` | สั่งเปิดเครื่อง | - |
| `status` | ตรวจสอบสถานะเครื่อง | - |
| `help` หรือ `?` | แสดงวิธีใช้งาน | - |

---

## 📸 Screenshots

<details>
<summary>ดูตัวอย่างการใช้งาน</summary>

### ลงทะเบียน MAC Address
```
User: #b4:2e:99:1c:e0:f6
Bot:  ✅ ลงทะเบียน MAC สำเร็จ
```

### ลงทะเบียน IP Address
```
User: @192.168.1.33
Bot:  ✅ ลงทะเบียน IP สำเร็จ
```

### ตรวจสอบสถานะ
```
User: status
Bot:  📊 สถานะเครื่อง
      MAC: b4:2e:99:1c:e0:f6
      IP: 192.168.1.33
      Status: 🟢 ออนไลน์
      Ping: 1.2ms
```

### สั่งเปิดเครื่อง
```
User: poweron
Bot:  ✅ สั่งเปิดเครื่อง: สำเร็จ
```

</details>

---

## 🚀 Quick Start

### 📋 Prerequisites

- [Node.js](https://nodejs.org/) 18+ หรือ [Docker](https://www.docker.com/)
- [LINE Messaging API Channel](https://developers.line.biz/console/)
- SSL Certificate (สำหรับ LINE Webhook)
- เครื่องคอมพิวเตอร์ที่รองรับ Wake-on-LAN

### 1️⃣ Clone Repository

```bash
git clone https://github.com/pechpijit/wol-line-bot.git
cd wol-line-bot
```

### 2️⃣ Setup Environment

```bash
cp .env.example .env
cp data.json.example data.json
```

แก้ไขไฟล์ `.env`:
```env
PORT=3000
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_CHANNEL_SECRET=your_channel_secret
```

### 3️⃣ Setup SSL Certificates

สร้างโฟลเดอร์ `cer/` และใส่ไฟล์ certificate:
```
cer/
├── your_domain.crt      # SSL Certificate
├── your_domain.key      # Private Key
└── ca.crt               # CA Certificate (ถ้ามี)
```

> 💡 สามารถใช้ [Let's Encrypt](https://letsencrypt.org/) สำหรับ SSL ฟรี

### 4️⃣ Run with Docker (แนะนำ)

```bash
docker-compose up -d --build
```

> ⚠️ **สำคัญ:** ใช้ `network_mode: host` เพื่อให้ WoL และ Ping ทำงานได้ใน LAN

### 5️⃣ Run Locally (Alternative)

```bash
npm install
npm start
```

### 6️⃣ Setup LINE Webhook

1. ไปที่ [LINE Developers Console](https://developers.line.biz/console/)
2. เลือก Channel ของคุณ
3. ตั้ง Webhook URL: `https://your-domain.com/webhook`
4. เปิด "Use webhook"

---

## 📁 Project Structure

```
wol-line-bot/
├── 📄 index.js           # Main server & bot logic
├── 📄 data.json          # User data storage
├── 📄 package.json       # Dependencies
├── 📄 docker-compose.yml # Docker configuration
├── 📄 Dockerfile         # Docker build instructions
├── 📄 .env.example       # Environment template
├── 📄 .env               # Environment variables (gitignored)
├── 📄 .gitignore         # Git ignore rules
├── 📄 .dockerignore      # Docker ignore rules
├── 📁 cer/               # SSL certificates (gitignored)
└── 📁 images/            # Static images
```

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | ✅ |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot access token | ✅ |
| `LINE_CHANNEL_SECRET` | LINE Bot channel secret | ✅ |

### Docker Compose

```yaml
services:
  wol-bot:
    build: .
    network_mode: host  # สำคัญสำหรับ WoL และ Ping
    env_file:
      - .env
    volumes:
      - ./data.json:/app/data.json
      - ./cer:/app/cer:ro
```

---

## 🔧 Wake-on-LAN Setup

### เปิดใช้งาน WoL บนเครื่องเป้าหมาย

1. **BIOS/UEFI:** เปิด "Wake on LAN" หรือ "Power On by PCI-E"
2. **Windows:**
   - Device Manager → Network Adapter → Properties
   - Power Management → ✅ Allow this device to wake the computer
   - Advanced → Wake on Magic Packet → Enabled

### เปิด Ping บน Windows 11

Windows 11 ปิด ICMP ping โดย default รันคำสั่งนี้ใน **Command Prompt (Admin)**:

```cmd
netsh advfirewall firewall add rule name="Allow ICMPv4" protocol=icmpv4:8,any dir=in action=allow
```

### หา MAC Address

**Windows:**
```cmd
ipconfig /all
```

**macOS/Linux:**
```bash
ifconfig
# หรือ
ip link show
```

---

## 🐳 Docker Commands

```bash
# Build และ Run
docker-compose up -d --build

# ดู Logs
docker-compose logs -f

# Rebuild ใหม่ทั้งหมด (ไม่ใช้ cache)
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# หยุด Container
docker-compose down
```

---

## 📝 Data Storage

ข้อมูล user ถูกเก็บใน `data.json`:

```json
[
  {
    "userId": "U1234567890abcdef...",
    "MAC": "00:11:22:33:44:55",
    "IP": "192.168.1.100",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

## 🔒 Security Notes

- ⚠️ **อย่า commit `.env` file** - มี credentials สำคัญ
- ⚠️ **อย่า commit `cer/` folder** - มี SSL private key
- ✅ ใช้ `.gitignore` ป้องกันไฟล์สำคัญ
- ✅ ใช้ HTTPS สำหรับ webhook

---

## 🛠️ Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **LINE SDK:** @line/bot-sdk
- **Wake-on-LAN:** wol
- **Ping:** ping
- **Container:** Docker + Docker Compose

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the ISC License.

---

## � Related Projects

| Project | Description |
|---------|-------------|
| [copilot_agent_template](https://github.com/pechpijit/copilot_agent_template) | Template สำหรับสร้าง AI Persona ใช้กับ GitHub Copilot |

---

## �👨‍💻 Authors

**pechpijit** - [GitHub](https://github.com/pechpijit)

**Sakura (GitHub Copilot)** - AI Assistant ที่ช่วย refactor, เพิ่มฟีเจอร์ และเขียน documentation 🤖💜

---

## ⭐ Support

ถ้าชอบโปรเจคนี้ กด ⭐ Star ให้หน่อยนะครับ!

