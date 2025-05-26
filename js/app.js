class App {
    constructor() {
        this.mapManager = new MapManager();
        this.game = new Game();
        this.ui = new UIManager();
        
        this.currentPlayerName = ""; // Имя единственного игрока
        this.timerInterval = null;   // Для контроля таймера

        this.init();
    }

    async init() {
        await this.mapManager.init();
        this.setupGameStart();
    }

    // Настройка начала игры (ввод имени)
    setupGameStart() {
        document.getElementById('startButton').addEventListener('click', async () => {
            this.currentPlayerName = document.getElementById('playerName').value.trim();
            if (!this.currentPlayerName) return;

            document.getElementById('playerSetup').style.display = 'none';
            
            try {
                await this.game.loadLocations();
                this.startGame();
            } catch (error) {
                console.error('Ошибка загрузки локаций:', error);
                alert("Не удалось загрузить локации. Пожалуйста, перезагрузите страницу.");
            }
        });
    }

    // Запуск основной игры
    startGame() {
        this.setupRoundControls();
        this.startRound();
    }

    // Настройка кнопок раунда
    setupRoundControls() {
        document.getElementById('guessButton').addEventListener('click', () => this.handleGuess());
        document.getElementById('nextRoundButton').addEventListener('click', () => this.startRound());
    }

    // Запуск нового раунда
    async startRound() {
        // Сброс интерфейса
        this.ui.toggleElement('nextRoundButton', false);
        this.ui.toggleElement('guessButton', false);
        document.getElementById('result').textContent = '';
        this.mapManager.clearMarkers();

        // Остановка предыдущего таймера
        if (this.timerInterval) clearInterval(this.timerInterval);

        // Получение координат для нового раунда
        const coords = this.game.startRound();
        if (!coords) {
            // Игра окончена - показываем итоги
            const totalTime = Object.values(this.game.guessTimes).reduce((sum, time) => sum + time, 0);
            this.ui.showFinalResults(this.currentPlayerName, this.game.score, totalTime);
            return;
        }

        // Загрузка панорамы
        try {
            const panoramaLoaded = await this.mapManager.loadPanorama(coords);
            if (panoramaLoaded) {
                this.ui.toggleElement('guessButton', true);
                this.startTimer();
            } else {
                console.error("Панорама не найдена, пропускаем раунд.");
                this.startRound(); // Пропуск раунда при ошибке
            }
        } catch (error) {
            console.error('Ошибка загрузки панорамы:', error);
            this.startRound(); // Пропуск раунда
        }
    }

    // Таймер раунда
    startTimer() {
        this.game.roundStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.game.roundStartTime) / 1000);
            const remaining = Math.max(0, this.game.roundDuration - elapsed);
            this.ui.updateTimer(remaining);

            if (remaining <= 0) {
                clearInterval(this.timerInterval);
                this.handleTimeUp();
            }
        }, 1000);
    }

    // Обработка окончания времени раунда
    handleTimeUp() {
        this.game.guessTimes[this.game.currentRound - 1] = this.game.roundDuration; // Фиксируем время
        this.ui.toggleElement('nextRoundButton', true);
        this.ui.toggleElement('guessButton', false);
    }

    // Обработка попытки угадать
    handleGuess() {
        if (!this.mapManager.playerMarker) return;

        const playerCoords = this.mapManager.playerMarker.geometry.getCoordinates();
        const panoramaCoords = this.game.locations[this.game.currentRound - 1];
        
        const result = this.game.makeGuess(playerCoords, panoramaCoords);
        if (result) {
            // Фиксируем результат
            this.game.guessTimes[this.game.currentRound - 1] = result.guessTime;
            
            // Показываем результат на карте и в UI
            this.mapManager.showResult(panoramaCoords, playerCoords);
            this.ui.showResult(
                this.currentPlayerName,
                result.distance,
                result.roundScore,
                this.game.score,
                result.guessTime
            );
            
            // Активируем кнопку следующего раунда
            this.ui.toggleElement('nextRoundButton', true);
            this.ui.toggleElement('guessButton', false);
        }
    }
}

// Запуск приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
