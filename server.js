const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const https = require('https');

// Пакеты для авторизации
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = process.env.PORT || 10000;

// --- НАСТРОЙКИ ---
app.use(cors());
app.use(bodyParser.json());

// 1. ПОДКЛЮЧЕНИЕ К MONGODB
mongoose.connect(process.env.MONGODB_URI);

// 2. НАСТРОЙКА СЕССИЙ (Сохраняются в базу данных)
app.use(session({
    secret: process.env.SESSION_SECRET || 'main-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGODB_URI 
    }),
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 часа
}));

app.use(passport.initialize());
app.use(passport.session());

// --- МОДЕЛИ ДАННЫХ ---

// Новая модель пользователя
const User = mongoose.model('User', new mongoose.Schema({
    googleId: String,
    displayName: String,
    email: String,
    avatar: String,
    createdAt: { type: Date, default: Date.now }
}));

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

// --- НАСТРОЙКА PASSPORT (GOOGLE) ---

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        // Ищем пользователя в базе или создаем, если его нет
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                displayName: profile.displayName,
                email: profile.emails[0].value,
                avatar: profile.photos[0].value
            });
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});

// --- CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET
});

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

// --- ЭНДПОИНТЫ АВТОРИЗАЦИИ ---

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // После успешного входа отправляем на главную страницу (или в личный кабинет)
    res.redirect('/'); 
  });

app.get('/api/current_user', (req, res) => {
    res.send(req.user);
});

app.get('/auth/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// --- ОСТАЛЬНЫЕ ЭНДПОИНТЫ ---

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

app.get('/api/photos', async (req, res) => {
    const photos = await Photo.find().sort({ createdAt: -1 });
    res.json(photos);
});

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
