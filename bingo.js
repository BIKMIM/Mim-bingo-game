// 빙고 게임 로직 모듈
class BingoManager {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const startGameBtn = document.getElementById('start-game-btn');
        const bingoBtn = document.getElementById('bingo-button');
        
        if (startGameBtn) startGameBtn.addEventListener('click', () => this.startGame());
        if (bingoBtn) bingoBtn.addEventListener('click', () => this.claimBingo());
    }

    async startGame() {
    console.log('startGame 함수 시작');
    if (!gameState.roomCode) {
        showMessage('먼저 방을 생성하거나 입장해주세요!', 'error');
        return;
    }
    
    const requiredMissions = gameState.boardSize * gameState.boardSize;
    console.log(`필요 미션 수: ${requiredMissions}, 현재 미션 수: ${gameState.missions.length}`);
    if (gameState.missions.length < requiredMissions) {
        showMessage(`미션이 최소 ${requiredMissions}개 필요합니다! 현재 ${gameState.missions.length}개`, 'error');
        return;
    }

    if (!gameState.isHost) {
        showMessage('방장만 게임을 시작할 수 있습니다!', 'error');
        return;
    }
    
    console.log(`현재 플레이어 수: ${Object.keys(gameState.players).length}`);
    if (Object.keys(gameState.players).length < 2) {
        showMessage('게임을 시작하려면 최소 2명 이상의 플레이어가 필요합니다!', 'error');
        return;
    }
    
    console.log('미션 맵 생성 시작');
    const shuffledMissions = [...gameState.missions].sort(() => Math.random() - 0.5).slice(0, requiredMissions);
    const shuffledNumbersForMap = Array.from({length: requiredMissions}, (_, i) => i + 1).sort(() => Math.random() - 0.5);

    const missionMap = {};
    for (let i = 0; i < requiredMissions; i++) {
        missionMap[shuffledNumbersForMap[i]] = shuffledMissions[i];
    }
    console.log('생성된 missionMap:', missionMap);
    
    try {
        // 승리 조건과 보드 크기를 gameState에서 가져오기 (DOM에서 읽지 않음)
        const winCondition = document.querySelector('input[name="win-condition"]:checked')?.value || gameState.winCondition;
        const selectedBoardSize = gameState.boardSize; // gameState에서 직접 사용
        const selectedMaxPlayers = gameState.maxPlayers;
        
        console.log('Firebase room 업데이트 시도');
        await gameState.roomRef.update({
            gameStarted: true,
            winCondition: parseInt(winCondition),
            boardSize: selectedBoardSize,
            maxPlayers: selectedMaxPlayers,
            startedAt: firebase.database.ServerValue.TIMESTAMP,
            flippedNumbers: {},
            winner: null,
            gameEnded: false,
            missionMap: missionMap,
            bingoClaimed: null
        });
        console.log('Firebase room 업데이트 성공');

        const updates = {};
        for (const playerUid in gameState.players) {
            updates[`players/${playerUid}/boardState`] = {};
        }
        await gameState.roomRef.update(updates);
        console.log('플레이어 boardState 초기화 성공');
        
    } catch (error) {
        showMessage('게임 시작에 실패했습니다: ' + error.message, 'error');
        console.error('게임 시작 오류:', error);
    }
    console.log('startGame 함수 종료');
}

    generateBingoBoard() {
        const size = gameState.boardSize;
        const totalCells = size * size;

        if (Object.keys(gameState.missionMap).length === 0 || Object.keys(gameState.missionMap).length !== totalCells) {
            console.warn('generateBingoBoard: Mission map is not fully loaded yet or size mismatch. Retrying in 100ms...');
            setTimeout(() => this.generateBingoBoard(), 100);
            return;
        }
        
        const bingoBoardElement = document.getElementById('bingo-board');
        if (gameState.bingoBoard.length === totalCells && bingoBoardElement.children.length === totalCells && bingoBoardElement.classList.contains(`size-${size}`)) {
            bingoBoardElement.className = `bingo-board size-${size}`;
            return;
        }

        const numbers = Array.from({length: totalCells}, (_, i) => i + 1);
        const shuffledNumbers = numbers.sort(() => Math.random() - 0.5);
        
        gameState.bingoBoard = shuffledNumbers.map((num) => ({
            number: num,
            state: 'unflipped',
            mission: gameState.missionMap[num] || `미션 ${num}`
        }));
        
        bingoBoardElement.className = `bingo-board size-${size}`;
        bingoBoardElement.innerHTML = gameState.bingoBoard.map((cell, index) =>
            `<div class="bingo-cell" onclick="bingoManager.flipCell(${index})">${cell.number}</div>`
        ).join('');

        this.updateBingoCellClickability();
    }

    syncBingoBoard(myBoardStateData) {
        const totalCells = gameState.boardSize * gameState.boardSize;

        if (Object.keys(gameState.missionMap).length === 0 || gameState.bingoBoard.length === 0) {
            if (gameState.gameStarted && Object.keys(gameState.missionMap).length === totalCells) {
                this.generateBingoBoard();
            } else if (gameState.gameStarted && Object.keys(gameState.missionMap).length === 0) {
                console.warn("syncBingoBoard: Waiting for missionMap to load...");
                setTimeout(() => this.syncBingoBoard(myBoardStateData), 100);
                return;
            } else {
                return;
            }
        }
        
        const bingoBoardElement = document.getElementById('bingo-board');
        if (bingoBoardElement.children.length === 0 || bingoBoardElement.children.length !== totalCells) {
            console.warn("syncBingoBoard: Waiting for bingo board DOM to be generated...");
            setTimeout(() => this.syncBingoBoard(myBoardStateData), 50);
            return;
        }

        const cells = bingoBoardElement.querySelectorAll('.bingo-cell');

        for (let i = 0; i < totalCells; i++) {
            const cellInLocalBoard = gameState.bingoBoard[i];
            const cellNumber = cellInLocalBoard.number;
            const missionText = cellInLocalBoard.mission;

            const isFlippedCommon = gameState.flippedNumbers.includes(cellNumber);
            const myCellStateFromFirebase = myBoardStateData[cellNumber] ? myBoardStateData[cellNumber].state : 'unflipped';

            const cellElement = cells[i];
            cellElement.classList.remove('flipped', 'failed');

            if (isFlippedCommon) {
                if (myCellStateFromFirebase === 'flipped') {
                    cellElement.classList.add('flipped');
                    cellElement.textContent = missionText;
                } else if (myCellStateFromFirebase === 'failed') {
                    cellElement.classList.add('failed');
                    cellElement.textContent = missionText;
                } else {
                    cellElement.classList.add('flipped');
                    cellElement.textContent = missionText;
                    gameState.roomRef.child(`players/${gameState.playerUID}/boardState/${cellNumber}`).set({
                        state: 'flipped',
                        mission: missionText,
                        changedAt: firebase.database.ServerValue.TIMESTAMP
                    }).catch(error => console.error("Auto-flip update failed:", error));
                }
            } else {
                cellElement.textContent = cellNumber;
            }
        }
    }

    updateBingoCellClickability() {
        const cells = document.querySelectorAll('.bingo-cell');
        
        const gameEnded = gameState.gameStarted && (gameState.roomRef && gameState.roomRef.gameEnded || gameState.roomRef && gameState.roomRef.winner);

        cells.forEach((cellElement, index) => {
            const cellNumber = gameState.bingoBoard[index].number;
            const isFlippedCommon = gameState.flippedNumbers.includes(cellNumber);

            if (gameEnded) {
                cellElement.style.pointerEvents = 'none';
                cellElement.style.opacity = '0.7';
            } else {
                cellElement.style.pointerEvents = 'auto';
                cellElement.style.opacity = '1';
            }
        });
    }

    checkBingoPossibility() {
        const board = gameState.bingoBoard;
        const size = gameState.boardSize;
        const requiredLines = gameState.winCondition;
        let completedLines = 0;
        const bingoButton = document.getElementById('bingo-button');

        if (!gameState.gameStarted || !gameState.roomRef) {
            gameState.canClaimBingo = false;
            bingoButton.disabled = true;
            return;
        }

        gameState.roomRef.once('value').then(snapshot => {
            const roomData = snapshot.val();
            if (!roomData) return;

            if (roomData.gameEnded || roomData.winner) {
                bingoButton.disabled = true;
                bingoButton.style.display = 'none';
                return;
            } else {
                bingoButton.style.display = 'block';
            }

            // 빙고 라인 체크
            for (let i = 0; i < size; i++) {
                let rowComplete = true;
                for (let j = 0; j < size; j++) {
                    const index = i * size + j;
                    if (!board[index] || !roomData.players[gameState.playerUID] || !roomData.players[gameState.playerUID].boardState || roomData.players[gameState.playerUID].boardState[board[index].number]?.state !== 'flipped') {
                        rowComplete = false;
                        break;
                    }
                }
                if (rowComplete) completedLines++;
            }

            for (let j = 0; j < size; j++) {
                let colComplete = true;
                for (let i = 0; i < size; i++) {
                    const index = i * size + j;
                    if (!board[index] || !roomData.players[gameState.playerUID] || !roomData.players[gameState.playerUID].boardState || roomData.players[gameState.playerUID].boardState[board[index].number]?.state !== 'flipped') {
                        colComplete = false;
                        break;
                    }
                }
                if (colComplete) completedLines++;
            }

            let diag1Complete = true;
            for (let i = 0; i < size; i++) {
                const index = i * size + i;
                if (!board[index] || !roomData.players[gameState.playerUID] || !roomData.players[gameState.playerUID].boardState || roomData.players[gameState.playerUID].boardState[board[index].number]?.state !== 'flipped') {
                    diag1Complete = false;
                    break;
                }
            }
            if (diag1Complete) completedLines++;

            let diag2Complete = true;
            for (let i = 0; i < size; i++) {
                const index = i * size + (size - 1 - i);
                if (!board[index] || !roomData.players[gameState.playerUID] || !roomData.players[gameState.playerUID].boardState || roomData.players[gameState.playerUID].boardState[board[index].number]?.state !== 'flipped') {
                    diag2Complete = false;
                    break;
                }
            }
            if (diag2Complete) completedLines++;
            
            console.log(`${gameState.playerName}: 현재 완성된 라인 수 = ${completedLines}`);

            if (completedLines >= requiredLines) {
                gameState.canClaimBingo = true;
                bingoButton.disabled = roomData.gameEnded || roomData.winner; 
            } else {
                gameState.canClaimBingo = false;
                bingoButton.disabled = true;
            }

        }).catch(error => {
            console.error("Error checking bingo possibility:", error);
            showMessage("빙고 상태 확인 중 오류 발생!", "error");
            bingoButton.disabled = true;
        });
    }

    async flipCell(index) {
        const roomSnapshot = await gameState.roomRef.once('value');
        const roomData = roomSnapshot.val();
        
        if (roomData.gameEnded || roomData.winner) {
            showMessage('게임이 이미 종료되었거나 승자가 결정되었습니다!', 'error');
            return;
        }
        
        const selectedNumber = gameState.bingoBoard[index].number;
        const missionToAssign = gameState.bingoBoard[index].mission;

        try {
            const isFlippedCommon = gameState.flippedNumbers.includes(selectedNumber);
            const myCurrentState = roomData.players[gameState.playerUID]?.boardState?.[selectedNumber]?.state || 'unflipped';

            if (!isFlippedCommon) {
                const flippedResult = await gameState.roomRef.child('flippedNumbers').child(selectedNumber).transaction((currentValue) => {
                    if (currentValue === null) {
                        return true;
                    }
                    return undefined;
                });

                if (!flippedResult.committed) {
                    showMessage('이미 다른 플레이어가 이 숫자를 뒤집었거나 문제가 발생했습니다.', 'error');
                    return;
                }
            }

            const myBoardStateRef = gameState.roomRef.child(`players/${gameState.playerUID}/boardState/${selectedNumber}`);
            
            const boardStateResult = await myBoardStateRef.transaction((currentMyStateData) => {
                let stateForMeInFirebase = currentMyStateData ? currentMyStateData.state : 'unflipped';
                let nextStateForMe;

                if (isFlippedCommon) {
                    if (stateForMeInFirebase === 'flipped') {
                        nextStateForMe = 'failed';
                    } else if (stateForMeInFirebase === 'failed') {
                        nextStateForMe = 'flipped';
                    } else {
                        nextStateForMe = 'flipped';
                    }
                } else {
                    if (stateForMeInFirebase === 'unflipped') {
                        nextStateForMe = 'flipped';
                    } else if (stateForMeInFirebase === 'failed') {
                        nextStateForMe = 'unflipped';
                    } else {
                        return undefined;
                    }
                }
                
                return {
                    state: nextStateForMe,
                    mission: missionToAssign,
                    changedAt: firebase.database.ServerValue.TIMESTAMP
                };
            });

            if (!boardStateResult.committed) {
                showMessage('내 빙고판 칸 상태 변경 중 오류가 발생했습니다. 다시 시도해주세요!', 'error');
            }
            
        } catch (error) {
            showMessage('셀 업데이트에 실패했습니다: ' + error.message, 'error');
            console.error('Firebase Transaction Error:', error);
        }
    }

    async claimBingo() {
        if (!gameState.canClaimBingo) {
            showMessage('빙고를 주장할 수 없습니다. 조건을 다시 확인하세요!', 'error');
            return;
        }
        
        const roomSnapshot = await gameState.roomRef.once('value');
        const roomData = roomSnapshot.val();

        if (roomData.gameEnded || roomData.winner) {
            showMessage('게임은 이미 종료되었거나 승자가 결정되었습니다!', 'error');
            return;
        }
        
        if (roomData.bingoClaimed) {
            showMessage('다른 플레이어가 이미 빙고를 주장했습니다!', 'error');
            return;
        }

        try {
            const result = await gameState.roomRef.child('bingoClaimed').transaction((currentClaim) => {
                if (currentClaim === null) {
                    return {
                        claimerUid: gameState.playerUID,
                        claimerName: gameState.playerName,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    };
                } else {
                    return undefined;
                }
            });

            if (result.committed) {
                await gameState.roomRef.update({
                    winner: gameState.playerName,
                    winnerUid: gameState.playerUID,
                    gameEnded: true,
                    endedAt: firebase.database.ServerValue.TIMESTAMP
                });
                showMessage('🎉 빙고를 주장했습니다! 당신이 승리합니다!', 'success');
            } else {
                showMessage('앗! 다른 플레이어가 먼저 빙고를 주장했습니다!', 'error');
            }
            document.getElementById('bingo-button').disabled = true;
            document.getElementById('bingo-button').style.display = 'none';
        } catch (error) {
            showMessage('빙고 주장 중 오류가 발생했습니다: ' + error.message, 'error');
            console.error('Claim Bingo Error:', error);
        }
    }
}

// 빙고 매니저 인스턴스 생성
const bingoManager = new BingoManager();
