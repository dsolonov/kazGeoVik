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
        this.ymapsLoadPromise = null;
    }

    async init() {
        try {
            await this.loadYmaps();
            await this.initMiniMap();
            this.initEventListeners();
            return true;
        } catch (error) {
            console.error('Ошибка инициализации карты:', error);
            this.showMapError();
            return false;
        }
    }

    loadYmaps() {
        if (this.ymapsLoadPromise) {
            return this.ymapsLoadPromise;
        }

        this.ymapsLoadPromise = new Promise((resolve, reject) => {
            // Проверяем, возможно API уже загружено
            if (window.ymaps && window.ymaps.Map) {
                return resolve();
            }

            // Проверяем, не загружается ли API другим скриптом
            const existingScript = document.querySelector('script[src*="api-maps.yandex.ru"]');
            if (existingScript) {
                const checkInterval = setInterval(() => {
                    if (window.ymaps && window.ymaps.Map) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
                return;
            }

            // Создаем и настраиваем новый тег script
            const script = document.createElement('script');
            script.src = 'https://api-maps.yandex.ru/2.1/?apikey=2bc4db1f-55d0-4cfe-bb41-e925007c5578&lang=ru_RU';
            script.crossOrigin = 'anonymous';
            
            // Обработчики загрузки скрипта
            script.onload = () => {
                if (!window.ymaps) {
                    reject(new Error('Библиотека Яндекс.Карт не загрузилась'));
                    return;
                }
                
                // Ожидаем полной готовности API
                window.ymaps.ready(() => {
                    if (!window.ymaps.Map) {
                        reject(new Error('Класс Map не доступен в API'));
                    } else {
                        resolve();
                    }
                });
            };
            
            script.onerror = () => {
                reject(new Error('Не удалось загрузить скрипт Яндекс.Карт'));
            };
            
            document.head.appendChild(script);
        });

        return this.ymapsLoadPromise;
    }

    async initMiniMap() {
        try {
            // Очищаем предыдущую карту, если она существует
            if (this.miniMap) {
                this.miniMap.destroy();
                this.miniMap = null;
            }

            // Проверяем готовность API
            if (!window.ymaps || !window.ymaps.Map) {
                throw new Error('API Яндекс.Карт не готово');
            }

            // Создаем новую карту
            this.miniMap = new window.ymaps.Map('miniMap', {
                center: [48, 68],
                zoom: 5,
                controls: ['zoomControl']
            }, {
                suppressMapOpenBlock: true,
                suppressObsoleteBrowserNotifier: true
            });

            await this.loadKazakhstanBorder();
            return true;
        } catch (error) {
            console.error('Ошибка создания карты:', error);
            this.showMapError();
            throw error;
        }
    }

    async loadKazakhstanBorder() {
        if (!this.miniMap) return false;

        try {
            const response = await fetch('./kazakhstan_border.json');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const geoJsonData = await response.json();
            const border = new window.ymaps.GeoObject({
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
            return true;
        } catch (error) {
            console.error("Ошибка загрузки границы:", error);
            throw error;
        }
    }

    initEventListeners() {
        // Удаляем старые обработчики, если они есть
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
            this.playerMarker = new window.ymaps.Placemark(coords, {}, { 
                preset: 'islands#redIcon',
                zIndex: 1000
            });
            this.miniMap.geoObjects.add(this.playerMarker);
            document.getElementById('guessButton').style.display = 'block';
        }
    }

    async loadPanorama(coords) {
        return new Promise((resolve, reject) => {
            if (this.panoramaPlayer) {
                this.panoramaPlayer.destroy();
                this.panoramaPlayer = null;
            }

            window.ymaps.panorama.locate(coords)
                .then((panoramas) => {
                    if (panoramas.length > 0) {
                        this.panoramaPlayer = new window.ymaps.panorama.Player('panorama', panoramas[0], { 
                            controls: [],
                            zIndex: 999
                        });
                        resolve(true);
                    } else {
                        reject(new Error('Панорамы не найдены для данных координат'));
                    }
                })
                .catch(reject);
        });
    }

    showResult(panoramaCoords, playerCoords) {
        if (!this.miniMap) return;

        this.clearMarkers();

        this.panoramaMarker = new window.ymaps.Placemark(panoramaCoords, {}, { 
            preset: 'islands#greenIcon',
            zIndex: 999
        });
        this.miniMap.geoObjects.add(this.panoramaMarker);

        this.line = new window.ymaps.Polyline([playerCoords, panoramaCoords], {}, {
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
        if (!container) return;

        container.innerHTML = `
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                background: rgba(255,255,255,0.9);
                padding: 20px;
                text-align: center;
                z-index: 1000;
                color: #333;
            ">
                <h3 style="color: #d32f2f; margin-bottom: 15px;">Ошибка загрузки карты</h3>
                <div style="text-align: left; margin-bottom: 20px;">
                    <p>Попробуйте:</p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Обновить страницу (Ctrl+F5)</li>
                        <li>Проверить интернет-соединение</li>
                        <li>Отключить блокировщики рекламы</li>
                    </ul>
                </div>
                <button onclick="window.location.reload()" 
                    style="
                        padding: 10px 20px;
                        background: #4CAF50;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 16px;
                    ">
                    Обновить страницу
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

        // Очищаем глобальные обработчики
        window.initYandexMapsCallback = null;
        this.ymapsLoadPromise = null;
    }
}
