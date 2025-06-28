// Firebase 설정
const firebaseConfig = {
    apiKey: "AIzaSyAqHKfUCypD_Jk7mXgH5u-O1XS7Dje4DZ8",
    authDomain: "mim-bingo-game.firebaseapp.com",
    databaseURL: "https://mim-bingo-game-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "mim-bingo-game",
    storageBucket: "mim-bingo-game.firebasestorage.app",
    messagingSenderId: "436254307510",
    appId: "1:436254307510:web:23ad7c9a0d10d8ad26217"
};

// Firebase 초기화
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// 호스트 전용 비밀번호
const HOST_PASSWORD = "0804";

// 기본 미션 목록
const defaultMissions = [
    "미션1",
    "미션2", 
    "미션3",
    "미션4",
    "미션5",
    "미션6",
    "미션7",
    "미션8",
    "미션9",
    "미션10"
];
