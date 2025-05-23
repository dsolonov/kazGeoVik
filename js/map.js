class MapManager {
    constructor() {
        this.panoramaPlayer = null;
        this.miniMap = null;
        this.playerMarker = null;
        this.panoramaMarker = null;
        this.line = null;
        this.isMiniMapExpanded = false;
    }

    init() {
        return new Promise((resolve) => {
            ymaps.ready(() => {
                this.initMiniMap();
                this.initEventListeners();
                resolve();
            });
        });
    }

    initMiniMap() {
        if (this.miniMap) {
        this.miniMap.destroy();
        }
        this.miniMap = new ymaps.Map('miniMap', {
            center: [48, 68],
            zoom: 5,
            controls: ['zoomControl']
        });

        this.loadKazakhstanBorder();
    }

    loadKazakhstanBorder() {
        fetch('./kazakhstan_border.json')
            .then(response => response.json())
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
            .catch(error => console.error("Ошибка загрузки границы:", error));
    }

    initEventListeners() {
        document.getElementById('miniMapButton').addEventListener('click', () => this.toggleMiniMapSize());
        this.miniMap.events.add('click', (e) => this.handleMapClick(e));
    }

    toggleMiniMapSize() {
        this.isMiniMapExpanded = !this.isMiniMapExpanded;
        const container = document.getElementById('miniMapContainer');
        container.classList.toggle('expanded', this.isMiniMapExpanded);
        setTimeout(() => this.miniMap.container.fitToViewport(), 300);
    }

    handleMapClick(event) {
        const coords = event.get('coords');
        if (this.playerMarker) {
            this.playerMarker.geometry.setCoordinates(coords);
        } else {
            this.playerMarker = new ymaps.Placemark(coords, {}, { preset: 'islands#redIcon' });
            this.miniMap.geoObjects.add(this.playerMarker);
            document.getElementById('guessButton').style.display = 'block';
        }
    }

    loadPanorama(coords) {
        if (this.panoramaPlayer) {
            this.panoramaPlayer.destroy();
        }

        return ymaps.panorama.locate(coords).then((panoramas) => {
            if (panoramas.length > 0) {
                this.panoramaPlayer = new ymaps.panorama.Player('panorama', panoramas[0], { controls: [] });
                return true;
            }
            throw new Error('Панорамы не найдены');
        });
    }

    showResult(panoramaCoords, playerCoords) {
        if (!this.panoramaMarker) {
            this.panoramaMarker = new ymaps.Placemark(panoramaCoords, {}, { preset: 'islands#greenIcon' });
            this.miniMap.geoObjects.add(this.panoramaMarker);
        }

        if (this.line) {
            this.line.geometry.setCoordinates([playerCoords, panoramaCoords]);
        } else {
            this.line = new ymaps.Polyline([playerCoords, panoramaCoords], {}, 
                { strokeColor: '#0000FF', strokeWidth: 3 });
            this.miniMap.geoObjects.add(this.line);
        }
    }

    clearMarkers() {
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
}
