// 방 관리 모듈
class RoomManager {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const createRoomBtn = document.getElementById('create-room-btn');
        const joinRoomBtn = document.getElementById('join-room-btn');
        const showJoinBtn = document.getElementById('show-join-room-btn');
        const copyShareBtn = document.getElementById('copy-share-btn');
        const roomCodeInput = document.getElementById('room-code');

        if (createRoomBtn) createRoomBtn.addEventListener('click', () => this.createRoom());
        if (joinRoomBtn) joinRoomBtn.addEventListener('click', () => this.joinRoom());
        if (showJoinBtn) showJoinBtn.addEventListener('click', () => this.showJoinRoom());
        if (copyShareBtn) copyShareBtn.addEventListener('click', () => this.copyShareLink());
        
        if (roomCodeInput) {
            roomCodeInput.addEventListener('input', function(e) {
                e.target.value = e.target.value.toUpperCase();
            });
        }
    }

    // 비밀번호 입력 팝업
    createPasswordPrompt() {
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

    async createRoom() {
        const playerNameInput = document.getElementById('player-name').value.trim();
        if (!playerNameInput) {
            showMessage('플레이어 이름을 입력해주세요!', 'error');
            return;
        }

        if (!gameState.isAuthReady || !gameState.playerUID) {
            showMessage('아직 로그인 중입니다. 잠시 후 다시 시도해주세요.', 'error');
            return;
        }

        const password = await this.createPasswordPrompt();
        if (password !== HOST_PASSWORD) {
            showMessage('비밀번호가 올바르지 않거나 취소되었습니다!', 'error');
            return;
        }

        try {
    gameState.isHost = true;
    gameState.playerName = playerNameInput;
    gameState.roomCode = generateRoomCode();
    gameState.maxPlayers = parseInt(document.getElementById('max-players-create').value);
    
    // 선택된 보드 크기 반영
    const selectedBoardSize = parseInt(document.querySelector('input[name="board-size"]:checked').value);
    gameState.boardSize = selectedBoardSize;
    
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
        boardSize: gameState.boardSize,  // 선택된 보드 크기 저장
        maxPlayers: gameState.maxPlayers,
        createdAt: Date.now(),
        flippedNumbers: {},
        winner: null,
        gameEnded: false,
        missionMap: {},
        bingoClaimed: null,
        playerOrderUids: [gameState.playerUID]
    });

            this.setupRoomListeners();
            
            const shareLink = `${window.location.origin}${window.location.pathname}?room=${gameState.roomCode}`;
            document.getElementById('share-link').value = shareLink;
            document.getElementById('share-section').classList.remove('hidden');
            
            showMessage(`방이 생성되었습니다! 방 코드: ${gameState.roomCode}`, 'success');
            
        } catch (error) {
            showMessage('방 생성에 실패했습니다: ' + error.message, 'error');
            console.error('방 생성 오류:', error);
        }
    }

    showJoinRoom() {
        document.getElementById('join-room-section').classList.remove('hidden');
        document.getElementById('create-room-btn').classList.add('hidden-by-url-param');
        document.getElementById('max-players-create-group').classList.add('hidden-by-url-param');
        document.getElementById('main-action-buttons').classList.add('hidden-by-url-param');
    }

    async joinRoom(prefilledRoomCode = null) {
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
                this.setupRoomListeners();
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
            
            this.setupRoomListeners();
            showMessage(`방에 입장했습니다! 방 코드: ${roomCode}`, 'success');
            
        } catch (error) {
            showMessage('방 입장에 실패했습니다: ' + error.message, 'error');
            console.error('방 입장 오류:', error);
        }
    }

    setupRoomListeners() {
    if (!gameState.roomRef) return;

    gameState.roomRef.on('value', (snapshot) => {
        const roomData = snapshot.val();
        if (roomData) {
            gameState.boardSize = roomData.boardSize || 3;
            gameState.maxPlayers = roomData.maxPlayers || 2;
            gameState.gameStarted = roomData.gameStarted || false;
            gameState.winCondition = roomData.winCondition || 1;
            gameState.missionMap = roomData.missionMap || {};
            gameState.flippedNumbers = Object.keys(roomData.flippedNumbers || {}).map(Number);
            
            // *** 추가된 부분: Firebase에서 받은 boardSize를 라디오 버튼에 반영 ***
            const boardSizeRadio = document.getElementById(`size-${gameState.boardSize}`);
            if (boardSizeRadio) {
                boardSizeRadio.checked = true;
            }
            
            // *** 추가된 부분: winCondition도 라디오 버튼에 반영 ***
            const winConditionRadio = document.getElementById(`win-${gameState.winCondition}`);
            if (winConditionRadio) {
                winConditionRadio.checked = true;
            }
            
            if (roomData.players) {
                gameState.players = roomData.players;
                gameState.playerList = roomData.playerOrderUids || [];
            } else {
                gameState.players = {};
                gameState.playerList = [];
            }
            
            uiManager.updatePlayersDisplay();
            
            gameState.missions = roomData.missions || [];
            missionManager.updateMissionsDisplay();

            if (gameState.gameStarted) {
                uiManager.showGameArea();
                document.getElementById('current-room-code').textContent = gameState.roomCode;
                document.getElementById('flipped-numbers-count').textContent = gameState.flippedNumbers.length;
                
                const totalCells = gameState.boardSize * gameState.boardSize;
                if (gameState.bingoBoard.length !== totalCells || document.getElementById('bingo-board').children.length !== totalCells) {
                    if (Object.keys(gameState.missionMap).length === totalCells) {
                        bingoManager.generateBingoBoard();
                    }
                }
            } else {
                uiManager.showSetupArea();
            }

            if (gameState.players[gameState.playerUID] && gameState.players[gameState.playerUID].boardState) {
                bingoManager.syncBingoBoard(gameState.players[gameState.playerUID].boardState);
            } else {
                bingoManager.syncBingoBoard({});
            }
            
            bingoManager.checkBingoPossibility();
            bingoManager.updateBingoCellClickability();

            if (roomData.winner) {
                uiManager.displayWinnerMessage(roomData.winner, roomData.winCondition);
                document.getElementById('bingo-button').disabled = true;
                document.getElementById('bingo-button').style.display = 'none';
            } else {
                const winnerOverlay = document.getElementById('winner-overlay');
                if (winnerOverlay) winnerOverlay.remove();
                if (gameState.gameStarted) {
                    document.getElementById('bingo-button').style.display = 'block';
                }
            }
            
            document.getElementById('add-mission-btn').disabled = !gameState.roomCode;
        }
    });
}

    copyShareLink() {
        const shareLinkInput = document.getElementById('share-link');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(shareLinkInput.value)
                .then(() => {
                    showMessage('링크가 클립보드에 복사되었습니다! 📋', 'success');
                })
                .catch(err => {
                    console.error('클립보드 복사 실패:', err);
                    this.fallbackCopy(shareLinkInput);
                });
        } else {
            this.fallbackCopy(shareLinkInput);
        }
    }

    fallbackCopy(input) {
        try {
            input.select();
            input.setSelectionRange(0, 99999);
            document.execCommand('copy');
            showMessage('링크가 복사되었습니다! (구형 방식) 📋', 'success');
        } catch (execErr) {
            prompt('링크를 수동으로 복사하세요:', input.value);
        }
    }
}

// 방 매니저 인스턴스 생성
const roomManager = new RoomManager();
