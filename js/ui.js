class UIManager {
    constructor() {
        // Устанавливаем базовый интерфейс для одного игрока
        this.initPlayerSetup();
        this.initEventListeners();
    }

    initPlayerSetup() {
        // Простая форма с именем и кнопкой "Начать"
        document.getElementById('playerSetup').innerHTML = `
            <div class="setup-content">
                <h1>Географическая игра</h1>
                <label for="playerName">Введите ваше имя:</label>
                <input type="text" id="playerName" placeholder="Ваше имя" maxlength="50">
                <button id="startButton">Начать игру</button>
            </div>
        `;
    }

    initEventListeners() {
        // Обработчик для кнопки "Начать"
        document.getElementById('startButton').addEventListener('click', () => {
            const name = document.getElementById('playerName').value.trim();
            if (name) {
                document.getElementById('playerSetup').style.display = 'none';
            }
        });
    }

    showResult(playerName, distance, roundScore, totalScore, guessTime) {
        const resultElement = document.getElementById('result');
        resultElement.innerHTML = `
            <strong>${playerName}</strong>, ваш результат:<br>
            Расстояние: <strong>${Math.round(distance)} м</strong><br>
            Очки за раунд: <strong>${roundScore}</strong><br>
            Общий счёт: <strong>${totalScore}</strong><br>
            Время: <strong>${guessTime.toFixed(1)} сек</strong>
        `;
        resultElement.style.display = 'block';
    }

    updateTimer(remainingTime) {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        document.getElementById('timer').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    showFinalResults(playerName, totalScore, totalTime) {
        const finalMessage = document.getElementById('finalMessage');
        finalMessage.innerHTML = `
            <h2>Игра завершена!</h2>
            <p>Игрок: <strong>${playerName}</strong></p>
            <p>Итоговый счёт: <strong>${totalScore} очков</strong></p>
            <p>Общее время: <strong>${totalTime.toFixed(1)} сек</strong></p>
            <button id="restartButton">Играть снова</button>
        `;
        finalMessage.style.display = 'block';

        // Добавляем обработчик для рестарта
        document.getElementById('restartButton').addEventListener('click', () => {
            location.reload(); // Перезагружаем страницу
        });
    }

    toggleElement(id, show) {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = show ? 'block' : 'none';
        }
    }
}
