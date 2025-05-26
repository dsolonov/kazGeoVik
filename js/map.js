class MapManager {
    constructor() {
        if (MapManager._instance) {
            return MapManager._instance;
        }
        MapManager._instance = this;

        this.panoramaPlayer = null;
        this.miniMap = null;
        this.playerMarker = null;
        this.panoramaMarker = null;
        this.line = null;
        this.isMiniMapExpanded = false;
        this.ymapsLoaded = false;
    }

    async init() {
        try {
            await this.loadYmaps();
            await this.initMiniMap();
            this.initEventListeners();
        } catch (error) {
            console.error('Ошибка инициализации карты:', error);
            this.showMapError();
        }
    }

    loadYmaps() {
        return new Promise((resolve, reject) => {
            if (window.ymaps) {
                this.ymapsLoaded = true;
                return resolve();
            }

            const timeout = setTimeout(() => {
                reject(new Error('Timeout loading Yandex Maps API'));
            }, 10000);

            window.initYandexMapsCallback = () => {
                clearTimeout(timeout);
                this.ymapsLoaded = true;
                resolve();
            };

            const script = document.createElement('script');
            script.src = 'https://api-maps.yandex.ru/2.1/?apikey=2bc4db1f-55d0-4cfe-bb41-e925007c5578&lang=ru_RU&onload=initYandexMapsCallback';
            script.crossOrigin = 'anonymous';
            script.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Failed to load Yandex Maps API'));
            };
            document.head.appendChild(script);
        });
    }

    initMiniMap() {
        if (!this.ymapsLoaded) {
            throw new Error('Yandex Maps API not loaded');
        }

        // Очищаем предыдущую карту
        if (this.miniMap) {
            this.miniMap.destroy();
            this.miniMap = null;
        }

        // Очищаем контейнер
        const container = document.getElementById('miniMap');
        container.innerHTML = '';
        container.removeAttribute('data-error');

        try {
            this.miniMap = new ymaps.Map('miniMap', {
                center: [48, 68],
                zoom: 5,
                controls: ['zoomControl']
            }, {
                suppressMapOpenBlock: true,
                suppressObsoleteBrowserNotifier: true
            });

            this.loadKazakhstanBorder();
        } catch (error) {
            console.error('Ошибка создания карты:', error);
            this.showMapError();
            throw error;
        }
    }

    loadKazakhstanBorder() {
        if (!this.miniMap) return;

        fetch('./kazakhstan_border.json')
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(geoJsonData => {
                const border = new ymaps.GeoObject({
                    geometry: {
                        type: "Polygon",
                        coordinates: geoJsonData.features[0].geometry.coordinates,
                        fillRule: "nonZero"
                    },
                    properties: { hintContent: "Казахстан" }
                }, {
                    strokeColor: "#008000",
                    strokeWidth: 3,
                    fillColor: 'rgba(0,0,0,0)',
                    interactivityModel: 'default#transparent'
                });

                this.miniMap.geoObjects.add(border);
                this.miniMap.container.fitToViewport();
            })
            .catch(error => {
                console.error("Ошибка загрузки границы:", error);
                this.showMapError();
            });
    }

    initEventListeners() {
        // Удаляем старые обработчики, если есть
        const mapButton = document.getElementById('miniMapButton');
        mapButton.removeEventListener('click', this.toggleMiniMapSize);
        
        // Добавляем новые обработчики
        mapButton.addEventListener('click', () => this.toggleMiniMapSize());
        
        if (this.miniMap) {
            this.miniMap.events.add('click', (e) => this.handleMapClick(e));
        }
    }

    toggleMiniMapSize() {
        this.isMiniMapExpanded = !this.isMiniMapExpanded;
        const container = document.getElementById('miniMapContainer');
        container.classList.toggle('expanded', this.isMiniMapExpanded);
        
        setTimeout(() => {
            if (this.miniMap) {
                this.miniMap.container.fitToViewport();
            }
        }, 300);
    }

    handleMapClick(event) {
        if (!this.miniMap) return;

        const coords = event.get('coords');
        if (this.playerMarker) {
            this.playerMarker.geometry.setCoordinates(coords);
        } else {
            this.playerMarker = new ymaps.Placemark(coords, {}, { 
                preset: 'islands#redIcon',
                zIndex: 1000
            });
            this.miniMap.geoObjects.add(this.playerMarker);
            document.getElementById('guessButton').style.display = 'block';
        }
    }

    loadPanorama(coords) {
        return new Promise((resolve, reject) => {
            if (this.panoramaPlayer) {
                this.panoramaPlayer.destroy();
                this.panoramaPlayer = null;
            }

            ymaps.panorama.locate(coords)
                .then((panoramas) => {
                    if (panoramas.length > 0) {
                        this.panoramaPlayer = new ymaps.panorama.Player('panorama', panoramas[0], { 
                            controls: [],
                            zIndex: 999
                        });
                        resolve(true);
                    } else {
                        reject(new Error('Панорамы не найдены'));
                    }
                })
                .catch(reject);
        });
    }

    showResult(panoramaCoords, playerCoords) {
        if (!this.miniMap) return;

        this.clearMarkers();

        this.panoramaMarker = new ymaps.Placemark(panoramaCoords, {}, { 
            preset: 'islands#greenIcon',
            zIndex: 999
        });
        this.miniMap.geoObjects.add(this.panoramaMarker);

        this.line = new ymaps.Polyline([playerCoords, panoramaCoords], {}, {
            strokeColor: '#0000FF',
            strokeWidth: 3,
            zIndex: 998
        });
        this.miniMap.geoObjects.add(this.line);
    }

    clearMarkers() {
        if (!this.miniMap) return;

        if (this.playerMarker) {
            this.miniMap.geoObjects.remove(this.playerMarker);
            this.playerMarker = null;
        }
        if (this.panoramaMarker) {
            this.miniMap.geoObjects.remove(this.panoramaMarker);
            this.panoramaMarker = null;
        }
        if (this.line) {
            this.miniMap.geoObjects.remove(this.line);
            this.line = null;
        }
    }

    showMapError() {
        const container = document.getElementById('miniMap');
        container.setAttribute('data-error', 'true');
        container.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p style="color: #d32f2f; font-weight: bold;">Ошибка загрузки карты</p>
                <p>Пожалуйста, проверьте:</p>
                <ul style="text-align: left; margin: 10px auto; width: fit-content;">
                    <li>Подключение к интернету</li>
                    <li>Блокировку Яндекс.Карт</li>
                </ul>
                <button onclick="window.location.reload()" 
                        style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Перезагрузить
                </button>
            </div>
        `;
    }

    destroy() {
        this.clearMarkers();
        
        if (this.panoramaPlayer) {
            this.panoramaPlayer.destroy();
            this.panoramaPlayer = null;
        }
        
        if (this.miniMap) {
            this.miniMap.destroy();
            this.miniMap = null;
        }

        // Очищаем глобальный callback
        window.initYandexMapsCallback = null;
    }
}
