const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
// Для node-fetch в новых версиях Node используй динамический импорт или библиотеку axios
// Но для начала оставим так, как в package.json

const app = express();

// ВАЖНО: Порт должен браться из переменной окружения
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Твои маршруты (app.post, app.get и т.д.)

// ВАЖНО: Слушаем PORT, а не жесткое число 3000
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
