const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const bcrypt = require('bcryptjs'); // Установите: npm install bcryptjs

const app = express();
const PORT = process.env.PORT || 10000;

const TG_TOKEN = process.env.TG_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

app.use(cors());
app.use(bodyParser.json());

// Файлы БД
const LOG_FILE = './logs.json';
const USER_FILE = './users.json';
const PROMO_FILE = './promocodes.json';

// Инициализация файлов, если их нет
[LOG_FILE, USER_FILE, PROMO_FILE].forEach(file => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify([]));
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function readData(file) {
    try {
        return JSON.parse(fs.readFileSync(file));
    } catch (e) { return []; }
}

function writeData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function sendToTelegram(message) {
    const data = JSON.stringify({ chat_id: TG_CHAT_ID, text: message, parse_mode: 'Markdown' });
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TG_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = https.request(options);
    req.write(data);
    req.end();
}

// --- НОВЫЕ ЭНДПОИНТЫ ---

// 1. Регистрация аккаунта
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    const users = readData(USER_FILE);

    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        email,
        password: hashedPassword,
        role: 'user', // user, admin
        isPremium: false,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeData(USER_FILE, users);

    sendToTelegram(`👤 *Новая регистрация*\nEmail: ${email}`);
    res.status(201).json({ message: 'Аккаунт создан' });
});

// 2. Активация промокода
app.post('/api/promo/activate', (req, res) => {
    const { email, code } = req.body;
    let users = readData(USER_FILE);
    let promos = readData(PROMO_FILE);

    const userIndex = users.findIndex(u => u.email === email);
    const promoIndex = promos.findIndex(p => p.code === code && !p.used);

    if (userIndex === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    if (promoIndex === -1) return res.status(400).json({ error: 'Неверный или использованный код' });

    const promo = promos[promoIndex];

    // Выдача привилегий
    if (promo.type === 'premium') users[userIndex].isPremium = true;
    if (promo.type === 'admin') users[userIndex].role = 'admin';

    // Помечаем промокод как использованный (или удаляем)
    promos[promoIndex].used = true;
    promos[promoIndex].usedBy = email;

    writeData(USER_FILE, users);
    writeData(PROMO_FILE, promos);

    sendToTelegram(`🎁 *Промокод активирован!*\nЮзер: ${email}\nТип: ${promo.type}`);
    res.json({ message: `Активировано: ${promo.type}`, role: users[userIndex].role, isPremium: users[userIndex].isPremium });
});

// 3. (Для админа) Создание промокода (Временная ручка)
app.post('/api/admin/create-promo', (req, res) => {
    // В реальном проекте тут нужна проверка токена админа
    const { code, type } = req.body; // type: 'premium' или 'admin'
    let promos = readData(PROMO_FILE);
    promos.push({ code, type, used: false });
    writeData(PROMO_FILE, promos);
    res.json({ message: 'Промокод создан' });
});

// --- ВАШИ СТАРЫЕ ЭНДПОИНТЫ ---

app.post('/api/log', (req, res) => {
    const { email, status, ip, device } = req.body;
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });

    let logs = readData(LOG_FILE);
    logs.push({ email, status, ip, device, time });
    writeData(LOG_FILE, logs);

    const emoji = status === 'success' ? '✅' : '🚫';
    sendToTelegram(`${emoji} *ACCESS LOG*\n*Email:* ${email}\n*Status:* ${status.toUpperCase()}`);

    res.status(200).json({ message: 'Log saved' });
});

app.get('/api/logs', (req, res) => res.json(readData(LOG_FILE)));
app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
