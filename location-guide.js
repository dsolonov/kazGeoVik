'use strict';

const NOMAD_GUIDE_DATA_URL = new URL(
    './locations-info.json?v=6',
    document.currentScript?.src || document.baseURI
).href;

class LocationGuide {
    constructor(game) {
        this.game = game;
        this.token = 0;
        this.timer = null;
        this.dataPromise = null;
        this.entry = null;
        this.result = null;
        this.reviewButton = null;

        const style = this.el('style');
        style.textContent = [
            '.nq-hints { margin: 12px 0; }',
            '.nq-hints[hidden] { display: none !important; }',
            '.nq-hint-buttons { display: flex; gap: 8px; flex-wrap: wrap; }',
            '.nq-hint-buttons button { flex: 1 1 150px; min-height: 44px; }',
            '.nq-hints p { margin: 8px 0; font-size: 14px; }',
            '.nq-guide { box-sizing: border-box; width: min(680px, calc(100vw - 24px)); max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); padding: 0; border: 1px solid #b6c9bf; border-radius: 14px; background: #fff; color: #193b30; }',
            '.nq-guide[open] { display: flex; flex-direction: column; }',
            '.nq-guide::backdrop { background: rgba(0,0,0,.45); }',
            '.nq-guide-head, .nq-guide-foot { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; padding: 12px 16px; }',
            '.nq-guide-head { justify-content: space-between; border-bottom: 1px solid #dce5df; }',
            '.nq-guide-head h2 { margin: 0; font-size: 20px; }',
            '.nq-guide-foot { border-top: 1px solid #dce5df; }',
            '.nq-guide button { min-height: 44px; }',
            '.nq-guide-x { min-width: 44px; font-size: 26px; }',
            '.nq-guide-body { padding: 16px; overflow-y: auto; min-height: 0; overflow-wrap: anywhere; }',
            '.nq-guide-body section + section { margin-top: 24px; padding-top: 20px; border-top: 1px solid #dce5df; }',
            '.nq-guide-body p { white-space: pre-line; }',
            '.nq-guide-language { font-weight: 700; color: #16734b; }'
        ].join('\n');
        document.head.append(style);

        this.panel = this.el('section', undefined, 'nq-hints');
        this.panel.hidden = true;

        const buttons = this.el('div', undefined, 'nq-hint-buttons');
        this.buttons = [1, 2].map(level => {
            const button = this.button('', () => this.showHint(level));
            buttons.append(button);
            return button;
        });

        this.note = this.el('p');
        this.note.setAttribute('role', 'status');
        this.panel.append(buttons, this.note);

        document.getElementById('guessButton').before(this.panel);

        this.dialog = this.el('dialog', undefined, 'nq-guide');
        this.dialog.lang = 'kk';
        this.dialog.setAttribute('aria-labelledby', 'nqGuideTitle');

        const head = this.el('div', undefined, 'nq-guide-head');
        this.title = this.el('h2');
        this.title.id = 'nqGuideTitle';

        const close = this.button('×', () => this.close());
        close.classList.add('nq-guide-x');
        close.setAttribute('aria-label', 'Жабу');
        close.autofocus = true;
        head.append(this.title, close);

        this.body = this.el('div', undefined, 'nq-guide-body');
        this.body.setAttribute('aria-live', 'polite');

        const foot = this.el('div', undefined, 'nq-guide-foot');
        foot.append(this.button('Жабу', () => this.close()));

        this.dialog.append(head, this.body, foot);
        this.dialog.addEventListener('cancel', () => this.cancelTimer());
        document.body.append(this.dialog);
    }

    el(tag, text, className) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    button(text, action) {
        const button = this.el('button', text, 'button secondary');
        button.type = 'button';
        button.addEventListener('click', action);
        return button;
    }

    key(coords) {
        if (!Array.isArray(coords) || coords.length < 2) return null;

        const pair = coords.slice(0, 2);
        if (pair.some(value =>
            !['number', 'string'].includes(typeof value) ||
            String(value).trim() === ''
        )) return null;

        const numbers = pair.map(Number);
        if (
            !numbers.every(Number.isFinite) ||
            Math.abs(numbers[0]) > 90 ||
            Math.abs(numbers[1]) > 180
        ) return null;

        return numbers.map(value => value.toFixed(6)).join(',');
    }

    hasBoth(value) {
        return ['kk', 'ru'].every(lang =>
            typeof value?.[lang] === 'string' && value[lang].trim()
        );
    }

    loadData() {
        if (!this.dataPromise) {
            this.dataPromise = fetchWithTimeout(
                NOMAD_GUIDE_DATA_URL,
                { cache: 'no-cache' }
            ).then(text => {
                const data = JSON.parse(text);

                if (data.version !== 1 || !Array.isArray(data.locations)) {
                    throw new Error('Справочник: неверный формат');
                }

                const index = new Map();

                for (const entry of data.locations) {
                    for (const coords of [
                        entry.coordinates,
                        ...(entry.aliases || [])
                    ]) {
                        const key = this.key(coords);

                        if (
                            !key ||
                            (index.has(key) && index.get(key) !== entry)
                        ) {
                            throw new Error(
                                'Справочник: неверные или повторяющиеся координаты'
                            );
                        }

                        index.set(key, entry);
                    }
                }

                return index;
            }).catch(error => {
                this.dataPromise = null;
                throw error;
            });
        }

        return this.dataPromise;
    }

    cancelTimer() {
        clearTimeout(this.timer);
        this.timer = null;
    }

    close() {
        this.cancelTimer();
        if (this.dialog.open) this.dialog.close();
    }

    reset() {
        this.token += 1;
        this.close();
        this.panel.hidden = true;
        this.entry = null;
        this.result = null;
        this.reviewButton?.remove();
    }

    startRound(coords) {
        this.reset();

        const token = this.token;
        this.panel.hidden = false;
        this.buttons.forEach(button => {
            button.disabled = true;
        });

        this.buttons[0].textContent = '1-көмек (−1 ұпай)';
        this.buttons[1].textContent = '2-көмек (−2 ұпай)';
        this.note.textContent = 'Көмек жүктелуде…';

        this.loadData().then(index => {
            if (token !== this.token || !this.game.isRoundActive) return;

            this.entry = index.get(this.key(coords));
            this.updateHints();
        }).catch(error => {
            console.warn('Көмек жүктелмеді.', error);

            if (token === this.token) {
                this.note.textContent =
                    'Көмек жүктелмеді. Ойынды жалғастыра беріңіз.';
            }
        });
    }

    updateHints() {
        const hints = this.entry?.hints;
        const used = this.game.hintsUsed;

        this.buttons[0].disabled = !this.hasBoth(hints?.region);
        this.buttons[1].disabled =
            used < 1 || !this.hasBoth(hints?.settlement);

        this.buttons.forEach((button, index) => {
            const level = index + 1;
            button.textContent = used >= level
                ? level + '-көмек · Қайта көру'
                : level + '-көмек (−' + level + ' ұпай)';
        });

        this.note.textContent = this.hasBoth(hints?.region)
            ? 'Көмек үшін айып: ' + [0, 1, 3][used] +
                ' ұпай. Уақыт тоқтамайды.'
            : 'Бұл орын үшін көмек әлі қосылмаған.';
    }

    languageBlocks(value, isInfo = false) {
        return ['kk', 'ru'].map(lang => {
            const block = this.el('section');
            block.lang = lang;

            block.append(this.el(
                'p',
                lang === 'kk' ? 'Қазақша' : 'Русский',
                'nq-guide-language'
            ));

            if (isInfo) {
                block.append(
                    this.el('h3', value.name?.[lang] || '—'),
                    this.el(
                        'p',
                        (lang === 'kk' ? 'Мекенжайы: ' : 'Адрес: ') +
                        (value.address?.[lang] || '—')
                    ),
                    this.el('p', value.description?.[lang] || '—')
                );
            } else {
                block.append(this.el('p', value[lang]));
            }

            return block;
        });
    }

    open(title, nodes) {
        this.cancelTimer();
        this.title.textContent = title;
        this.body.replaceChildren(...nodes);
        this.body.scrollTop = 0;

        if (!this.dialog.open) this.dialog.showModal();
    }

    showHint(level) {
        const value = this.entry?.hints?.[
            level === 1 ? 'region' : 'settlement'
        ];

        if (!this.hasBoth(value) || !this.game.useHint(level)) return;

        this.updateHints();
        this.open(level + '-көмек', this.languageBlocks(value));
    }

    endRound(result) {
        this.reset();
        this.result = result;
        const token = this.token;

        this.reviewButton = this.button('Орын туралы', () => {
            void this.showInfo();
        });

        document.getElementById('resultPanel').append(this.reviewButton);

        if (!result.isTimeUp) {
            this.timer = setTimeout(() => {
                this.timer = null;

                if (
                    token !== this.token ||
                    this.game.isRoundActive ||
                    document.querySelector('dialog[open]')
                ) return;

                void this.showInfo();
            }, 4500);
        }
    }

    async showInfo() {
        if (!this.result) return;

        const token = this.token;
        const coords = this.result.targetCoords;

        this.open('Орын туралы', [
            this.el('p', 'Мәлімет жүктелуде…')
        ]);

        try {
            const index = await this.loadData();

            if (token !== this.token || !this.dialog.open) return;

            const entry = index.get(this.key(coords));

            this.body.replaceChildren(...(
                entry
                    ? this.languageBlocks(entry, true)
                    : [this.el(
                        'p',
                        'Бұл орын туралы мәлімет әлі қосылмаған.'
                    )]
            ));
        } catch (error) {
            console.warn('Мәлімет жүктелмеді.', error);

            if (token === this.token && this.dialog.open) {
                this.body.replaceChildren(this.el(
                    'p',
                    'Мәлімет жүктелмеді. Терезені жауып, қайта ашып көріңіз.'
                ));
            }
        }
    }
}