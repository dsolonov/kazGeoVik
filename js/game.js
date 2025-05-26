class Game {
    constructor() {
        this.locations = [];          // Массив координат всех локаций
        this.currentRound = 0;        // Текущий раунд (индекс в locations)
        this.roundStartTime = null;   // Время начала раунда
        this.roundDuration = 7 * 60;  // Длительность раунда в секундах (7 минут)
        this.score = 0;               // Общий счёт игрока
        this.guessTimes = {};         // Время угадывания для каждого раунда {roundIndex: time}
    }

    // Загрузка локаций из файла
    async loadLocations() {
        try {
            const response = await fetch(`locations.txt?nocache=${Date.now()}`);
            if (!response.ok) throw new Error('Не удалось загрузить локации');
            
            const text = await response.text();
            this.locations = text.trim().split('\n').map(line => {
                const [lat, lon] = line.split(',').map(coord => parseFloat(coord.trim()));
                return [lat, lon];
            });

            if (this.locations.length === 0) {
                throw new Error('Файл локаций пуст');
            }
        } catch (error) {
            console.error("Ошибка загрузки локаций:", error);
            throw error;
        }
    }

    // Начало нового раунда
    startRound() {
        if (this.currentRound >= this.locations.length) {
            return null; // Игра окончена
        }
        
        this.roundStartTime = Date.now();
        const coords = this.locations[this.currentRound];
        this.currentRound++;
        
        return coords;
    }

    // Расчёт расстояния между точками (в метрах)
    calculateDistance(playerCoords, panoramaCoords) {
        return ymaps.coordSystem.geo.getDistance(playerCoords, panoramaCoords);
    }

    // Подсчёт очков на основе расстояния
    calculateScore(distance) {
        if (distance < 1000) return 10;    // До 1 км = 10 очков
        if (distance < 5000) return 5;     // До 5 км = 5 очков
        if (distance < 20000) return 3;    // До 20 км = 3 очка
        return 0;                          // Далее - 0
    }

    // Обработка попытки угадать
    makeGuess(playerCoords, panoramaCoords) {
        const distance = this.calculateDistance(playerCoords, panoramaCoords);
        const roundScore = this.calculateScore(distance);
        const guessTime = (Date.now() - this.roundStartTime) / 1000;

        this.score += roundScore;
        this.guessTimes[this.currentRound - 1] = guessTime;

        return {
            distance,
            roundScore,
            guessTime
        };
    }

    // Получение общего времени игры (для финального результата)
    getTotalTime() {
        return Object.values(this.guessTimes).reduce((sum, time) => sum + time, 0);
    }
}
