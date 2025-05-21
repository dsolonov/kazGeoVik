class UIManager {
    constructor() {
        this.initPlayerSetup();
        this.initEventListeners();
    }

    initPlayerSetup() {
        const setupHTML = `
            <label for="playerName">Введите ваше имя:</label>
            <input type="text" id="playerName">
            <button id="addPlayer">Добавить игрока</button>
            <ul id="playersList"></ul>
            <button id="startButton" disabled>Начать</button>
        `;
        document.getElementById('playerSetup').innerHTML = setupHTML;
    }

    initEventListeners() {
        document.getElementById('addPlayer').addEventListener('click', () => this.handleAddPlayer());
        document.getElementById('playerName').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') this.handleAddPlayer();
        });
    }

    handleAddPlayer() {
        const nameInput = document.getElementById('playerName');
        const name = nameInput.value.trim();
        
        if (name) {
            const listItem = document.createElement('li');
            listItem.textContent = name;
            document.getElementById('playersList').appendChild(listItem);
            nameInput.value = '';
            document.getElementById('startButton').disabled = false;
        }
    }

    showResult(playerName, distance, roundScore, totalScore, guessTime) {
        const resultElement = document.getElementById('result');
        resultElement.innerHTML = `
            Игрок: ${playerName}<br>
            Расстояние: ${Math.round(distance)} м.<br>
            Очки за раунд: ${roundScore}.<br>
            Общий счёт: ${totalScore}.<br>
            Время: ${guessTime.toFixed(1)} сек
        `;
    }

    updateTimer(remainingTime) {
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        document.getElementById('timer').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    showFinalResults(results) {
        let resultsText = "Итоговый рейтинг:<br>";
        results.forEach(player => {
            resultsText += `${player.name}: ${player.score} очков, время: ${player.time.toFixed(1)} сек<br>`;
        });

        const finalMessage = document.getElementById('finalMessage');
        finalMessage.innerHTML = resultsText + "Спасибо за игру!";
        finalMessage.style.display = 'block';
    }

    toggleElement(id, show) {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = show ? 'block' : 'none';
        }
    }
}