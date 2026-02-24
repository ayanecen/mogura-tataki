/**
 * game.js - モグラ叩きゲームのロジック
 */

// 難易度設定
const GAME_DURATION = 60;

const DIFFICULTY = {
    easy: {
        spawnInterval: 1500,
        moleDuration: 1200,
        maxMoles: 1
    },
    normal: {
        spawnInterval: 1000,
        moleDuration: 800,
        maxMoles: 1
    },
    hard: {
        spawnInterval: 700,
        moleDuration: 600,
        maxMoles: 2
    }
};

// ゲーム状態
const GAME_STATE = {
    IDLE: 'idle',
    PLAYING: 'playing',
    ENDED: 'ended'
};

// サウンド管理
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    resume() {
        this.init();
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    playHit() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playMiss() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }
}

class Game {
    constructor() {
        this.state = GAME_STATE.IDLE;
        this.score = 0;
        this.timeLeft = 60;
        this.difficulty = 'normal';
        this.isSoundEnabled = true;
        this.timerInterval = null;
        this.spawnInterval = null;
        this.moles = [];
        this.soundManager = new SoundManager();
        window.soundManager = this.soundManager;

        // DOM要素
        this.board = document.getElementById('game-board');
        this.scoreDisplay = document.getElementById('score');
        this.timerDisplay = document.getElementById('timer');
        this.startButton = document.getElementById('start-button');
        this.difficultySelect = document.getElementById('difficulty');
        this.soundToggle = document.getElementById('sound-toggle');
        this.resultModal = document.getElementById('result-modal');
        this.finalScoreDisplay = document.getElementById('final-score');
        this.restartButton = document.getElementById('restart-button');

        this.init();
    }

    init() {
        // ボードの生成 (3x3)
        this.board.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const hole = document.createElement('div');
            hole.className = 'hole';
            hole.dataset.index = i;

            const mole = document.createElement('div');
            mole.className = 'mole';
            mole.innerHTML = `
                <svg viewBox="0 0 100 100" class="mole-svg">
                    <path class="mole-body" d="M20,100 Q20,20 50,20 Q80,20 80,100 Z" />
                    <circle class="mole-eye" cx="40" cy="45" r="4" />
                    <circle class="mole-eye" cx="60" cy="45" r="4" />
                    <circle class="mole-cheek" cx="30" cy="55" r="5" />
                    <circle class="mole-cheek" cx="70" cy="55" r="5" />
                    <circle class="mole-nose" cx="50" cy="52" r="5" />
                    <path class="mole-mouth" d="M45,62 Q50,65 55,62" />
                </svg>
            `;

            hole.appendChild(mole);
            this.board.appendChild(hole);
            this.moles.push({ hole, mole, isShowing: false, isHit: false });

            // クリックイベント
            hole.addEventListener('mousedown', (e) => this.handleMoleClick(i, e));
            // タッチイベント
            hole.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleMoleClick(i, e.touches[0]);
            }, { passive: false });
        }

        // イベントリスナー
        this.startButton.addEventListener('click', () => this.startGame());
        this.restartButton.addEventListener('click', () => this.startGame());
        this.difficultySelect.addEventListener('change', (e) => {
            this.difficulty = e.target.value;
        });
        this.soundToggle.addEventListener('click', () => this.toggleSound());

        // キーボード操作
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.state !== GAME_STATE.PLAYING) {
                    this.startGame();
                }
            }
        });
    }

    startGame() {
        if (this.state === GAME_STATE.PLAYING) return;

        this.soundManager.resume();

        this.state = GAME_STATE.PLAYING;
        this.score = 0;
        this.timeLeft = GAME_DURATION;
        this.updateUI();
        this.resultModal.classList.add('hidden');
        this.startButton.disabled = true;

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            this.timeLeft--;
            this.updateUI();
            if (this.timeLeft <= 0) {
                this.endGame();
            }
        }, 1000);

        if (this.spawnInterval) clearInterval(this.spawnInterval);
        this.spawnLoop();
    }

    spawnLoop() {
        const config = DIFFICULTY[this.difficulty];
        this.spawnInterval = setInterval(() => {
            if (this.state !== GAME_STATE.PLAYING) return;

            const activeMoles = this.moles.filter(m => m.isShowing).length;
            if (activeMoles < config.maxMoles) {
                this.showMole();
            }
        }, config.spawnInterval);
    }

    showMole() {
        const availableMoles = this.moles.filter(m => !m.isShowing);
        if (availableMoles.length === 0) return;

        const moleObj = availableMoles[Math.floor(Math.random() * availableMoles.length)];
        moleObj.isShowing = true;
        moleObj.isHit = false;
        moleObj.mole.classList.add('show');
        moleObj.mole.classList.remove('hit');

        const config = DIFFICULTY[this.difficulty];
        setTimeout(() => {
            this.hideMole(moleObj);
        }, config.moleDuration);
    }

    hideMole(moleObj) {
        moleObj.isShowing = false;
        moleObj.mole.classList.remove('show');
    }

    handleMoleClick(index, event) {
        if (this.state !== GAME_STATE.PLAYING) return;

        const moleObj = this.moles[index];
        if (moleObj.isShowing && !moleObj.isHit) {
            moleObj.isHit = true;
            this.score += 10;
            this.updateUI();

            moleObj.mole.classList.add('hit');
            this.showFloatingScore(event, moleObj.hole);

            this.soundManager.playHit();

            setTimeout(() => this.hideMole(moleObj), 300);
        } else {
            // ミス演出
            moleObj.hole.classList.add('miss');
            setTimeout(() => moleObj.hole.classList.remove('miss'), 200);
            this.soundManager.playMiss();
        }
    }

    showFloatingScore(event, hole) {
        const floating = document.createElement('div');
        floating.className = 'floating-score';
        floating.textContent = '+10';

        let x, y;
        if (event && event.clientX) {
            x = event.clientX;
            y = event.clientY;
        } else {
            const rect = hole.getBoundingClientRect();
            x = rect.left + rect.width / 2;
            y = rect.top;
        }

        floating.style.left = `${x}px`;
        floating.style.top = `${y}px`;

        document.body.appendChild(floating);
        setTimeout(() => floating.remove(), 800);
    }

    toggleSound() {
        this.isSoundEnabled = !this.isSoundEnabled;
        this.soundToggle.textContent = this.isSoundEnabled ? '🔊 ON' : '🔈 OFF';
        this.soundManager.setEnabled(this.isSoundEnabled);
    }

    updateUI() {
        this.scoreDisplay.textContent = this.score;
        this.timerDisplay.textContent = this.timeLeft;
    }

    endGame() {
        this.state = GAME_STATE.ENDED;
        clearInterval(this.timerInterval);
        clearInterval(this.spawnInterval);

        this.finalScoreDisplay.textContent = this.score;
        this.resultModal.classList.remove('hidden');
        this.startButton.disabled = false;

        this.moles.forEach(m => this.hideMole(m));
    }
}

// 初期化
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
