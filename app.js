'use strict';

class App {
    constructor() {
        this.game = new Game();
        this.ui = new UIManager();
        this.mapManager = new MapManager();
        this.locationGuide = new LocationGuide(this.game);
        this.timerInterval = null;
        this.isStarting = false;
        this.isLoadingRound = false;
        this.isFinished = false;
        this.isReady = false;
        this.skippedRounds = 0;
        this.bindControls();
        this.setupViewport();
        this.init();
    }

    bindControls() {
        document.getElementById('playerForm').addEventListener('submit', event => {
            event.preventDefault();
            this.startGame();
        });
        document.getElementById('miniMapToggle').addEventListener('click', () => {
            const expanded = document.getElementById('miniMapToggle').getAttribute('aria-expanded') === 'true';
            this.mapManager.setExpanded(!expanded);
        });
        document.getElementById('zoomIn').addEventListener('click', () => this.mapManager.zoomBy(1));
        document.getElementById('zoomOut').addEventListener('click', () => this.mapManager.zoomBy(-1));
        document.getElementById('guessButton').addEventListener('click', () => this.handleGuess());
        document.getElementById('nextRoundButton').addEventListener('click', () => this.startRound());
        for (const id of ['restartButton', 'retryApiButton']) {
            document.getElementById(id).addEventListener('click', () => location.reload());
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.game.isRoundActive) this.tick();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !document.querySelector('dialog[open]')) this.mapManager.setExpanded(false);
        });
    }

    setupViewport() {
        const update = () => {
            const viewport = window.visualViewport;
            const style = document.documentElement.style;
            style.setProperty('--viewport-height', `${viewport?.height || window.innerHeight}px`);
            style.setProperty('--viewport-width', `${viewport?.width || window.innerWidth}px`);
            style.setProperty('--viewport-top', `${viewport?.offsetTop || 0}px`);
            style.setProperty('--viewport-left', `${viewport?.offsetLeft || 0}px`);
        };
        update();
        window.addEventListener('resize', update);
        window.visualViewport?.addEventListener('resize', update);
        window.visualViewport?.addEventListener('scroll', update);
    }

    async init() {
        try {
            await this.mapManager.init(coords => {
                if (!this.game.isRoundActive) return;
                this.mapManager.select(coords);
                document.getElementById('guessButton').disabled = false;
                this.ui.status('Орын таңдалды. Жауапты растаңыз немесе басқа орынды таңдаңыз.');
            });
            this.isReady = true;
            document.getElementById('startButton').disabled = false;
            this.ui.text('setupStatus', 'Атыңызды енгізіп, ойынды бастаңыз.');
        } catch (error) {
            console.error(error);
            this.ui.text('setupStatus', 'Карта жүктелмеді. Интернет байланысын тексеріп, бетті қайта жүктеңіз.');
            this.ui.show('retryApiButton');
        }
    }

    async startGame() {
        if (!this.isReady || this.isStarting) return;
        const input = document.getElementById('playerName');
        const name = input.value.trim();
        if (!name) {
            this.ui.text('setupStatus', 'Атыңызды енгізіңіз.');
            input.setAttribute('aria-invalid', 'true');
            input.focus();
            return;
        }
        input.removeAttribute('aria-invalid');
        this.isStarting = true;
        document.getElementById('startButton').disabled = true;
        this.ui.text('setupStatus', 'Орындар жүктелуде…');
        try {
            await this.game.loadLocations();
            this.game.playerName = name;
            document.getElementById('playerSetup').close();
            this.ui.show('miniMapContainer');
            this.ui.show('gameActions');
            await this.startRound();
        } catch (error) {
            console.error(error);
            this.ui.text('setupStatus', 'Орындарды жүктеу мүмкін болмады. Интернет байланысын және орындар файлын тексеріп, қайта көріңіз.');
        } finally {
            this.isStarting = false;
            document.getElementById('startButton').disabled = false;
        }
    }

    async startRound() {
        if (this.isLoadingRound || this.game.isRoundActive || this.isFinished) return;
        this.locationGuide.reset();
        if (this.game.currentRound >= this.game.locations.length) return this.endGame();
        this.isLoadingRound = true;
        clearInterval(this.timerInterval);
        this.mapManager.reset();
        for (const id of ['resultPanel', 'nextRoundButton', 'guessButton', 'timerPanel', 'errorDetails']) this.ui.show(id, false);
        document.getElementById('errorDetails').open = false;
        try {
            while (this.game.currentRound < this.game.locations.length) {
                this.ui.text('roundPanel', `${this.game.currentRound + 1} / ${this.game.locations.length} кезең`);
                this.ui.status('Панорама жүктелуде…');
                const loaded = await this.mapManager.loadPanorama(this.game.locations[this.game.currentRound]);
                if (!loaded) {
                    this.game.currentRound += 1;
                    this.skippedRounds += 1;
                    continue;
                }
                this.game.startRound();
                this.locationGuide.startRound(this.game.locations[this.game.currentRound - 1]);
                this.ui.show('timerPanel');
                this.ui.updateTimer(CONFIG.ROUND_DURATION_SEC);
                this.ui.show('guessButton');
                document.getElementById('guessButton').disabled = true;
                this.ui.status('Панораманы зерттеп, болжамды орынды картадан таңдаңыз.');
                this.timerInterval = setInterval(() => this.tick(), 1000);
                return;
            }
            await this.endGame();
        } catch (error) {
            this.ui.showPanoramaError(error);
            this.ui.text('nextRoundButton', 'Қайта жүктеу');
            this.ui.show('nextRoundButton');
        } finally {
            this.isLoadingRound = false;
        }
    }

    tick() {
        if (!this.game.isRoundActive) return;
        const remaining = this.game.remainingSeconds();
        this.ui.updateTimer(remaining);
        if (remaining <= 0) this.handleGuess(true);
    }

    handleGuess(isTimeUp = false) {
        const coords = this.mapManager.playerMarker?.geometry.getCoordinates() || null;
        const result = this.game.makeGuess(coords, isTimeUp);
        if (!result) return;
        clearInterval(this.timerInterval);
        this.mapManager.showResult(result);
        this.ui.updateTimer(this.game.remainingSeconds());
        this.ui.showResult(result, this.game.currentRound >= this.game.locations.length);
        this.locationGuide.endRound(result);
    }

    async endGame() {
        if (this.isFinished) return;
        this.locationGuide.reset();
        this.isFinished = true;
        this.game.isRoundActive = false;
        clearInterval(this.timerInterval);
        for (const id of ['miniMapContainer', 'gameActions', 'timerPanel']) this.ui.show(id, false);
        this.ui.text('roundPanel', 'Ойын қорытындысы');
        let finalText =  `${this.game.playerName}, жалпы ұпайыңыз: ${this.game.score}.\n` +  `Жалпы уақыт: ${this.ui.formatDuration(this.game.totalTime)}.`;
        if (this.skippedRounds) finalText += `\nПанорамасы жоқ кезеңдер өткізілді: ${this.skippedRounds}.`;
        this.ui.text('finalText', finalText);
        document.getElementById('helpDialog').close();
        document.getElementById('finalMessage').showModal();
        if (this.skippedRounds === this.game.locations.length) {
            this.ui.text('saveStatus', 'Панорамалар табылмады. Нәтиже рейтингке жіберілген жоқ.');
            this.ui.text('ratingTableContainer', 'Орындар тізімін тексеріп, қайта ойнап көріңіз.');
            return;
        }
        this.ui.text('saveStatus', 'Нәтиже жіберілуде…');
        const formData = new FormData();
        formData.append('name', this.game.playerName);
        formData.append('score', this.game.score);
        formData.append('time', this.game.totalTime.toFixed(1));
        try {
            await fetchWithTimeout(CONFIG.SCRIPT_URL, { method: 'POST', body: formData });
            this.ui.text('saveStatus', 'Нәтиже серверге жіберілді.');
        } catch (error) {
            console.error(error);
            this.ui.text('saveStatus', 'Нәтиженің сақталғанын растау мүмкін болмады. Ұпайыңыз осы терезеде көрсетілген.');
        }
        try {
            const data = JSON.parse(await fetchWithTimeout(CONFIG.SCRIPT_URL));
            this.ui.renderRating(data.data, this.game);
        } catch (error) {
            console.error(error);
            this.ui.text('ratingTableContainer', 'Рейтингті жүктеу мүмкін болмады.');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new App();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
            .catch(error => console.warn('Ойын файлдарын кэштеу қолжетімсіз.', error));
    }
});
