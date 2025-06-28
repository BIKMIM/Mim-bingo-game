// 메인 실행 코드
class App {
    constructor() {
        this.initializeAuth();
        this.setupGlobalEventListeners();
    }

    initializeAuth() {
        // Firebase 인증 상태 변화 리스너
        auth.onAuthStateChanged(user => {
            if (user) {
                console.log("Firebase Anonymous User UID:", user.uid);
                gameState.playerUID = user.uid;
                gameState.isAuthReady = true;
                uiManager.updateButtonStates();
                
                // URL 파라미터 체크 (자동 입장)
                uiManager.checkURLParams();
            } else {
                console.log("No Firebase user logged in. Signing in anonymously...");
                gameState.isAuthReady = false;
                uiManager.updateButtonStates();
                
                auth.signInAnonymously()
                    .then(() => {
                        // 성공적으로 익명 로그인되었으므로, onAuthStateChanged 콜백이 다시 호출될 것입니다.
                    })
                    .catch((error) => {
                        console.error("Error signing in anonymously:", error);
                        showMessage('게임에 접속할 수 없습니다. 페이지를 새로고침해주세요.', 'error');
                        gameState.isAuthReady = false;
                        uiManager.updateButtonStates();
                    });
            }
        });
    }

    setupGlobalEventListeners() {
        // 페이지 로드 완료 시 초기화
        document.addEventListener('DOMContentLoaded', () => {
            uiManager.updateButtonStates();
            missionManager.loadMissions();
            document.getElementById('add-mission-btn').disabled = !gameState.roomCode;
        });

        // 페이지 이탈 시 정리
        window.addEventListener('beforeunload', async () => {
            if (gameState.roomRef && gameState.playerUID) {
                gameState.roomRef.off();
                const playerRef = gameState.roomRef.child('players').child(gameState.playerUID);
                const playerSnapshot = await playerRef.once('value');
                if (playerSnapshot.exists()) {
                    await playerRef.remove();
                    console.log(`플레이어 ${gameState.playerName}이(가) 방을 나갑니다. UID: ${gameState.playerUID}`);
                    await gameState.roomRef.child('playerOrderUids').transaction((currentUids) => {
                        if (currentUids) {
                            return currentUids.filter(uid => uid !== gameState.playerUID);
                        }
                        return [];
                    });
                }
            }
        });

        // 키보드 이벤트 리스너
        document.addEventListener('keydown', (e) => {
            // ESC 키로 승리 메시지 닫기
            if (e.key === 'Escape') {
                const winnerOverlay = document.getElementById('winner-overlay');
                if (winnerOverlay) {
                    uiManager.closeWinnerMessage();
                }
            }
        });
    }
}

// 앱 초기화
const app = new App();
