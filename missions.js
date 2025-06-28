// 미션 관리 모듈
class MissionManager {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const missionInput = document.getElementById('mission-input');
        const addBtn = document.getElementById('add-mission-btn');
        const saveBtn = document.getElementById('save-missions-btn');
        const loadBtn = document.getElementById('load-missions-btn');

        if (missionInput) {
            missionInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addMission();
                }
            });
        }

        if (addBtn) addBtn.addEventListener('click', () => this.addMission());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveMissions());
        if (loadBtn) loadBtn.addEventListener('click', () => this.loadMissions());
    }

    async addMission() {
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

    async deleteMission(index) {
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

    saveMissions() {
        try {
            localStorage.setItem('savedBingoMissions', JSON.stringify(gameState.missions));
            showMessage('현재 미션 목록이 저장되었습니다! ✅', 'success');
        } catch (e) {
            showMessage('미션 저장에 실패했습니다. 브라우저 저장 공간이 부족할 수 있습니다.', 'error');
            console.error("Failed to save missions to localStorage:", e);
        }
    }

    loadMissions() {
        try {
            const savedMissions = localStorage.getItem('savedBingoMissions');
            if (savedMissions) {
                gameState.missions = JSON.parse(savedMissions);
                showMessage('저장된 미션 목록을 불러왔습니다! 📝', 'success');
            } else {
                gameState.missions = [...defaultMissions];
                showMessage('저장된 미션이 없습니다. 기본 미션 목록을 불러왔습니다. ℹ️', 'info');
            }
            this.updateMissionsDisplay();
        } catch (e) {
            showMessage('미션 불러오기에 실패했습니다. ❌', 'error');
            console.error("Failed to load missions from localStorage:", e);
            gameState.missions = [...defaultMissions];
            this.updateMissionsDisplay();
        }
    }

    updateMissionsDisplay() {
        const missionsList = document.getElementById('missions-list');
        const requiredMissions = gameState.boardSize * gameState.boardSize;

        if (gameState.missions.length === 0) {
            missionsList.innerHTML = `<div style="text-align: center; color: #a0aec0; padding: 20px;">미션을 추가해주세요 (최소 ${requiredMissions}개 필요)</div>`;
        } else {
            missionsList.innerHTML = gameState.missions.map((mission, index) =>
                `<div class="mission-item">
                    <span>📌 ${mission}</span>
                    ${gameState.isHost ? `<button class="delete-btn" onclick="missionManager.deleteMission(${index})">삭제</button>` : ''}
                </div>`
            ).join('');
        }

        document.getElementById('current-mission-count').textContent = `현재 등록된 미션: ${gameState.missions.length}개`;
    }
}

// 미션 매니저 인스턴스 생성
const missionManager = new MissionManager();
