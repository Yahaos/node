const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 10000;

// --- НАСТРОЙКИ ---
app.use(cors());
app.use(bodyParser.json());

// Подключение к MongoDB (Возьми строку в MongoDB Atlas)
mongoose.connect(process.env.MONGO_URI);

// Настройка Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET
});

// --- МОДЕЛИ ДАННЫХ ---
const Photo = mongoose.model('Photo', new mongoose.Schema({
    title: String,
    url: String,
    public_id: String,
    createdAt: { type: Date, default: Date.now }
}));

const Log = mongoose.model('Log', new mongoose.Schema({
    email: String,
    status: String,
    ip: String,
    device: String,
    time: String
}));

// Настройка хранилища фото
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'visual_archive' }
});
const upload = multer({ storage: storage });

// --- ТЕЛЕГРАМ ---
function sendToTelegram(message) {
    const data = JSON.stringify({ chat_id: process.env.TG_CHAT_ID, text: message, parse_mode: 'Markdown' });
    const options = {
        hostname: 'api.telegram.org', port: 443,
        path: `/bot${process.env.TG_TOKEN}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = https.request(options);
    req.write(data);
    req.end();
}

// --- ЭНДПОИНТЫ ---

// Загрузка фото
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        const newPhoto = new Photo({
            title: req.body.title || 'Untitled',
            url: req.file.path,
            public_id: req.file.filename
        });
        await newPhoto.save();
        res.json(newPhoto);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Получение фото
app.get('/api/photos', async (req, res) => {
    const photos = await Photo.find().sort({ createdAt: -1 });
    res.json(photos);
});

// Логи
app.post('/api/log', async (req, res) => {
    const { email, status, ip, device } = req.body;
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
    
    const newLog = new Log({ email, status, ip, device, time });
    await newLog.save();

    const emoji = status === 'success' ? '✅' : '🚫';
    sendToTelegram(`${emoji} *ACCESS*\n*Email:* ${email}\n*IP:* ${ip}`);
    res.status(200).json({ message: 'Saved' });
});

app.get('/api/logs', async (req, res) => {
    const logs = await Log.find().sort({ _id: -1 }).limit(100);
    res.json(logs);
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on ${PORT}`));
