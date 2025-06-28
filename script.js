// script.js

// Firebase 설정 가져오기 (firebase-config.js에서 로드됨)
// firebaseConfig는 전역 변수로 이미 선언되어 있다고 가정합니다.
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// 게임 상태 변수들
let gameState = {
    isHost: false,
    roomCode: '',
    playerName: '',
    playerUID: null,
    players: {},
    missions: [],
    winCondition: 1,
    boardSize: 3,
    maxPlayers: 2,
    gameStarted: false,
    bingoBoard: [],
    // currentTurn: 0, // 턴 개념 제거로 삭제
    playerList: [],
    roomRef: null,
    missionMap: {},
    canClaimBingo: false,
    flippedNumbers: [],
    // hasMadeMoveInTurn: false, // 턴 개념 제거로 삭제
    isAuthReady: false
};

// UI 버튼 상태 업데이트 함수
function updateButtonStates() {
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.querySelector('button[onclick="joinRoom()"]');
    
    if (gameState.isAuthReady) {
        // 인증 완료 시 버튼 활성화
        createRoomBtn.disabled = false;
        createRoomBtn.innerHTML = '새 방 만들기';
        if (joinRoomBtn) {
            joinRoomBtn.disabled = false;
            joinRoomBtn.innerHTML = '방 입장';
        }
    } else {
        // 인증 대기 시 버튼 비활성화 및 로딩 표시
        createRoomBtn.disabled = true;
        createRoomBtn.innerHTML = '<span class="loading-indicator"></span>로그인 중...';
        if (joinRoomBtn) {
            joinRoomBtn.disabled = true;
            joinRoomBtn.innerHTML = '<span class="loading-indicator"></span>로그인 중...';
        }
    }
}

// 상태 메시지 표시
function showMessage(message, type = 'info') {
    const statusDiv = document.getElementById('status-message');
    statusDiv.innerHTML = `<div class="${type}">${message}</div>`;
    statusDiv.style.opacity = '1';
    statusDiv.style.transition = 'opacity 0.5s ease-out';
    setTimeout(() => {
        statusDiv.style.opacity = '0';
        setTimeout(() => {
            statusDiv.innerHTML = '';
        }, 500);
    }, 3000);
}

// --- 익명 로그인 처리 로직 ---
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("Firebase Anonymous User UID:", user.uid);
        gameState.playerUID = user.uid;
        gameState.isAuthReady = true;
        updateButtonStates();
        
        // URL 파라미터 체크 (자동 입장)
        checkURLParams();
    } else {
        console.log("No Firebase user logged in. Signing in anonymously...");
        gameState.isAuthReady = false;
        updateButtonStates();
        
        auth.signInAnonymously()
            .then(() => {
                // 성공적으로 익명 로그인되었으므로, onAuthStateChanged 콜백이 다시 호출될 것입니다.
            })
            .catch((error) => {
                console.error("Error signing in anonymously:", error);
                showMessage('게임에 접속할 수 없습니다. 페이지를 새로고침해주세요.', 'error');
                gameState.isAuthReady = false;
                updateButtonStates();
            });
    }
});

// 비밀번호 입력 팝업 생성 함수
function createPasswordPrompt() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'password-overlay';

        const promptBox = document.createElement('div');
        promptBox.className = 'password-prompt';
        promptBox.innerHTML = `
            <h3>방장이 되려면 비밀번호를 입력하세요.</h3>
            <input type="password" id="host-password-input" placeholder="비밀번호">
            <button id="password-submit-btn">확인</button>
            <button id="password-cancel-btn">취소</button>
        `;
        overlay.appendChild(promptBox);
        document.body.appendChild(overlay);

        const passwordInput = document.getElementById('host-password-input');
        const submitBtn = document.getElementById('password-submit-btn');
        const cancelBtn = document.getElementById('password-cancel-btn');

        const cleanup = () => {
            document.body.removeChild(overlay);
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            passwordInput.removeEventListener('keypress', handleKeyPress);
        };

        const handleSubmit = () => {
            const password = passwordInput.value;
            cleanup();
            resolve(password);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKeyPress = (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        };

        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        passwordInput.addEventListener('keypress', handleKeyPress);
        passwordInput.focus();
    });
}

// 방 생성 (호스트 비밀번호 필요)
async function createRoom() {
    const playerNameInput = document.getElementById('player-name').value.trim();
    if (!playerNameInput) {
        showMessage('플레이어 이름을 입력해주세요!', 'error');
        return;
    }

    // 인증 상태 확인
    if (!gameState.isAuthReady || !gameState.playerUID) {
        showMessage('아직 로그인 중입니다. 잠시 후 다시 시도해주세요.', 'error');
        return;
    }

    // HOST_PASSWORD는 constants.js에서 전역으로 가져옴
    const password = await createPasswordPrompt();
    if (password !== HOST_PASSWORD) {
        showMessage('비밀번호가 올바르지 않거나 취소되었습니다!', 'error');
        return;
    }

    try {
        gameState.isHost = true;
        gameState.playerName = playerNameInput;
        gameState.roomCode = generateRoomCode();
        gameState.maxPlayers = parseInt(document.getElementById('max-players-create').value);
        
        gameState.roomRef = database.ref('rooms/' + gameState.roomCode);
        
        await gameState.roomRef.set({
            host: gameState.playerUID,
            players: {
                [gameState.playerUID]: {
                    name: gameState.playerName,
                    isHost: true,
                    joinedAt: Date.now(),
                    boardState: {}
                }
            },
            missions: gameState.missions,
            gameStarted: false,
            winCondition: 1,
            boardSize: gameState.boardSize,
            maxPlayers: gameState.maxPlayers,
            createdAt: Date.now(),
            flippedNumbers: {},
            // currentTurn: 0, // 턴 개념 제거로 삭제
            winner: null,
            gameEnded: false,
            missionMap: {},
            bingoClaimed: null,
            playerOrderUids: [gameState.playerUID]
        });

        setupRoomListeners();
        
        const shareLink = `${window.location.origin}${window.location.pathname}?room=${gameState.roomCode}`;
        document.getElementById('share-link').value = shareLink;
        document.getElementById('share-section').classList.remove('hidden');
        
        showMessage(`방이 생성되었습니다! 방 코드: ${gameState.roomCode}`, 'success');
        
    } catch (error) {
        showMessage('방 생성에 실패했습니다: ' + error.message, 'error');
        console.error('방 생성 오류:', error);
    }
}

// 방 입장 UI 표시
function showJoinRoom() {
    document.getElementById('join-room-section').classList.remove('hidden');
    document.getElementById('create-room-btn').classList.add('hidden-by-url-param');
    document.getElementById('max-players-create-group').classList.add('hidden-by-url-param');
    document.getElementById('main-action-buttons').classList.add('hidden-by-url-param');
}

// 방 입장
async function joinRoom(prefilledRoomCode = null) {
    const playerNameInput = document.getElementById('player-name').value.trim();
    const roomCode = prefilledRoomCode || document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!playerNameInput) {
        showMessage('플레이어 이름을 입력해주세요!', 'error');
        return;
    }
    
    if (!roomCode) {
        showMessage('방 코드를 입력해주세요!', 'error');
        return;
    }

    // 인증 상태 확인
    if (!gameState.isAuthReady || !gameState.playerUID) {
        showMessage('아직 로그인 중입니다. 잠시 후 다시 시도해주세요.', 'error');
        return;
    }

    try {
        gameState.isHost = false;
        gameState.playerName = playerNameInput;
        gameState.roomCode = roomCode;
        gameState.roomRef = database.ref('rooms/' + roomCode);

        const snapshot = await gameState.roomRef.once('value');
        if (!snapshot.exists()) {
            showMessage('존재하지 않는 방 코드입니다!', 'error');
            return;
        }

        const roomData = snapshot.val();
        if (roomData.gameStarted) {
            showMessage('이미 시작된 게임입니다!', 'error');
            return;
        }
        
        const currentPlayersCount = Object.keys(roomData.players || {}).length;
        if (roomData.maxPlayers && currentPlayersCount >= roomData.maxPlayers) {
            showMessage(`이 방은 최대 ${roomData.maxPlayers}명까지 참여 가능합니다. 현재 인원: ${currentPlayersCount}명`, 'error');
            return;
        }

        if (roomData.players && roomData.players[gameState.playerUID]) {
             showMessage('이미 이 방에 접속 중입니다.', 'info');
             setupRoomListeners();
             return;
        }

        const existingPlayerNames = Object.values(roomData.players || {}).map(p => p.name);
        if (existingPlayerNames.includes(playerNameInput)) {
            showMessage('이미 사용 중인 이름입니다. 다른 이름을 선택해주세요!', 'error');
            return;
        }

        await gameState.roomRef.child('players').child(gameState.playerUID).set({
            name: gameState.playerName,
            isHost: false,
            joinedAt: Date.now(),
            boardState: {}
        });

        await gameState.roomRef.child('playerOrderUids').transaction((currentUids) => {
            const uids = currentUids || [];
            if (!uids.includes(gameState.playerUID)) {
                uids.push(gameState.playerUID);
            }
            return uids;
        });

        gameState.boardSize = roomData.boardSize || 3;
        gameState.maxPlayers = roomData.maxPlayers || 2;
        
        setupRoomListeners();
        showMessage(`방에 입장했습니다! 방 코드: ${roomCode}`, 'success');
        
    } catch (error) {
        showMessage('방 입장에 실패했습니다: ' + error.message, 'error');
        console.error('방 입장 오류:', error);
    }
}

// 방 데이터 리스너 설정
function setupRoomListeners() {
    if (!gameState.roomRef) return;

    gameState.roomRef.on('value', (snapshot) => {
        const roomData = snapshot.val();
        if (roomData) {
            gameState.boardSize = roomData.boardSize || 3;
            gameState.maxPlayers = roomData.maxPlayers || 2;
            gameState.gameStarted = roomData.gameStarted || false;
            gameState.winCondition = roomData.winCondition || 1;
            // gameState.currentTurn = roomData.currentTurn !== null ? roomData.currentTurn : 0; // 턴 개념 제거로 삭제
            gameState.missionMap = roomData.missionMap || {};
            gameState.flippedNumbers = Object.keys(roomData.flippedNumbers || {}).map(Number);
            
            if (roomData.players) {
                gameState.players = roomData.players;
                gameState.playerList = roomData.playerOrderUids || [];
            } else {
                gameState.players = {};
                gameState.playerList = [];
            }
            updatePlayersDisplay();
            
            // 호스트가 아니더라도 Firebase에서 미션 목록을 받아와 업데이트
            gameState.missions = roomData.missions || [];
            updateMissionsDisplay();

            if (gameState.gameStarted) {
                document.getElementById('game-setup').style.display = 'none';
                document.getElementById('game-area').style.display = 'block';
                document.getElementById('current-room-code').textContent = gameState.roomCode;
                document.getElementById('flipped-numbers-count').textContent = gameState.flippedNumbers.length;
                
                const totalCells = gameState.boardSize * gameState.boardSize;
                if (gameState.bingoBoard.length !== totalCells || document.getElementById('bingo-board').children.length !== totalCells) {
                        if (Object.keys(gameState.missionMap).length === totalCells) {
                            generateBingoBoard();
                        }
                }
            } else {
                document.getElementById('game-setup').style.display = 'block';
                document.getElementById('game-area').style.display = 'none';
            }

            // updateTurnDisplay(); // 턴 개념 제거로 삭제
            if (gameState.players[gameState.playerUID] && gameState.players[gameState.playerUID].boardState) {
                syncBingoBoard(gameState.players[gameState.playerUID].boardState);
            } else {
                syncBingoBoard({});
            }
            
            checkBingoPossibility();
            updateBingoCellClickability(); // 턴 개념 제거에 따라 내부 로직 수정됨
            
            // 선공 플레이어 섹션 관련 로직은 이미 이전 단계에서 제거했으므로 더 이상 수정할 필요 없습니다.

            if (roomData.winner) {
                displayWinnerMessage(roomData.winner, roomData.winCondition);
                document.getElementById('bingo-button').disabled = true;
                // document.getElementById('turn-end-button').disabled = true; // 턴 개념 제거로 삭제됨
                document.getElementById('bingo-button').style.display = 'none';
                // document.getElementById('turn-end-button').style.display = 'none'; // 턴 개념 제거로 삭제됨
            } else {
                const winnerOverlay = document.getElementById('winner-overlay');
                if (winnerOverlay) winnerOverlay.remove();
                if (gameState.gameStarted) {
                    document.getElementById('bingo-button').style.display = 'block';
                    // document.getElementById('turn-end-button').style.display = 'block'; // 턴 개념 제거로 삭제됨
                }
            }
            // 미션 추가 버튼 활성화/비활성화
            document.getElementById('add-mission-btn').disabled = !gameState.roomCode;
        }
    });
}

// 미션 추가
async function addMission() {
    if (!gameState.roomCode) {
        showMessage('먼저 방에 입장하거나 생성해주세요!', 'error');
        return;
    }

    const missionInput = document.getElementById('mission-input');
    const mission = missionInput.value.trim();
    
    if (!mission) {
        showMessage('미션 내용을 입력해주세요!', 'error');
        return;
    }
    
    // Firebase에서 최신 미션 목록을 가져와 중복 확인
    const snapshot = await gameState.roomRef.child('missions').once('value');
    const currentMissionsInFirebase = snapshot.val() || [];

    if (currentMissionsInFirebase.includes(mission)) {
        showMessage('이미 추가된 미션입니다!', 'error');
        return;
    }
    
    try {
        // 트랜잭션을 사용하여 동시성 문제 방지
        await gameState.roomRef.child('missions').transaction((currentData) => {
            const newMissions = currentData || [];
            if (!newMissions.includes(mission)) {
                newMissions.push(mission);
            }
            return newMissions;
        });
        
        missionInput.value = '';
        showMessage('미션이 추가되었습니다! ✨', 'success');
        
    } catch (error) {
        showMessage('미션 추가에 실패했습니다: ' + error.message, 'error');
        console.error('미션 추가 오류:', error);
    }
}

// 미션 삭제
async function deleteMission(index) {
    if (!gameState.isHost) {
        showMessage('방장만 미션을 삭제할 수 있습니다!', 'error');
        return;
    }
    if (!gameState.roomCode) {
        showMessage('방에 입장하지 않았습니다!', 'error');
        return;
    }

    try {
        // Firebase에서 최신 미션 목록을 가져와 삭제
        await gameState.roomRef.child('missions').transaction((currentMissions) => {
            if (currentMissions && currentMissions.length > index) {
                const newMissions = currentMissions.filter((_, i) => i !== index);
                return newMissions;
            }
            return undefined; // 트랜잭션 취소
        });
        showMessage('미션이 삭제되었습니다! 🗑️', 'success');
    } catch (error) {
        showMessage('미션 삭제에 실패했습니다: ' + error.message, 'error');
        console.error('미션 삭제 오류:', error);
    }
}

// 미션 저장 함수
function saveMissions() {
    try {
        localStorage.setItem('savedBingoMissions', JSON.stringify(gameState.missions));
        showMessage('현재 미션 목록이 저장되었습니다! ✅', 'success');
    } catch (e) {
        showMessage('미션 저장에 실패했습니다. 브라우저 저장 공간이 부족할 수 있습니다.', 'error');
        console.error("Failed to save missions to localStorage:", e);
    }
}

// 미션 불러오기 함수
function loadMissions() {
    try {
        const savedMissions = localStorage.getItem('savedBingoMissions');
        if (savedMissions) {
            gameState.missions = JSON.parse(savedMissions);
            showMessage('저장된 미션 목록을 불러왔습니다! 📝', 'success');
        } else {
            // defaultMissions는 constants.js에서 전역으로 가져옴
            gameState.missions = [...defaultMissions];
            showMessage('저장된 미션이 없습니다. 기본 미션 목록을 불러왔습니다. ℹ️', 'info');
        }
        updateMissionsDisplay();
    } catch (e) {
        showMessage('미션 불러오기에 실패했습니다. ❌', 'error');
        console.error("Failed to load missions from localStorage:", e);
        gameState.missions = [...defaultMissions];
        updateMissionsDisplay();
    }
}

// 게임 시작
async function startGame() {
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
        const winCondition = document.querySelector('input[name="win-condition"]:checked').value;
        const selectedBoardSize = 3;
        const selectedMaxPlayers = gameState.maxPlayers;
        
        console.log('Firebase room 업데이트 시도');
        await gameState.roomRef.update({
            gameStarted: true,
            winCondition: parseInt(winCondition),
            boardSize: selectedBoardSize,
            maxPlayers: selectedMaxPlayers,
            startedAt: firebase.database.ServerValue.TIMESTAMP,
            // currentTurn: 0, // 턴 개념 제거로 삭제
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

// updateFirstPlayerOptions 함수 전체 삭제됨 (턴 개념 제거로 불필요)

// updateTurnDisplay 함수 전체 삭제됨 (턴 개념 제거로 불필요)

// 빙고판 UI 동기화
function syncBingoBoard(myBoardStateData) {
    const totalCells = gameState.boardSize * gameState.boardSize;

    if (Object.keys(gameState.missionMap).length === 0 || gameState.bingoBoard.length === 0) {
        if (gameState.gameStarted && Object.keys(gameState.missionMap).length === totalCells) {
            generateBingoBoard();
        } else if (gameState.gameStarted && Object.keys(gameState.missionMap).length === 0) {
            console.warn("syncBingoBoard: Waiting for missionMap to load...");
            setTimeout(() => syncBingoBoard(myBoardStateData), 100);
            return;
        } else {
            return;
        }
    }
    
    const bingoBoardElement = document.getElementById('bingo-board');
    if (bingoBoardElement.children.length === 0 || bingoBoardElement.children.length !== totalCells) {
        console.warn("syncBingoBoard: Waiting for bingo board DOM to be generated...");
        setTimeout(() => syncBingoBoard(myBoardStateData), 50);
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

// 빙고 셀 클릭 가능 여부 업데이트
function updateBingoCellClickability() {
    const cells = document.querySelectorAll('.bingo-cell');
    // const currentPlayerUid = gameState.playerList[gameState.currentTurn]; // 턴 개념 제거로 삭제
    // const isMyTurn = currentPlayerUid === gameState.playerUID; // 턴 개념 제거로 삭제
    
    const gameEnded = gameState.gameStarted && (gameState.roomRef && gameState.roomRef.gameEnded || gameState.roomRef && gameState.roomRef.winner);

    cells.forEach((cellElement, index) => {
        // const cellNumber = gameState.bingoBoard[index].number; // 턴 개념 제거로 불필요해짐 (아래 로직에서 직접 참조하지 않음)
        // const isFlippedCommon = gameState.flippedNumbers.includes(cellNumber); // 턴 개념 제거로 불필요해짐 (아래 로직에서 직접 참조하지 않음)

        if (gameEnded) {
            cellElement.style.pointerEvents = 'none';
            cellElement.style.opacity = '0.7';
        } else if (gameState.gameStarted) { // 게임이 시작되면 항상 클릭 가능
            cellElement.style.pointerEvents = 'auto';
            cellElement.style.opacity = '1';
        } else { // 게임 시작 전
            cellElement.style.pointerEvents = 'none';
            cellElement.style.opacity = '0.5';
        }
        // 기존 턴 관련 로직 (isMyTurn, hasMadeMoveInTurn)을 모두 제거합니다.
    });
}

// 빙고 가능 여부 확인
function checkBingoPossibility() {
    const board = gameState.bingoBoard;
    const size = gameState.boardSize;
    const requiredLines = gameState.winCondition;
    let completedLines = 0;
    const bingoButton = document.getElementById('bingo-button');
    // const turnEndButton = document.getElementById('turn-end-button'); // 턴 개념 제거로 삭제됨
    // const currentPlayerUid = gameState.playerList[gameState.currentTurn]; // 턴 개념 제거로 삭제
    // const isMyTurn = currentPlayerUid === gameState.playerUID; // 턴 개념 제거로 삭제

    if (!gameState.gameStarted || !gameState.roomRef) {
        gameState.canClaimBingo = false;
        bingoButton.disabled = true;
        // turnEndButton.disabled = true; // 턴 개념 제거로 삭제됨
        return;
    }

    gameState.roomRef.once('value').then(snapshot => {
        const roomData = snapshot.val();
        if (!roomData) return;

        if (roomData.gameEnded || roomData.winner) {
            bingoButton.disabled = true;
            // turnEndButton.disabled = true; // 턴 개념 제거로 삭제됨
            bingoButton.style.display = 'none';
            // turnEndButton.style.display = 'none'; // 턴 개념 제거로 삭제됨
            return;
        } else {
            bingoButton.style.display = 'block';
            // turnEndButton.style.display = 'block'; // 턴 개념 제거로 삭제됨
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

        // turnEndButton.disabled = !isMyTurn || roomData.gameEnded || roomData.winner || !gameState.hasMadeMoveInTurn; // 턴 개념 제거로 삭제됨

    }).catch(error => {
        console.error("Error checking bingo possibility:", error);
        showMessage("빙고/턴 상태 확인 중 오류 발생!", "error");
        bingoButton.disabled = true;
        // turnEndButton.disabled = true; // 턴 개념 제거로 삭제됨
    });
}
// turnEnd 함수 전체 삭제됨 (턴 개념 제거로 불필요)

// 빙고 승리 주장
async function claimBingo() {
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
        // document.getElementById('turn-end-button').style.display = 'none'; // 턴 개념 제거로 삭제됨
    } catch (error) {
        showMessage('빙고 주장 중 오류가 발생했습니다: ' + error.message, 'error');
        console.error('Claim Bingo Error:', error);
    }
}

// 승리 메시지 표시
function displayWinnerMessage(winnerName, winCondition) {
    if (document.getElementById('winner-overlay')) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.classList.add('winner-overlay');
    overlay.id = 'winner-overlay';

    const messageBox = document.createElement('div');
    messageBox.classList.add('winner-message');
    messageBox.innerHTML = `
        <p class="emoji">🎉🏆</p>
        <p class="winner-text gradient-text">${winnerName}님</p>
        <p class="winner-text gradient-text">${winCondition}줄 빙고로 승리했습니다!</p>
        <button class="btn btn-primary" onclick="closeWinnerMessage()">확인</button>
    `;
    overlay.appendChild(messageBox);
    document.body.appendChild(overlay);
}

// 승리 메시지 닫기
function closeWinnerMessage() {
    const overlay = document.getElementById('winner-overlay');
    if (overlay) {
        overlay.remove();
        if (confirm('설정 화면으로 돌아가시겠습니까?')) {
            backToSetup();
        }
    }
}

// 설정 화면으로 돌아가기
function backToSetup() {
    document.getElementById('game-setup').style.display = 'block';
    document.getElementById('game-area').style.display = 'none';
    
    if (gameState.roomRef && gameState.playerUID) {
        gameState.roomRef.off();
        // 플레이어가 방을 나갈 때만 Firebase에서 플레이어 정보 삭제
        // 호스트가 나갈 때 방 전체를 삭제하는 로직은 추가하지 않음 (게임의 일관성을 위해)
        const playerRef = gameState.roomRef.child('players').child(gameState.playerUID);
        const playerSnapshot = await playerRef.once('value');
        if (playerSnapshot.exists()) {
            await playerRef.remove();
            console.log(`플레이어 ${gameState.playerName}이(가) 방을 나갑니다. UID: ${gameState.playerUID}`);
            // playerOrderUids 배열에서도 해당 UID 제거
            await gameState.roomRef.child('playerOrderUids').transaction((currentUids) => {
                if (currentUids) {
                    return currentUids.filter(uid => uid !== gameState.playerUID);
                }
                return [];
            });
        }
    }
    
    const oldPlayerUID = gameState.playerUID;
    gameState = {
        isHost: false,
        roomCode: '',
        playerName: '',
        playerUID: oldPlayerUID,
        players: {},
        missions: [],
        isAuthReady: true, // 로그인 상태 유지
        winCondition: 1,
        boardSize: 3,
        maxPlayers: 2,
        gameStarted: false,
        bingoBoard: [],
        // currentTurn: 0, // 턴 개념 제거로 삭제
        playerList: [],
        roomRef: null,
        missionMap: {},
        canClaimBingo: false,
        flippedNumbers: [],
        // hasMadeMoveInTurn: false // 턴 개념 제거로 삭제
    };
    
    // UI 초기화
    document.getElementById('players-list').innerHTML = '<div class="loading">방에 입장하면 참가자가 표시됩니다</div>';
    document.getElementById('missions-list').innerHTML = `<div style="text-align: center; color: #a0aec0; padding: 20px;">미션을 추가해주세요 (최소 ${gameState.boardSize * gameState.boardSize}개 필요)</div>`;
    document.getElementById('current-mission-count').textContent = '현재 등록된 미션: 0개';
    document.getElementById('share-section').classList.add('hidden');
    document.getElementById('join-room-section').classList.add('hidden');
    document.getElementById('auto-join-hint').classList.add('hidden');
    
    document.getElementById('create-room-btn').classList.remove('hidden-by-url-param');
    document.getElementById('max-players-create-group').classList.remove('hidden-by-url-param');
    document.getElementById('main-action-buttons').classList.remove('hidden-by-url-param');

    document.getElementById('room-code').readOnly = false;
    // document.getElementById('first-player-section').classList.add('hidden'); // 이미 이전 단계에서 HTML에서 삭제됨
    document.getElementById('player-name').value = '';
    document.getElementById('room-code').value = '';
    document.getElementById('bingo-button').style.display = 'block';
    document.getElementById('bingo-button').disabled = true;
    document.getElementById('turn-end-button').style.display = 'none'; // 턴 종료 버튼을 항상 숨김
    // document.getElementById('turn-end-button').disabled = true; // 턴 개념 제거로 삭제됨
    
    const winnerOverlay = document.getElementById('winner-overlay');
    if (winnerOverlay) {
        winnerOverlay.remove();
    }

    document.getElementById('size-3').checked = true;
    document.getElementById('win-1').checked = true;
    document.getElementById('max-players-create').value = 2;
    document.getElementById('flipped-numbers-count').textContent = '0';
    document.getElementById('game-options-section').classList.remove('hidden');

    loadMissions();
    updateButtonStates();
}

// 방 코드 생성
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 플레이어 목록 업데이트
function updatePlayersDisplay() {
    const playersList = document.getElementById('players-list');
    const playersArray = Object.values(gameState.players);
    
    if (playersArray.length === 0) {
        playersList.innerHTML = '<div class="loading">방에 입장하면 참가자가 표시됩니다</div>';
        return;
    }
    
    // playerList (UID 순서)에 따라 정렬하여 표시
    const sortedPlayers = gameState.playerList
        .map(uid => gameState.players[uid])
        .filter(player => player !== undefined); // 방을 나간 플레이어는 제외

    playersList.innerHTML = sortedPlayers.map(player =>
        `<div class="player-item ${player.isHost ? 'host' : ''}">
            ${player.isHost ? '👑' : '👤'} ${player.name} ${player.isHost ? '(방장)' : ''}
        </div>`
    ).join('');

    const startBtn = document.getElementById('start-game-btn');
    if (gameState.isHost) {
        startBtn.style.display = 'block';
        startBtn.textContent = '🎮 게임 시작!';
        startBtn.disabled = false;
    } else {
        startBtn.style.display = 'block';
        startBtn.textContent = '방장이 게임을 시작하기를 기다리는 중...';
        startBtn.disabled = true;
    }
}

// 미션 목록 UI 업데이트
function updateMissionsDisplay() {
    const missionsList = document.getElementById('missions-list');
    const requiredMissions = gameState.boardSize * gameState.boardSize;

    if (gameState.missions.length === 0) {
        missionsList.innerHTML = `<div style="text-align: center; color: #a0aec0; padding: 20px;">미션을 추가해주세요 (최소 ${requiredMissions}개 필요)</div>`;
    } else {
        missionsList.innerHTML = gameState.missions.map((mission, index) =>
            `<div class="mission-item">
                <span>📌 ${mission}</span>
                ${gameState.isHost ? `<button class="delete-btn" onclick="deleteMission(${index})">삭제</button>` : ''}
            </div>`
        ).join('');
    }

    document.getElementById('current-mission-count').textContent = `현재 등록된 미션: ${gameState.missions.length}개`;
}

// 빙고판 생성
function generateBingoBoard() {
    const size = gameState.boardSize;
    const totalCells = size * size;

    if (Object.keys(gameState.missionMap).length === 0 || Object.keys(gameState.missionMap).length !== totalCells) {
        console.warn('generateBingoBoard: Mission map is not fully loaded yet or size mismatch. Retrying in 100ms...');
        setTimeout(generateBingoBoard, 100);
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
        `<div class="bingo-cell" onclick="flipCell(${index})">${cell.number}</div>`
    ).join('');

    updateBingoCellClickability();
}

// 셀 뒤집기
async function flipCell(index) {
    const roomSnapshot = await gameState.roomRef.once('value');
    const roomData = roomSnapshot.val();
    
    if (roomData.gameEnded || roomData.winner) {
        showMessage('게임이 이미 종료되었거나 승자가 결정되었습니다!', 'error');
        return;
    }
    
    const selectedNumber = gameState.bingoBoard[index].number;
    const missionToAssign = gameState.bingoBoard[index].mission;
    // const currentPlayerUidInRoom = gameState.playerList[gameState.currentTurn]; // 턴 개념 제거로 삭제
    // const isMyTurn = gameState.playerUID === currentPlayerUidInRoom; // 턴 개념 제거로 삭제

    try {
        const isFlippedCommon = gameState.flippedNumbers.includes(selectedNumber);
        const myCurrentState = roomData.players[gameState.playerUID]?.boardState?.[selectedNumber]?.state || 'unflipped';

        if (!isFlippedCommon) {
            // 턴에 상관없이 모두가 공통 셀을 뒤집을 수 있도록 변경
            const flippedResult = await gameState.roomRef.child('flippedNumbers').child(selectedNumber).transaction((currentValue) => {
                if (currentValue === null) {
                    return true;
                }
                return undefined; // 이미 뒤집혔으면 트랜잭션 취소
            });

            if (!flippedResult.committed) {
                // 이미 뒤집힌 경우지만, 다른 플레이어가 먼저 뒤집었을 수 있음. 메시지는 유지.
                showMessage('이미 다른 플레이어가 이 숫자를 뒤집었습니다.', 'error');
                // 이 상황에서도 로컬 보드 상태 업데이트는 진행하여 일관성 유지
            }
        }

        const myBoardStateRef = gameState.roomRef.child(`players/${gameState.playerUID}/boardState/${selectedNumber}`);
        
        const boardStateResult = await myBoardStateRef.transaction((currentMyStateData) => {
            let stateForMeInFirebase = currentMyStateData ? currentMyStateData.state : 'unflipped';
            let nextStateForMe;

            if (isFlippedCommon) { // 이미 공통으로 뒤집힌 셀을 다시 클릭하는 경우 (개인 빙고판에서 상태 변경)
                if (stateForMeInFirebase === 'flipped') {
                    nextStateForMe = 'failed';
                } else if (stateForMeInFirebase === 'failed') {
                    nextStateForMe = 'flipped';
                } else { // 'unflipped'인데 isFlippedCommon이면 (다른 사람이 이미 뒤집었을 때)
                    nextStateForMe = 'flipped';
                }
            } else { // 아직 공통으로 뒤집히지 않은 셀을 클릭하는 경우
                if (stateForMeInFirebase === 'unflipped') { // 첫 클릭은 flipped
                    nextStateForMe = 'flipped';
                } else if (stateForMeInFirebase === 'failed') { // 실패했던걸 다시 원래대로 돌릴 때
                    nextStateForMe = 'unflipped';
                } else { // 다른 상태 (방어 코드)
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

// 공유 링크 복사
function copyShareLink() {
    const shareLinkInput = document.getElementById('share-link');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareLinkInput.value)
            .then(() => {
                showMessage('링크가 클립보드에 복사되었습니다! 📋', 'success');
            })
            .catch(err => {
                console.error('클립보드 복사 실패:', err);
                try {
                    shareLinkInput.select();
                    shareLinkInput.setSelectionRange(0, 99999);
                    document.execCommand('copy');
                    showMessage('링크가 복사되었습니다! (구형 방식) 📋', 'success');
                } catch (execErr) {
                    prompt('링크를 수동으로 복사하세요:', shareLinkInput.value);
                }
            });
    } else {
        try {
            shareLinkInput.select();
            shareLinkInput.setSelectionRange(0, 99999);
            document.execCommand('copy');
            showMessage('링크가 복사되었습니다! (구형 방식) 📋', 'success');
        } catch (execErr) {
            prompt('링크를 수동으로 복사하세요:', shareLinkInput.value);
        }
    }
}

// URL 파라미터 확인 및 자동 입장
function checkURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    if (roomCode) {
        const upperRoomCode = roomCode.toUpperCase();
        console.log('🎯 URL에서 방 코드 발견:', upperRoomCode);
        
        setTimeout(() => performAutoJoin(upperRoomCode), 0);
        return true;
    } else {
        console.log('❌ URL에 방 코드 없음');
        return false;
    }
}

// 자동 입장 실행
function performAutoJoin(roomCode) {
    console.log('🚀 자동 입장 프로세스 시작:', roomCode);
    
    const joinSection = document.getElementById('join-room-section');
    const roomCodeInput = document.getElementById('room-code');
    const nameInput = document.getElementById('player-name');
    const hintElement = document.getElementById('auto-join-hint');
    const createRoomControls = document.querySelector('.create-room-controls');
    const mainActionButtons = document.getElementById('main-action-buttons');
    const gameOptionsSection = document.getElementById('game-options-section');

    if (!joinSection || !roomCodeInput || !nameInput || !hintElement || !createRoomControls || !mainActionButtons || !gameOptionsSection) {
        console.error('❌ 필요한 DOM 요소를 찾을 수 없음. 재시도합니다.');
        setTimeout(() => performAutoJoin(roomCode), 100);
        return;
    }
    
    console.log('✅ DOM 요소 모두 준비됨');
    
    createRoomControls.classList.add('hidden-by-url-param');
    mainActionButtons.classList.add('hidden-by-url-param');

    joinSection.classList.remove('hidden');
    roomCodeInput.value = roomCode;
    roomCodeInput.readOnly = true;
    nameInput.placeholder = '닉네임을 입력하고 입장하세요!';
    
    hintElement.classList.remove('hidden');
    gameOptionsSection.classList.add('hidden');

    if (document.activeElement !== nameInput) {
        nameInput.focus();
    }

    showMessage(`🎉 초대 링크로 접속했습니다! 방 코드: ${roomCode}\n닉네임을 입력하고 입장하세요!`, 'success');
    
    const currentAutoJoinHandler = nameInput._autoJoinHandler;
    if (currentAutoJoinHandler) {
        nameInput.removeEventListener('keypress', currentAutoJoinHandler);
    }
    
    const newAutoJoinHandler = function(e) {
        if (e.key === 'Enter' && e.target.value.trim()) {
            console.log('⚡ Enter 키로 자동 입장 시도');
            joinRoom(roomCode);
            nameInput.removeEventListener('keypress', newAutoJoinHandler);
            nameInput._autoJoinHandler = null;
        }
    };
    nameInput.addEventListener('keypress', newAutoJoinHandler);
    nameInput._autoJoinHandler = newAutoJoinHandler;
    
    console.log('✅ 자동 입장 UI 설정 완료');
}

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', () => {
    // 초기 버튼 상태 설정
    updateButtonStates();
    
    document.getElementById('mission-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addMission();
        }
    });

    document.getElementById('room-code').addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });

    document.querySelectorAll('input[name="board-size"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const newSize = parseInt(radio.value);
            gameState.boardSize = newSize;
            updateMissionsDisplay();
        });
    });

    loadMissions();
    // 미션 추가 버튼 초기 상태 설정
    document.getElementById('add-mission-btn').disabled = !gameState.roomCode;
});

// 페이지 이탈 시 정리
window.addEventListener('beforeunload', async function() {
    if (gameState.roomRef && gameState.playerUID) {
        gameState.roomRef.off();
        // 플레이어가 방을 나갈 때만 Firebase에서 플레이어 정보 삭제
        // 호스트가 나갈 때 방 전체를 삭제하는 로직은 추가하지 않음 (게임의 일관성을 위해)
        const playerRef = gameState.roomRef.child('players').child(gameState.playerUID);
        const playerSnapshot = await playerRef.once('value');
        if (playerSnapshot.exists()) {
            await playerRef.remove();
            console.log(`플레이어 ${gameState.playerName}이(가) 방을 나갑니다. UID: ${gameState.playerUID}`);
            // playerOrderUids 배열에서도 해당 UID 제거
            await gameState.roomRef.child('playerOrderUids').transaction((currentUids) => {
                if (currentUids) {
                    return currentUids.filter(uid => uid !== gameState.playerUID);
                }
                return [];
            });
        }
    }
});
