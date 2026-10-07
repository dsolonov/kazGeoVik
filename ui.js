'use strict';

class UIManager {
    constructor() {
        this.number = new Intl.NumberFormat('kk-KZ', { maximumFractionDigits: 1 });
        const help = document.getElementById('helpDialog');
        const showHelp = () => { if (!help.open) help.showModal(); };
        document.getElementById('helpButton').addEventListener('click', showHelp);
        document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', showHelp));
        document.getElementById('closeHelpButton').addEventListener('click', () => help.close());
        for (const id of ['playerSetup', 'finalMessage']) {
            const hintRules = document.createElement('p');
            hintRules.textContent =
                'Әр кезеңде екі көмек алуға болады. Бірінші көмек үшін 1 ұпай, ' +
                'екінші көмек үшін қосымша 2 ұпай шегеріледі. Екі көмектің жалпы ' +
                'айыбы — 3 ұпай. Кезең ұпайы 0-ден төмен болмайды. ' +
                'Алынған көмекті қайта қарау тегін. Көмекті қарау кезінде уақыт тоқтамайды.';

            document.getElementById('helpScores').closest('table').after(hintRules);
            document.getElementById(id).addEventListener('cancel', event => event.preventDefault());
        }
        document.getElementById('helpDuration').textContent = `${CONFIG.ROUND_DURATION_SEC / 60} минут`;
        const body = document.getElementById('helpScores');
        CONFIG.SCORE_BANDS.forEach((band, index) => {
            const from = index ? CONFIG.SCORE_BANDS[index - 1].limit / 1000 : 0;
            const label = `${from} км ≤ қашықтық < ${band.limit / 1000} км`;
            this.appendRow(body, [label, band.points]);
        });
        this.appendRow(body, [`Қашықтық ≥ ${CONFIG.SCORE_BANDS.at(-1).limit / 1000} км`, 0]);
        document.getElementById('playerSetup').showModal();
    }

    show(id, visible = true) { document.getElementById(id).classList.toggle('hidden', !visible); }
    text(id, value) { document.getElementById(id).textContent = value; }
    status(value) { this.text('statusMessage', value); }

    showPanoramaError(error) {
        const diagnostic = error.diagnostic || { version: '3', stage: 'round-start', error: describeServiceError(error) };
        const text = JSON.stringify(diagnostic, null, 2);
        console.error(`[PANORAMA_ERROR] ${JSON.stringify(diagnostic)}`);
        this.text('errorText', text);
        this.show('errorDetails');
        if (diagnostic.panoramaSupported === false) {
            this.status('Бұл браузерде панорама қолжетімсіз. Басқа браузерде ашып көріңіз. Уақыт әлі басталған жоқ.');
        } else {
            this.status('Панорама жүктелмеді. Қайта жүктеп көріңіз. Қате мәліметтері төменде көрсетілген. Уақыт әлі басталған жоқ.');
        }
    }

    formatDuration(value) {
    const seconds = Number(value);

    if (!Number.isFinite(seconds) || seconds < 0) {
        return '—';
    }

    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const remainder = String(total % 60).padStart(2, '0');

    return `${minutes} мин ${remainder} с`;
    }


    updateTimer(seconds) {
        this.text('timerPanel', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    }

    showResult(result, isLastRound) {
        const panel = document.getElementById('resultPanel');
        panel.replaceChildren();
        if (result.isTimeUp) {
            const message = document.createElement('p');
            message.className = 'time-up';
            message.textContent = 'Уақыт аяқталды! Бұл кезеңге 0 ұпай берілді.';
            panel.append(message);
        }
        const grid = document.createElement('div');
        grid.className = 'result-grid';
        const distance = result.distance === null ? 'Жауап берілмеді' : `${this.number.format(result.distance / 1000)} км`;
        for (const [label, value] of [
    ['Қашықтық', distance],
    ['Дәлдік ұпайы', result.baseScore],
    ['Көмек үшін айып', result.hintPenalty ? '-' + result.hintPenalty : 0],
    ['Кезең ұпайы', result.roundScore],
    ['Жалпы ұпай', result.totalScore],
    ['Уақыт', this.formatDuration(result.guessTime)]
        ]) {
            const paragraph = document.createElement('p');
            paragraph.append(`${label}: `);
            const strong = document.createElement('strong');
            strong.textContent = value;
            paragraph.append(strong);
            grid.append(paragraph);
        }
        panel.append(grid);
        this.show('resultPanel');
        this.text('nextRoundButton', isLastRound ? 'Ойынды аяқтау' : 'Келесі кезең');
        this.show('nextRoundButton');
        document.getElementById('nextRoundButton').disabled = false;
        this.show('guessButton', false);
        this.status('Жасыл белгі — нақты орын. Қызыл белгі — сіздің жауабыңыз.');
    }

    appendRow(parent, values, cellType = 'td') {
        const row = document.createElement('tr');
        for (const value of values) {
            const cell = document.createElement(cellType);
            if (cellType === 'th') cell.scope = 'col';
            cell.textContent = value;
            row.append(cell);
        }
        parent.append(row);
        return row;
    }

    renderRating(data, game) {
        const container = document.getElementById('ratingTableContainer');
        container.replaceChildren();
        if (!Array.isArray(data)) throw new Error('Рейтинг деректері дұрыс емес.');
        const rows = data.slice(1).filter(row => Array.isArray(row) && row.length >= 3);
        if (!rows.length) { container.textContent = 'Рейтингте әзірге нәтиже жоқ.'; return; }
        rows.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0) || (Number(a[2]) || 0) - (Number(b[2]) || 0));
        const table = document.createElement('table');
        table.id = 'ratingTable';
        const head = table.createTHead();
        this.appendRow(head, ['Орын', 'Ойыншы', 'Ұпай', 'Уақыт'], 'th');
        const body = table.createTBody();
        rows.forEach((row, index) => {
            const element = this.appendRow(body, [
                index + 1,
                String(row[0]),
                this.number.format(Number(row[1]) || 0),
                this.formatDuration(row[2])
            ]);
            if (row[0] === game.playerName && Number(row[1]) === game.score && Math.abs(Number(row[2]) - Number(game.totalTime.toFixed(1))) < 0.2) {
                element.className = 'highlight-row';
            }
        });
        container.append(table);
    }
}
