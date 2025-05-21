class Game {
    constructor() {
        this.locations = [];
        this.currentRound = 0;
        this.players = {};
        this.roundStartTime = null;
        this.roundDuration = 7 * 60;
    }

    async loadLocations() {
        const response = await fetch(`locations.txt?nocache=${Date.now()}`);
        if (!response.ok) throw new Error('Не удалось загрузить локации');
        
        const text = await response.text();
        this.locations = text.trim().split('\n').map(line => {
            const [lat, lon] = line.split(',').map(Number);
            return [lat, lon];
        });
    }

    addPlayer(name) {
        if (!name || this.players[name]) return false;
        
        this.players[name] = { 
            score: 0, 
            finished: false, 
            guessTime: 0 
        };
        return true;
    }

    startRound() {
        if (this.currentRound >= this.locations.length) {
            return null; // Игра окончена
        }
        
        this.roundStartTime = Date.now();
        const coords = this.locations[this.currentRound];
        this.currentRound++;
        
        Object.keys(this.players).forEach(player => {
            this.players[player].finished = false;
        });
        
        return coords;
    }

    calculateDistance(playerCoords, panoramaCoords) {
        return ymaps.coordSystem.geo.getDistance(playerCoords, panoramaCoords);
    }

    calculateScore(distance) {
        if (distance < 1000) return 10;
        if (distance < 5000) return 5;
        if (distance < 20000) return 3;
        return 0;
    }

    makeGuess(playerName, playerCoords, panoramaCoords) {
        if (this.players[playerName].finished) return null;
        
        const distance = this.calculateDistance(playerCoords, panoramaCoords);
        const score = this.calculateScore(distance);
        const guessTime = (Date.now() - this.roundStartTime) / 1000;
        
        this.players[playerName].score += score;
        this.players[playerName].finished = true;
        this.players[playerName].guessTime = guessTime;
        
        return { distance, score, guessTime };
    }

    getFinalResults() {
        return Object.entries(this.players)
            .map(([name, data]) => ({
                name,
                score: data.score,
                time: data.guessTime
            }))
            .sort((a, b) => b.score - a.score || a.time - b.time);
    }
}