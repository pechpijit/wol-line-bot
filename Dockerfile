# ใช้ Node.js official image เป็น base image
FROM node:18-alpine

# ตั้งค่า environment เป็น production
ENV NODE_ENV=production

# ตั้งค่า working directory ใน container
WORKDIR /app

# คัดลอก package.json และ package-lock.json (ถ้ามี)
COPY package*.json ./

# ติดตั้ง dependencies (production only)
RUN npm ci --omit=dev

# คัดลอกโค้ดโปรเจกต์ทั้งหมด
COPY . .

# กำหนดให้ container รันคำสั่งนี้เมื่อเริ่มต้น
CMD ["npm", "start"]