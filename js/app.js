class App {
    constructor() {
        this.mapManager = new MapManager();
        this.game = new Game();
        this.ui = new UIManager();
        
        this.init();
    }

    async init() {
        await this.mapManager.init();
        this.setupGameStart();
    }

    setupGameStart() {
        document.getElementById('startButton').addEventListener('click', async () => {
            const playerName = document.getElementById('playerName').value.trim();
            if (!playerName) return;
            
            this.game.addPlayer(playerName);
            document.getElementById('playerSetup').style.display = 'none';
            
            try {
                await this.game.loadLocations();
                this.startGame();
            } catch (error) {
                console.error('Ошибка загрузки локаций:', error);
            }
        });
    }

    startGame() {
        this.setupRoundControls();
        this.startRound();
    }

    setupRoundControls() {
        document.getElementById('guessButton').addEventListener('click', () => this.handleGuess());
        document.getElementById('nextRoundButton').addEventListener('click', () => this.startRound());
    }

    async startRound() {
        this.ui.toggleElement('nextRoundButton', false);
        this.ui.toggleElement('guessButton', false);
        document.getElementById('result').textContent = '';
        this.mapManager.clearMarkers();
        
        const coords = this.game.startRound();
        if (!coords) {
            this.ui.showFinalResults(this.game.getFinalResults());
            return;
        }
        
        try {
            await this.mapManager.loadPanorama(coords);
            this.ui.toggleElement('guessButton', true);
            this.startTimer();
        } catch (error) {
            console.error('Ошибка загрузки панорамы:', error);
            this.startRound(); // Пропустить проблемный раунд
        }
    }

    startTimer() {
        const timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.game.roundStartTime) / 1000);
            const remaining = Math.max(0, this.game.roundDuration - elapsed);
            this.ui.updateTimer(remaining);
            
            if (remaining <= 0) {
                clearInterval(timerInterval);
                this.handleTimeUp();
            }
        }, 1000);
    }

    handleTimeUp() {
        Object.keys(this.game.players).forEach(player => {
            if (!this.game.players[player].finished) {
                this.game.players[player].finished = true;
                this.game.players[player].guessTime = this.game.roundDuration;
            }
        });
        this.ui.toggleElement('nextRoundButton', true);
    }

    handleGuess() {
        const playerName = Object.keys(this.game.players)[0]; // Берем первого игрока
        if (!playerName || this.game.players[playerName].finished) return;
        
        const playerCoords = this.mapManager.playerMarker.geometry.getCoordinates();
        const panoramaCoords = this.game.locations[this.game.currentRound - 1];
        
        const result = this.game.makeGuess(playerName, playerCoords, panoramaCoords);
        if (result) {
            this.mapManager.showResult(panoramaCoords, playerCoords);
            this.ui.showResult(
                playerName,
                result.distance,
                result.score,
                this.game.players[playerName].score,
                result.guessTime
            );
            this.ui.toggleElement('nextRoundButton', true);
            this.ui.toggleElement('guessButton', false);
        }
    }
}

// Запуск приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    new App();
});