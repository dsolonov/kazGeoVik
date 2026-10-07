'use strict';

// Rules from the original, active index.html.
const CONFIG = Object.freeze({
    ROUND_DURATION_SEC: 20 * 60,
    SCORE_BANDS: [
    { limit: 100,   points: 10 },
    { limit: 500,   points: 8 },
    { limit: 1000,  points: 6 },
    { limit: 5000,  points: 4 },
    { limit: 20000, points: 2 },
    { limit: 50000, points: 1 }
    ],
    LOCATIONS_URL: './locations.txt',
    BORDER_URL: './kazakhstan_border.json',
    YANDEX_API_KEY: '2bc4db1f-55d0-4cfe-bb41-e925007c5578',
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwi3rDwL9mnZijV1SvQog44PGD62G-27lFKs0oMEJLDYDobC42y7cKrgs_ViGmYkKGT/exec'
});

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error('Деректерді жүктеу мүмкін болмады.');
        // Read the body before clearing the timeout so a stalled response also expires.
        const text = await response.text();
        return text;
    } finally {
        clearTimeout(timer);
    }
}

class Game {
    constructor() {
        this.playerName = '';
        this.locations = [];
        this.currentRound = 0;
        this.score = 0;
        this.totalTime = 0;
        this.roundStartTime = null;
        this.isRoundActive = false;
        this.hintsUsed = 0;
    }

    async loadLocations() {
        const text = await fetchWithTimeout(CONFIG.LOCATIONS_URL, { cache: 'no-store' });
        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const locations = lines.map(line => {
            const values = line.split(',').map(value => value.trim());
            const coords = values.map(Number);
            if (values.length !== 2 || values.some(value => value === '') ||
                !coords.every(Number.isFinite) || Math.abs(coords[0]) > 90 || Math.abs(coords[1]) > 180) {
                throw new Error('Орындар файлындағы координаттарды тексеріңіз.');
            }
            return coords;
        });
        if (!locations.length) throw new Error('Орындар тізімі бос.');
        this.locations = locations;
    }

    startRound() {
        this.currentRound += 1;
        this.roundStartTime = Date.now();
        this.isRoundActive = true;
        this.hintsUsed = 0;
    }

    remainingSeconds() {
        return Math.max(0, CONFIG.ROUND_DURATION_SEC - Math.floor((Date.now() - this.roundStartTime) / 1000));
    }

    calculateScore(distance) {
        return CONFIG.SCORE_BANDS.find(band => distance < band.limit)?.points || 0;
    }

    useHint(level) {
        if (
            ![1, 2].includes(level) ||
            !this.isRoundActive ||
            this.remainingSeconds() <= 0
        ) return false;

        // Повторный просмотр уже взятой подсказки бесплатный.
        if (level <= this.hintsUsed) return true;

        // Вторая подсказка доступна после первой.
        if (level !== this.hintsUsed + 1) return false;

        this.hintsUsed = level;
        return true;
    }


    makeGuess(playerCoords, isTimeUp = false) {
        if (!this.isRoundActive || (!playerCoords && !isTimeUp)) {
            return null;
        }

        isTimeUp = isTimeUp || this.remainingSeconds() <= 0;
        this.isRoundActive = false;

        const targetCoords = this.locations[this.currentRound - 1];

        const guessTime = Math.min(
            CONFIG.ROUND_DURATION_SEC,
            (Date.now() - this.roundStartTime) / 1000
        );

        const distance = playerCoords
            ? ymaps.coordSystem.geo.getDistance(playerCoords, targetCoords)
            : null;

        const baseScore = isTimeUp ? 0 : this.calculateScore(distance);

        // Нет подсказок: 0. Первая: 1. Обе: 1 + 2 = 3.
        const hintPenalty = [0, 1, 3][this.hintsUsed];

        const roundScore = Math.max(0, baseScore - hintPenalty);

        this.score += roundScore;
        this.totalTime += guessTime;

        return {
            targetCoords,
            playerCoords,
            distance,
            baseScore,
            hintPenalty,
            roundScore,
            guessTime,
            isTimeUp,
            totalScore: this.score
        };
    }
}
