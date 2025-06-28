// 게임 상태 관리
const gameState = {
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
    playerList: [],
    roomRef: null,
    missionMap: {},
    canClaimBingo: false,
    flippedNumbers: [],
    isAuthReady: false
};

// 방 코드 생성
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 게임 상태 초기화
function resetGameState() {
    const oldPlayerUID = gameState.playerUID;
    const oldAuthReady = gameState.isAuthReady;
    
    Object.assign(gameState, {
        isHost: false,
        roomCode: '',
        playerName: '',
        playerUID: oldPlayerUID,
        players: {},
        missions: [],
        isAuthReady: oldAuthReady,
        winCondition: 1,
        boardSize: 3,
        maxPlayers: 2,
        gameStarted: false,
        bingoBoard: [],
        playerList: [],
        roomRef: null,
        missionMap: {},
        canClaimBingo: false,
        flippedNumbers: []
    });
}
