'use strict';

// Yandex can reject a request with a plain object rather than an Error.
// Capture a readable snapshot, including non-enumerable Error fields.
function describeServiceError(error) {
    const seen = new WeakSet();
    const snapshot = (value, depth = 0) => {
        if (value === null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
        if (seen.has(value)) return '[circular]';
        if (depth > 3) return '[nested object]';
        seen.add(value);
        if (Array.isArray(value)) return value.slice(0, 12).map(item => snapshot(item, depth + 1));
        const result = {};
        for (const key of new Set(['name', 'message', 'code', 'status', 'statusCode', 'description', ...Object.keys(value)])) {
            if (key === 'stack' || key === '__proto__') continue;
            try {
                if (value[key] !== undefined) result[key] = /key|token|authorization/i.test(key) ? '[redacted]' : snapshot(value[key], depth + 1);
            } catch { result[key] = '[unreadable]'; }
        }
        return Object.keys(result).length ? result : String(value);
    };
    const text = typeof error === 'string' ? error : JSON.stringify(snapshot(error), null, 2);
    return String(text ?? 'Unknown error').split(CONFIG.YANDEX_API_KEY).join('[redacted]').slice(0, 6000);
}

class MapManager {
    constructor() {
        this.miniMap = null;
        this.panoramaPlayer = null;
        this.playerMarker = null;
        this.targetMarker = null;
        this.line = null;
        this.resizeFrame = null;
    }

    async loadYmaps() {
        if (window.ymaps?.Map) return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Картаны жүктеу уақыты аяқталды.')), 20000);
            const ready = () => {
                if (!window.ymaps) return fail();
                window.ymaps.ready(() => { clearTimeout(timer); resolve(); });
            };
            const fail = () => { clearTimeout(timer); reject(new Error('Картаны жүктеу мүмкін болмады.')); };
            if (window.ymaps) return ready();
            const script = document.createElement('script');
            // JS API 2.1 does not document a Kazakh locale. App-owned controls are in Kazakh.
            script.src = `https://api-maps.yandex.ru/2.1/?apikey=${CONFIG.YANDEX_API_KEY}&lang=ru_RU`;
            script.async = true;
            script.onload = ready;
            script.onerror = fail;
            document.head.append(script);
        });
    }

    async init(onSelect) {
        await this.loadYmaps();
        this.miniMap = new ymaps.Map('miniMap', { center: [48, 68], zoom: 4, controls: [] }, {
            suppressMapOpenBlock: true
        });
        this.miniMap.events.add('click', event => onSelect(event.get('coords')));
        this.loadKazakhstanBorder();
        const fit = () => {
            cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = requestAnimationFrame(() => this.fitToViewport());
        };
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(fit);
            this.resizeObserver.observe(document.getElementById('mapBody'));
            this.resizeObserver.observe(document.getElementById('panorama'));
        }
        window.addEventListener('resize', fit);
        window.addEventListener('orientationchange', fit);
        window.visualViewport?.addEventListener('resize', fit);
    }

    async loadKazakhstanBorder() {
        try {
            const data = JSON.parse(await fetchWithTimeout(CONFIG.BORDER_URL));
            const border = new ymaps.GeoObject({
                // The supplied file already stores coordinates in the API's lat/long order.
                geometry: { type: 'Polygon', coordinates: data.features[0].geometry.coordinates, fillRule: 'nonZero' },
                properties: { hintContent: 'Қазақстан' }
            }, {
                strokeColor: '#008000', strokeWidth: 3, fillColor: 'rgba(0,0,0,0)',
                interactivityModel: 'default#transparent'
            });
            this.miniMap.geoObjects.add(border);
        } catch (error) {
            console.warn('Қазақстан шекарасын жүктеу мүмкін болмады.', error);
        }
    }

    fitToViewport() {
      const mapBody = document.getElementById('mapBody');

      // Пересчитываем карту только тогда, когда её область видима.
      if (
        this.miniMap &&
        mapBody &&
        mapBody.clientWidth > 0 &&
        mapBody.clientHeight > 0
      ) {
        this.miniMap.container.fitToViewport();
      }

      this.panoramaPlayer?.fitToViewport();
    }

    setExpanded(expanded) {
        document.getElementById('miniMapContainer').classList.toggle('expanded', expanded);
        const button = document.getElementById('miniMapToggle');
        button.textContent = expanded ? 'Картаны кішірейту' : 'Картаны үлкейту';
        button.setAttribute('aria-expanded', String(expanded));
        requestAnimationFrame(() => this.fitToViewport());
    }

    zoomBy(delta) {
        if (this.miniMap) this.miniMap.setZoom(Math.max(0, Math.min(19, this.miniMap.getZoom() + delta)), { checkZoomRange: true });
    }

    select(coords) {
        if (this.playerMarker) this.playerMarker.geometry.setCoordinates(coords);
        else {
            this.playerMarker = new ymaps.Placemark(coords, { hintContent: 'Сіздің жауабыңыз' }, { preset: 'islands#redDotIcon' });
            this.miniMap.geoObjects.add(this.playerMarker);
        }
    }

    reset() {
        for (const key of ['playerMarker', 'targetMarker', 'line']) {
            if (this[key]) this.miniMap.geoObjects.remove(this[key]);
            this[key] = null;
        }
        this.miniMap.setCenter([48, 68], 4);
        this.setExpanded(false);
    }

    async loadPanorama(coords) {
        this.panoramaPlayer?.destroy();
        this.panoramaPlayer = null;

        let stage = 'browser-support';
        let supported = null;

        // Каждый поиск имеет собственный тайм-аут.
        const locate = async (layer) => {
            let timeout;

            try {
                return await Promise.race([
                    ymaps.panorama.locate(coords, { layer }),
                    new Promise((_, reject) => {
                        timeout = setTimeout(() => {
                            reject(new Error(
                                'Панораманы жүктеу уақыты аяқталды.'
                            ));
                        }, 20000);
                    })
                ]);
            } finally {
                clearTimeout(timeout);
            }
        };

        try {
            supported = typeof ymaps.panorama?.isSupported === 'function'
                ? ymaps.panorama.isSupported()
                : null;

            if (supported === false) {
                throw new Error('PANORAMA_UNSUPPORTED');
            }

            // Сначала ищем наземную панораму.
            stage = 'panorama-locate-ground';
            let panoramas = await locate('yandex#panorama');

            // Если наземной нет — ищем воздушную.
            if (panoramas.length === 0) {
                stage = 'panorama-locate-air';
                panoramas = await locate('yandex#airPanorama');
            }

            if (panoramas.length === 0) {
                return false;
            }

            stage = 'player-create';
            this.panoramaPlayer = new ymaps.panorama.Player(
                'panorama',
                panoramas[0],
                {
                    controls: [],
                    suppressMapOpenBlock: true
                }
            );

            stage = 'player-resize';
            this.fitToViewport();

            return true;
        } catch (error) {
            const failure = new Error('Панорама жүктелмеді.');

            failure.diagnostic = {
                version: '3',
                host: window.location?.host || '',
                stage,
                panoramaSupported: supported,
                error: describeServiceError(error)
            };

            throw failure;
        }
    }

    showResult(result) {
        this.targetMarker = new ymaps.Placemark(result.targetCoords, { hintContent: 'Нақты орын' }, { preset: 'islands#greenDotIcon' });
        this.miniMap.geoObjects.add(this.targetMarker);
        if (result.playerCoords) {
            this.line = new ymaps.Polyline([result.playerCoords, result.targetCoords], {}, { strokeColor: '#215bc5', strokeWidth: 3 });
            this.miniMap.geoObjects.add(this.line);
            this.miniMap.setBounds(this.line.geometry.getBounds(), { checkZoomRange: true, zoomMargin: 30 });
        } else {
            this.miniMap.setCenter(result.targetCoords, 6);
        }
    }
}
