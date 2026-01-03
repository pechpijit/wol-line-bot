const https = require('https');
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs').promises;
const fsSync = require('fs');
const wol = require('wol');
const ping = require('ping');

// ============================================
// CONFIGURATION
// ============================================

const DATA_FILE = 'data.json';
const ICON_URL = 'https://cdn-icons-png.flaticon.com/512/2933/2933245.png';

const https_options = {
    cert: fsSync.readFileSync("cer/cc-developer_ddns_net.crt"),
    key: fsSync.readFileSync("cer/cc-developer_ddns_net.key"),
    ca: fsSync.readFileSync("cer/CARootCertificate-ca.crt")
};

const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

// ============================================
// UTILITIES
// ============================================

/**
 * Validate MAC address format
 * @param {string} mac - MAC address to validate
 * @returns {boolean} - true if valid
 */
function isValidMAC(mac) {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
}

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} - true if valid
 */
function isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
}

/**
 * Format MAC address to standard format (xx:xx:xx:xx:xx:xx)
 * @param {string} mac - MAC address to format
 * @returns {string} - formatted MAC address
 */
function formatMAC(mac) {
    return mac.toLowerCase().replace(/-/g, ':');
}

/**
 * Read user data from JSON file
 * @returns {Promise<Array>} - array of users
 */
async function readUserData() {
    try {
        const content = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') {
            // File doesn't exist, create empty array
            await fs.writeFile(DATA_FILE, '[]');
            return [];
        }
        console.error('[ERROR] Failed to read data file:', err.message);
        throw err;
    }
}

/**
 * Write user data to JSON file
 * @param {Array} data - array of users
 */
async function writeUserData(data) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('[ERROR] Failed to write data file:', err.message);
        throw err;
    }
}

/**
 * Find user by userId
 * @param {string} userId - LINE user ID
 * @returns {Promise<Object|null>} - user object or null
 */
async function findUser(userId) {
    const users = await readUserData();
    return users.find(user => user.userId === userId) || null;
}

/**
 * Register or update user MAC address
 * @param {string} userId - LINE user ID
 * @param {string} mac - MAC address
 */
async function registerUser(userId, mac) {
    const users = await readUserData();
    const index = users.findIndex(user => user.userId === userId);
    
    if (index !== -1) {
        users[index].MAC = mac;
        users[index].updatedAt = new Date().toISOString();
    } else {
        users.push({
            userId: userId,
            MAC: mac,
            IP: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }
    
    await writeUserData(users);
}

/**
 * Update user IP address
 * @param {string} userId - LINE user ID
 * @param {string} ip - IP address
 * @returns {Promise<boolean>} - true if user exists and updated
 */
async function updateUserIP(userId, ip) {
    const users = await readUserData();
    const index = users.findIndex(user => user.userId === userId);
    
    if (index === -1) {
        return false;
    }
    
    users[index].IP = ip;
    users[index].updatedAt = new Date().toISOString();
    await writeUserData(users);
    return true;
}

/**
 * Wake up computer using WoL
 * @param {string} mac - MAC address
 * @returns {Promise<boolean>} - true if successful
 */
function wakeComputer(mac) {
    return new Promise((resolve) => {
        wol.wake(mac, (err, res) => {
            if (err) {
                console.error('[ERROR] WoL failed:', err.message);
                resolve(false);
            } else {
                resolve(res);
            }
        });
    });
}

/**
 * Ping a host to check if it's online
 * @param {string} host - hostname or IP address
 * @returns {Promise<{alive: boolean, time: number|null}>}
 */
async function pingHost(host) {
    try {
        const result = await ping.promise.probe(host, {
            timeout: 5,
        });
        return {
            alive: result.alive,
            time: result.time !== 'unknown' ? result.time : null
        };
    } catch (err) {
        console.error('[ERROR] Ping failed:', err.message);
        return { alive: false, time: null };
    }
}

// ============================================
// EXPRESS APP
// ============================================

const app = express();
const client = new line.Client(config);

app.post('/webhook', line.middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error('[ERROR] Webhook error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// EVENT HANDLER
// ============================================

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return null;
    }

    const eventText = event.message.text.toLowerCase().trim();
    const userId = event.source.userId;

    console.log(`[INFO] Received message: "${eventText}" from user: ${userId.substring(0, 10)}...`);

    try {
        // Command: poweron
        if (eventText === 'poweron') {
            return await handlePowerOn(event, userId);
        }
        
        // Command: status
        if (eventText === 'status') {
            return await handleStatus(event, userId);
        }
        
        // Command: help
        if (eventText === 'help' || eventText === '?') {
            return await handleHelp(event);
        }
        
        // Command: register MAC (starts with #)
        if (eventText.startsWith('#')) {
            return await handleRegisterMAC(event, userId, eventText);
        }

        // Command: register IP (starts with @)
        if (eventText.startsWith('@')) {
            return await handleRegisterIP(event, userId, eventText);
        }

        // Unknown command - don't reply to avoid spam
        return null;
        
    } catch (err) {
        console.error('[ERROR] Event handling failed:', err.message);
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
        });
    }
}

// ============================================
// COMMAND HANDLERS
// ============================================

async function handlePowerOn(event, userId) {
    const user = await findUser(userId);
    
    if (!user) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ คุณยังไม่ได้ลงทะเบียน\n\nพิมพ์ #MAC-ADDRESS เพื่อลงทะเบียน\nตัวอย่าง: #00:11:22:33:44:55'
        });
    }
    
    console.log(`[INFO] Sending WoL to MAC: ${user.MAC}`);
    const success = await wakeComputer(user.MAC);
    const status = success ? '✅ สำเร็จ' : '❌ ไม่สำเร็จ';
    
    return client.replyMessage(event.replyToken, makeMessage('สั่งเปิดเครื่อง', status));
}

async function handleStatus(event, userId) {
    const user = await findUser(userId);
    
    if (!user) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ คุณยังไม่ได้ลงทะเบียน\n\nพิมพ์ #MAC-ADDRESS เพื่อลงทะเบียน\nตัวอย่าง: #00:11:22:33:44:55'
        });
    }
    
    if (!user.IP) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ คุณยังไม่ได้ลงทะเบียน IP\n\nพิมพ์ @IP-ADDRESS เพื่อลงทะเบียน\nตัวอย่าง: @192.168.1.100'
        });
    }
    
    console.log(`[INFO] Pinging IP: ${user.IP}`);
    const pingResult = await pingHost(user.IP);
    
    const status = pingResult.alive ? '🟢 ออนไลน์' : '🔴 ออฟไลน์';
    const note = pingResult.alive 
        ? `Ping: ${pingResult.time}ms` 
        : 'ไม่สามารถเชื่อมต่อได้';
    
    return client.replyMessage(event.replyToken, makeStatusMessage(user.MAC, user.IP, status, note));
}

async function handleHelp(event) {
    const helpMessage = {
        type: 'text',
        text: `📖 วิธีใช้งาน Wake-on-LAN Bot

━━━━━━━━━━━━━━━━━━━━
📝 ขั้นตอนการลงทะเบียน
━━━━━━━━━━━━━━━━━━━━
1️⃣ ลงทะเบียน MAC Address
   พิมพ์: #00:11:22:33:44:55

2️⃣ ลงทะเบียน IP Address  
   พิมพ์: @192.168.1.100

━━━━━━━━━━━━━━━━━━━━
⚡ คำสั่งที่ใช้ได้
━━━━━━━━━━━━━━━━━━━━
🔹 poweron - สั่งเปิดเครื่อง
🔹 status - ตรวจสอบสถานะเครื่อง
🔹 help หรือ ? - แสดงวิธีใช้งาน

━━━━━━━━━━━━━━━━━━━━
💡 หมายเหตุ
━━━━━━━━━━━━━━━━━━━━
• ต้องลงทะเบียน MAC ก่อน IP
• MAC ดูได้จาก ipconfig /all
• IP คือ IP ของเครื่องที่ต้องการเปิด`
    };
    
    return client.replyMessage(event.replyToken, helpMessage);
}

async function handleRegisterMAC(event, userId, eventText) {
    const mac = eventText.substring(1).trim();
    
    if (!isValidMAC(mac)) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ รูปแบบ MAC Address ไม่ถูกต้อง\n\nตัวอย่างที่ถูกต้อง:\n#00:11:22:33:44:55\n#00-11-22-33-44-55'
        });
    }
    
    const formattedMAC = formatMAC(mac);
    await registerUser(userId, formattedMAC);
    
    console.log(`[INFO] User ${userId.substring(0, 10)}... registered MAC: ${formattedMAC}`);
    
    return client.replyMessage(event.replyToken, makeMessageRegisterMAC(formattedMAC));
}

async function handleRegisterIP(event, userId, eventText) {
    const ip = eventText.substring(1).trim();
    
    if (!isValidIP(ip)) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ รูปแบบ IP Address ไม่ถูกต้อง\n\nตัวอย่างที่ถูกต้อง:\n@192.168.1.100\n@10.0.0.1'
        });
    }
    
    const updated = await updateUserIP(userId, ip);
    
    if (!updated) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: '❌ กรุณาลงทะเบียน MAC Address ก่อน\n\nพิมพ์ #MAC-ADDRESS\nตัวอย่าง: #00:11:22:33:44:55'
        });
    }
    
    console.log(`[INFO] User ${userId.substring(0, 10)}... registered IP: ${ip}`);
    
    return client.replyMessage(event.replyToken, makeMessageRegisterIP(ip));
}

// ============================================
// FLEX MESSAGE BUILDERS
// ============================================

function makeMessageRegisterMAC(mac) {
    return {
        "type": "flex",
        "altText": "ลงทะเบียน MAC สำเร็จ",
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "icon",
                                "url": ICON_URL
                            },
                            {
                                "type": "text",
                                "text": "✅ ลงทะเบียน MAC สำเร็จ",
                                "weight": "bold",
                                "size": "md",
                                "margin": "md",
                                "color": "#1DB446"
                            }
                        ]
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "margin": "lg",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "MAC :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": mac,
                                        "wrap": true,
                                        "color": "#666666",
                                        "size": "sm",
                                        "flex": 2
                                    }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "ขั้นตอนถัดไป :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": "พิมพ์ @IP เพื่อลงทะเบียน IP",
                                        "wrap": true,
                                        "color": "#1DB446",
                                        "size": "sm",
                                        "flex": 2
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            "footer": {
                "type": "box",
                "layout": "horizontal",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "button",
                        "style": "secondary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "❓ Help",
                            "text": "help"
                        }
                    },
                    {
                        "type": "button",
                        "style": "primary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "⚡ เปิดเครื่อง",
                            "text": "poweron"
                        }
                    }
                ],
                "flex": 0
            }
        }
    };
}

function makeMessageRegisterIP(ip) {
    return {
        "type": "flex",
        "altText": "ลงทะเบียน IP สำเร็จ",
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "icon",
                                "url": ICON_URL
                            },
                            {
                                "type": "text",
                                "text": "✅ ลงทะเบียน IP สำเร็จ",
                                "weight": "bold",
                                "size": "md",
                                "margin": "md",
                                "color": "#1DB446"
                            }
                        ]
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "margin": "lg",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "IP :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": ip,
                                        "wrap": true,
                                        "color": "#666666",
                                        "size": "sm",
                                        "flex": 2
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            "footer": {
                "type": "box",
                "layout": "horizontal",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "button",
                        "style": "secondary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "📊 ตรวจสอบ",
                            "text": "status"
                        }
                    },
                    {
                        "type": "button",
                        "style": "primary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "⚡ เปิดเครื่อง",
                            "text": "poweron"
                        }
                    }
                ],
                "flex": 0
            }
        }
    };
}

function makeMessage(command, status) {
    const isSuccess = status.includes('สำเร็จ') && !status.includes('ไม่');
    const statusColor = isSuccess ? '#1DB446' : '#DD0000';
    
    return {
        "type": "flex",
        "altText": `${command}: ${status}`,
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "icon",
                                "url": ICON_URL
                            },
                            {
                                "type": "text",
                                "text": "รายละเอียด",
                                "weight": "bold",
                                "size": "md",
                                "margin": "md"
                            }
                        ]
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "margin": "lg",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "Command :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": command,
                                        "wrap": true,
                                        "color": "#666666",
                                        "size": "sm",
                                        "flex": 2
                                    }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "Status :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": status,
                                        "wrap": true,
                                        "color": statusColor,
                                        "size": "sm",
                                        "flex": 2,
                                        "weight": "bold"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            "footer": {
                "type": "box",
                "layout": "horizontal",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "button",
                        "style": "secondary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "📊 ตรวจสอบ",
                            "text": "status"
                        }
                    },
                    {
                        "type": "button",
                        "style": "primary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "⚡ เปิดเครื่อง",
                            "text": "poweron"
                        }
                    }
                ],
                "flex": 0
            }
        }
    };
}

function makeStatusMessage(mac, ip, status, note) {
    const isOnline = status.includes('ออนไลน์');
    const statusColor = isOnline ? '#1DB446' : '#DD0000';
    
    return {
        "type": "flex",
        "altText": `สถานะเครื่อง: ${status}`,
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "box",
                        "layout": "baseline",
                        "contents": [
                            {
                                "type": "icon",
                                "url": ICON_URL
                            },
                            {
                                "type": "text",
                                "text": "📊 สถานะเครื่อง",
                                "weight": "bold",
                                "size": "md",
                                "margin": "md"
                            }
                        ]
                    },
                    {
                        "type": "box",
                        "layout": "vertical",
                        "margin": "lg",
                        "spacing": "sm",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "MAC :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": mac,
                                        "wrap": true,
                                        "color": "#666666",
                                        "size": "sm",
                                        "flex": 2
                                    }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "IP :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": ip,
                                        "wrap": true,
                                        "color": "#666666",
                                        "size": "sm",
                                        "flex": 2
                                    }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "Status :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": status,
                                        "wrap": true,
                                        "color": statusColor,
                                        "size": "sm",
                                        "flex": 2,
                                        "weight": "bold"
                                    }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "baseline",
                                "spacing": "sm",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "Note :",
                                        "color": "#aaaaaa",
                                        "size": "sm",
                                        "flex": 1
                                    },
                                    {
                                        "type": "text",
                                        "text": note,
                                        "wrap": true,
                                        "color": "#888888",
                                        "size": "xs",
                                        "flex": 2
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            "footer": {
                "type": "box",
                "layout": "horizontal",
                "spacing": "sm",
                "contents": [
                    {
                        "type": "button",
                        "style": "secondary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "🔄 รีเฟรช",
                            "text": "status"
                        }
                    },
                    {
                        "type": "button",
                        "style": "primary",
                        "height": "sm",
                        "action": {
                            "type": "message",
                            "label": "⚡ เปิดเครื่อง",
                            "text": "poweron"
                        }
                    }
                ],
                "flex": 0
            }
        }
    };
}

// ============================================
// SERVER STARTUP
// ============================================

const server = https.createServer(https_options, app);

server.listen(process.env.PORT, function () {
    console.log('============================================');
    console.log('  WoL LINE Bot Server Started');
    console.log('============================================');
    console.log(`  Port: ${server.address().port}`);
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('============================================');
});