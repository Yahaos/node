const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000; // Render использует этот порт

// --- НАСТРОЙКИ ТЕЛЕГРАМ (ВСТАВЬ СВОИ ДАННЫЕ ТУТ) ---
const TG_TOKEN = "8547079220:AAEfwHPs8V7hIEOll2ET0MJEnU1z_Wp_t1A";
const TG_CHAT_ID = "911686484";

app.use(cors());
app.use(bodyParser.json());

const LOG_FILE = './logs.json';

// Функция отправки в Telegram
async function sendToTelegram(message) {
    try {
        // Динамический импорт fetch (так как Render использует новую версию Node)
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        
        await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TG_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('Ошибка отправки в Telegram:', e);
    }
}

// Эндпоинт для логов
app.post('/api/log', async (req, res) => {
    const { email, status, ip, device } = req.body;
    const time = new Date().toLocaleString();

    // 1. Сохраняем локально (на сервере)
    let logs = [];
    if (fs.existsSync(LOG_FILE)) {
        try {
            logs = JSON.parse(fs.readFileSync(LOG_FILE));
        } catch(e) { logs = []; }
    }
    logs.push({ email, status, ip, device, time });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    // 2. Отправляем уведомление
    const emoji = status === 'success' ? '✅' : '🚫';
    const msg = `${emoji} *ACCESS LOG*\n\n*Email:* ${email}\n*Status:* ${status.toUpperCase()}\n*IP:* ${ip}\n*Device:* ${device}\n*Time:* ${time}`;
    
    await sendToTelegram(msg);

    res.status(200).json({ message: 'Log saved and sent' });
});

// Эндпоинт для админки
app.get('/api/logs', (req, res) => {
    if (fs.existsSync(LOG_FILE)) {
        const data = fs.readFileSync(LOG_FILE);
        res.json(JSON.parse(data));
    } else {
        res.json([]);
    }
});

// Проверка работоспособности (для пробуждения)
app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
