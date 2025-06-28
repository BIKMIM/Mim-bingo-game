// UI 관리 모듈
class UIManager {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
    const backToSetupBtn = document.getElementById('back-to-setup-btn');
    
    if (backToSetupBtn) backToSetupBtn.addEventListener('click', () => this.backToSetup());
    
    // 보드 크기 변경 이벤트 - 개선된 버전
    document.querySelectorAll('input[name="board-size"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const newSize = parseInt(radio.value);
            gameState.boardSize = newSize;
            
            // 미션 매니저의 디스플레이 업데이트
            missionManager.updateMissionsDisplay();
            
            // 필요한 미션 개수 메시지 업데이트
            const requiredMissions = newSize * newSize;
            showMessage(`${newSize}x${newSize} 보드에는 최소 ${requiredMissions}개의 미션이 필요합니다.`, 'info');
        });
    });
}

    // 상태 메시지 표시
    showMessage(message, type = 'info') {
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

    // UI 버튼 상태 업데이트
    updateButtonStates() {
        const createRoomBtn = document.getElementById('create-room-btn');
        const joinRoomBtn = document.getElementById('join-room-btn');
        
        if (gameState.isAuthReady) {
            createRoomBtn.disabled = false;
            createRoomBtn.innerHTML = '새 방 만들기';
            if (joinRoomBtn) {
                joinRoomBtn.disabled = false;
                joinRoomBtn.innerHTML = '방 입장';
            }
        } else {
            createRoomBtn.disabled = true;
            createRoomBtn.innerHTML = '<span class="loading-indicator"></span>로그인 중...';
            if (joinRoomBtn) {
                joinRoomBtn.disabled = true;
                joinRoomBtn.innerHTML = '<span class="loading-indicator"></span>로그인 중...';
            }
        }
    }

    // 호스트 전용 UI 요소들을 보이거나 숨기기
    updateHostOnlyElements() {
        // 미션 저장/불러오기 버튼들
        const saveMissionsBtn = document.getElementById('save-missions-btn');
        const loadMissionsBtn = document.getElementById('load-missions-btn');
        
        // 게임 옵션 섹션 (빙고판 크기, 승리 조건)
        const gameOptionsSection = document.getElementById('game-options-section');
        
        if (gameState.isHost) {
            // 방장이면 모든 요소 보이기
            if (saveMissionsBtn) saveMissionsBtn.style.display = 'inline-block';
            if (loadMissionsBtn) loadMissionsBtn.style.display = 'inline-block';
            if (gameOptionsSection) gameOptionsSection.style.display = 'block';
        } else {
            // 방장이 아니면 숨기기
            if (saveMissionsBtn) saveMissionsBtn.style.display = 'none';
            if (loadMissionsBtn) loadMissionsBtn.style.display = 'none';
            if (gameOptionsSection) gameOptionsSection.style.display = 'none';
        }
    }

    // 플레이어 목록 업데이트
    updatePlayersDisplay() {
        const playersList = document.getElementById('players-list');
        const playersArray = Object.values(gameState.players);
        
        if (playersArray.length === 0) {
            playersList.innerHTML = '<div class="loading">방에 입장하면 참가자가 표시됩니다</div>';
            return;
        }
        
        const sortedPlayers = gameState.playerList
            .map(uid => gameState.players[uid])
            .filter(player => player !== undefined);

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

        // 호스트 전용 UI 요소들 업데이트
        this.updateHostOnlyElements();
    }

    // 게임 영역 표시
    showGameArea() {
        document.getElementById('game-setup').style.display = 'none';
        document.getElementById('game-area').style.display = 'block';
    }

    // 설정 영역 표시
    showSetupArea() {
        document.getElementById('game-setup').style.display = 'block';
        document.getElementById('game-area').style.display = 'none';
    }

    // 승리 메시지 표시
    displayWinnerMessage(winnerName, winCondition) {
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
            <button class="btn btn-primary" onclick="uiManager.closeWinnerMessage()">확인</button>
        `;
        overlay.appendChild(messageBox);
        document.body.appendChild(overlay);
    }

    // 승리 메시지 닫기
    closeWinnerMessage() {
        const overlay = document.getElementById('winner-overlay');
        if (overlay) {
            overlay.remove();
            if (confirm('설정 화면으로 돌아가시겠습니까?')) {
                this.backToSetup();
            }
        }
    }

    // 설정 화면으로 돌아가기
    backToSetup() {
        this.showSetupArea();
        
        if (gameState.roomRef && gameState.playerUID) {
            gameState.roomRef.off();
            gameState.roomRef.child('players').child(gameState.playerUID).remove()
                .then(() => {
                    console.log(`플레이어 ${gameState.playerName}이(가) 방을 나갑니다. UID: ${gameState.playerUID}`);
                    gameState.roomRef.child('playerOrderUids').transaction((currentUids) => {
                        if (currentUids) {
                            return currentUids.filter(uid => uid !== gameState.playerUID);
                        }
                        return [];
                    });
                })
                .catch(error => {
                    console.error("방 나가기 중 오류 발생:", error);
                });
        }
        
        resetGameState();
        
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
        document.getElementById('player-name').value = '';
        document.getElementById('room-code').value = '';
        document.getElementById('bingo-button').style.display = 'block';
        document.getElementById('bingo-button').disabled = true;
        
        const winnerOverlay = document.getElementById('winner-overlay');
        if (winnerOverlay) {
            winnerOverlay.remove();
        }

        document.getElementById('size-3').checked = true;
        document.getElementById('win-1').checked = true;
        document.getElementById('max-players-create').value = 2;
        document.getElementById('flipped-numbers-count').textContent = '0';
        document.getElementById('game-options-section').classList.remove('hidden');

        missionManager.loadMissions();
        this.updateButtonStates();
    }

    // URL 파라미터 확인 및 자동 입장
    checkURLParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        
        if (roomCode) {
            const upperRoomCode = roomCode.toUpperCase();
            console.log('🎯 URL에서 방 코드 발견:', upperRoomCode);
            
            setTimeout(() => this.performAutoJoin(upperRoomCode), 0);
            return true;
        } else {
            console.log('❌ URL에 방 코드 없음');
            return false;
        }
    }

    // 자동 입장 실행
    performAutoJoin(roomCode) {
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
            setTimeout(() => this.performAutoJoin(roomCode), 100);
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
                roomManager.joinRoom(roomCode);
                nameInput.removeEventListener('keypress', newAutoJoinHandler);
                nameInput._autoJoinHandler = null;
            }
        };
        nameInput.addEventListener('keypress', newAutoJoinHandler);
        nameInput._autoJoinHandler = newAutoJoinHandler;
        
        console.log('✅ 자동 입장 UI 설정 완료');
    }
}

// 전역 showMessage 함수 (호환성 유지)
function showMessage(message, type = 'info') {
    uiManager.showMessage(message, type);
}

// UI 매니저 인스턴스 생성
const uiManager = new UIManager();
