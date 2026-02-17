const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

// --- НАСТРОЙКИ РОЛЕЙ ---
// Ты можешь добавлять сюда новых пользователей вручную
const USER_ROLES = {
    "krekw@mail.ua": "admin",
    "vladvoloshin2009@gmail.com": "premium"
};

// --- НАСТРОЙКИ ТЕЛЕГРАМ ---
const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

app.use(cors());
app.use(bodyParser.json());

const LOG_FILE = './logs.json';

function sendToTelegram(message) {
    const data = JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TG_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        res.on('data', (d) => { process.stdout.write(d); });
    });

    req.on('error', (error) => { console.error('TG Error:', error); });
    req.write(data);
    req.end();
}

// НОВЫЙ ЭНДПОИНТ: Получение роли пользователя
app.post('/api/get-role', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const role = USER_ROLES[email] || "user";
    res.json({ email, role });
});

// Эндпоинт для логов (обновлен: теперь пишет роль в телеграм)
app.post('/api/log', (req, res) => {
    const { email, status, ip, device } = req.body;
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
    
    // Определяем роль для лога
    const role = USER_ROLES[email] || "user";

    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
        try {
            logs = JSON.parse(fs.readFileSync(LOG_FILE));
        } catch(e) { logs = []; }
    }
    logs.push({ email, status, role, ip, device, time });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    const emoji = status === 'success' ? '✅' : '🚫';
    const roleEmoji = role === 'admin' ? '👑' : (role === 'premium' ? '💎' : '👤');
    
    const msg = `${emoji} *ACCESS LOG*\n\n` +
                `*Email:* ${email}\n` +
                `*Status:* ${status.toUpperCase()}\n` +
                `*Role:* ${role.toUpperCase()} ${roleEmoji}\n` +
                `*IP:* ${ip}\n` +
                `*Device:* ${device}\n` +
                `*Time:* ${time}`;
    
    sendToTelegram(msg);
    res.status(200).json({ message: 'Log saved' });
});

app.get('/api/logs', (req, res) => {
    if (fs.existsSync(LOG_FILE)) {
        const data = fs.readFileSync(LOG_FILE);
        res.json(JSON.parse(data));
    } else {
        res.json([]);
    }
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
