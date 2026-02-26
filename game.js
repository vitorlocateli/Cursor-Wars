/**
 * Cursor Wars - Phase 3: Enemies & Game Over
 * Developed by Antigravity
 */

class AudioEngine {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTone(frequency, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playShootSound() {
        this.playTone(880, 'square', 0.1, 0.05);
    }

    playExplosionSound() {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        noise.start();
    }

    playGameOverSound() {
        if (!this.ctx) return;
        const notes = [400, 300, 200, 100];
        notes.forEach((freq, index) => {
            setTimeout(() => {
                this.playTone(freq, 'sawtooth', 0.4, 0.1);
            }, index * 200);
        });
    }
}
const audio = new AudioEngine();

// Global game state
const gameState = {
    isInitialized: false,
    isGameOver: false,
    playerShip: null,
    shipX: window.innerWidth / 2, // Default to center
    shipY: window.innerHeight - 50, // Bottom area
    keys: {},
    lastShotTime: 0,
    lasers: [],
    obstacles: [],
    enemies: [],
    enemyLasers: [],
    score: 0,
    scoreElement: null,
    levelElement: null,
    currentLevel: 1,
    isBossFight: false,
    enemySpawnRate: 150, // frames in 60fps
    enemySpeed: 1.5,
    enemyShootChance: 0.015,
    bossObj: null,
    frameCount: 0,
    gameLoopReq: null
};

/**
 * Initialize the game after the corporate "facade" period
 */
function initGame() {
    console.log("Initializing Cursor Wars...");

    document.body.classList.add('game-active');

    // Create the player ship element
    const ship = document.createElement('div');
    ship.id = 'player-ship';
    ship.innerHTML = `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <!-- Left Wing -->
            <path d="M50 0 L15 85 L50 65" fill="#00b0ff" />
            <!-- Right Wing -->
            <path d="M50 0 L85 85 L50 65" fill="#00e5ff" />
            <!-- Cockpit -->
            <ellipse cx="50" cy="45" rx="8" ry="15" fill="#ffffff" opacity="0.8"/>
            <!-- Engine Thrust -->
            <path d="M35 75 L50 100 L65 75 Z" fill="#ff3d00" />
            <path d="M42 75 L50 90 L58 75 Z" fill="#ffea00" />
        </svg>
    `;
    document.body.appendChild(ship);
    gameState.playerShip = ship;

    // Sync Score Board
    gameState.scoreElement = document.getElementById('score-board');
    if (gameState.scoreElement) {
        gameState.scoreElement.innerText = '0';
    }

    // Sync Level Board
    gameState.levelElement = document.getElementById('level-board');
    if (gameState.levelElement) {
        gameState.levelElement.innerText = 'Level: 1';
    }

    // Cache initial obstacles and set health
    gameState.obstacles = Array.from(document.querySelectorAll('.solid-obstacle'));
    gameState.obstacles.forEach(obs => {
        obs.dataset.health = "1.0";
    });

    gameState.isInitialized = true;
    console.log("Game Start! Cursor replaced by ship.");

    // Start Game Loop
    gameState.gameLoopReq = requestAnimationFrame(gameLoop);
}

/**
 * Update tracked keys when pressed
 */
function handleKeyDown(e) {
    if (gameState.isGameOver) return;
    gameState.keys[e.key] = true;

    // Handle shooting with Spacebar (with simple cooldown)
    if ((e.key === ' ' || e.code === 'Space') && gameState.isInitialized) {
        e.preventDefault(); // Prevent default spacebar scrolling

        const now = Date.now();
        if (now - gameState.lastShotTime > 200) {
            fireLaser();
            gameState.lastShotTime = now;
        }
    }
}

function handleKeyUp(e) {
    gameState.keys[e.key] = false;
}

/**
 * Update ship position based on mouse coordinates
 */
function handleMouseMove(e) {
    if (gameState.isGameOver || !gameState.isInitialized) return;
    gameState.shipX = e.clientX;
    gameState.shipY = e.clientY;
}

/**
 * Handle mouse click to fire
 */
function handleMouseClick(e) {
    if (gameState.isGameOver || !gameState.isInitialized) return;

    // Using same cooldown as spacebar
    const now = Date.now();
    if (now - gameState.lastShotTime > 200) {
        fireLaser();
        gameState.lastShotTime = now;
    }
}

/**
 * Fire a laser
 */
function fireLaser() {
    if (!gameState.playerShip || gameState.isGameOver) return;

    audio.init();
    audio.playShootSound();

    const laser = document.createElement('div');
    laser.classList.add('laser');

    laser.style.left = `${gameState.shipX}px`;
    laser.style.top = `${gameState.shipY}px`;

    document.body.appendChild(laser);

    gameState.lasers.push({
        element: laser,
        x: gameState.shipX,
        y: gameState.shipY
    });
}

/**
 * Spawn a new enemy (Popup ad)
 */
function spawnEnemy() {
    const enemy = document.createElement('div');
    enemy.classList.add('enemy-popup');

    // Mock popup content
    enemy.innerHTML = `
        <div class="title">We value your privacy</div>
        <div>Accept cookies to continue.</div>
        <div class="btn">Accept All</div>
    `;

    const enemyWidth = 200;
    // Keep enemy inside horizontal bounds
    const startX = Math.random() * (window.innerWidth - enemyWidth) + (enemyWidth / 2);
    const startY = -100; // Start off-screen

    enemy.style.left = `${startX}px`;
    enemy.style.top = `${startY}px`;

    document.body.appendChild(enemy);

    gameState.enemies.push({
        element: enemy,
        baseX: startX,
        x: startX,
        y: startY,
        width: enemyWidth,
        height: 80 // Approx height based on content
    });
}

/**
 * Spawn enemy projectile
 */
function spawnEnemyLaser(enemyX, enemyY, dx = 0, dy = 7) {
    const laser = document.createElement('div');
    laser.classList.add('enemy-laser');

    laser.style.left = `${enemyX}px`;
    laser.style.top = `${enemyY}px`;

    document.body.appendChild(laser);

    gameState.enemyLasers.push({
        element: laser,
        x: enemyX,
        y: enemyY,
        dx: dx,
        dy: dy
    });
}

/**
 * Update score, HUD and Check Level up
 */
function updateScore(points) {
    gameState.score += points;
    if (gameState.scoreElement) {
        gameState.scoreElement.innerText = gameState.score;
    }

    // Check level up (every 1000 points, normal enemies give 100 per pop)
    if (!gameState.isBossFight && points > 0) {
        const nextLevelThreshold = gameState.currentLevel * 1000;
        if (gameState.score >= nextLevelThreshold) {
            levelUp();
        }
    }
}

function levelUp() {
    gameState.currentLevel++;
    if (gameState.levelElement) {
        gameState.levelElement.innerText = `Level: ${gameState.currentLevel}`;
    }

    // Aumenta a dificuldade
    gameState.enemySpawnRate = Math.max(40, gameState.enemySpawnRate - 20); // Limite de 40 frames min
    gameState.enemySpeed += 0.5;
    gameState.enemyShootChance += 0.005;

    if (gameState.currentLevel % 3 === 0) {
        startBossFight();
    } else {
        showNotification("LEVEL UP!");
    }
}

function showNotification(text) {
    const notif = document.createElement('div');
    notif.id = text === "BOSS DEFEATED" ? 'boss-defeated-msg' : 'level-up-msg';
    notif.innerText = text;
    document.body.appendChild(notif);

    // trigger reflow
    void notif.offsetWidth;
    notif.style.opacity = 1;

    setTimeout(() => {
        notif.style.opacity = 0;
        setTimeout(() => notif.remove(), 500);
    }, 2000);
}

function startBossFight() {
    gameState.isBossFight = true;

    const boss = document.createElement('div');
    boss.classList.add('boss-popup');

    boss.innerHTML = `
        <h2>SYSTEM ERROR<br>CORE CORRUPTED</h2>
        <div style="font-size:12px; margin-bottom: 15px">Please contact system administrator.</div>
        <div class="boss-hp-bar">
            <div class="boss-hp-fill" id="boss-hp-fill"></div>
        </div>
    `;

    const bossWidth = 400;
    const startX = window.innerWidth / 2;
    const startY = 30;

    boss.style.left = `${startX - bossWidth / 2}px`;
    boss.style.top = `${startY}px`;

    document.body.appendChild(boss);

    gameState.bossObj = {
        element: boss,
        x: startX,
        y: startY,
        width: bossWidth,
        height: 150,
        hp: 50,
        maxHp: 50,
        vx: 4 // Horizontal Boss speed
    };
}

/**
 * Triggers Game Over sequence (BSOD)
 */
function gameOver() {
    audio.playGameOverSound();
    gameState.isGameOver = true;
    cancelAnimationFrame(gameState.gameLoopReq);

    // Remove listeners
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('keyup', handleKeyUp);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mousedown', handleMouseClick);

    document.body.style.cursor = 'default';

    // Create BSOD overlay
    const bsod = document.createElement('div');
    bsod.id = 'game-over-screen';
    bsod.innerHTML = `
        <h1>ERROR 404</h1>
        <p>A fatal exception 0E has occurred at 028:C0011E36 in VXD VMM(01) + 00010E36. The current cursor application will be terminated.</p>
        <p>Score: <strong>${gameState.score}</strong> popup(s) blocked.</p>
        <p>* Press the button below to restart your session.<br>* You will lose any unsaved progress.</p>
        <button onclick="location.reload()">RESTART SYSTEM</button>
    `;
    document.body.appendChild(bsod);
}

/**
 * Handles all AABB Collisions
 */
function checkCollisions() {
    const playerRect = gameState.playerShip.getBoundingClientRect();

    // 1. Player Lasers vs Enemies & Obstacles
    for (let i = gameState.lasers.length - 1; i >= 0; i--) {
        const laserObj = gameState.lasers[i];
        const laserRect = laserObj.element.getBoundingClientRect();
        let laserRemoved = false;

        // Check vs Boss
        if (gameState.isBossFight && gameState.bossObj) {
            const boss = gameState.bossObj;
            const bossRect = boss.element.getBoundingClientRect();

            if (
                laserRect.left < bossRect.right &&
                laserRect.right > bossRect.left &&
                laserRect.top < bossRect.bottom &&
                laserRect.bottom > bossRect.top
            ) {
                // Boss hit!
                laserObj.element.remove();
                gameState.lasers.splice(i, 1);
                laserRemoved = true;

                boss.hp -= 1;
                const hpFill = document.getElementById('boss-hp-fill');
                if (hpFill) {
                    hpFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
                }

                audio.playExplosionSound();

                if (boss.hp <= 0) {
                    // Boss defeated
                    boss.element.classList.add('exploding');
                    const el = boss.element;
                    setTimeout(() => {
                        el.remove();
                    }, 300);
                    gameState.bossObj = null;
                    gameState.isBossFight = false; // Retoma os inimigos comuns

                    updateScore(5000); // Bonificação massiva
                    showNotification("BOSS DEFEATED");
                }
                break;
            }
        }

        if (laserRemoved) continue; // Laser already hit the boss

        // Check vs Enemies
        for (let j = gameState.enemies.length - 1; j >= 0; j--) {
            const enemyObj = gameState.enemies[j];
            const enemyRect = enemyObj.element.getBoundingClientRect();

            if (
                laserRect.left < enemyRect.right &&
                laserRect.right > enemyRect.left &&
                laserRect.top < enemyRect.bottom &&
                laserRect.bottom > enemyRect.top
            ) {
                // Enemy hit!
                laserObj.element.remove();
                gameState.lasers.splice(i, 1);
                laserRemoved = true;

                // Explosion effect
                enemyObj.element.classList.add('exploding');
                const el = enemyObj.element;
                setTimeout(() => {
                    el.remove();
                }, 300);
                gameState.enemies.splice(j, 1);

                updateScore(100);
                audio.playExplosionSound();
                break; // Stop checking this laser vs other enemies
            }
        }

        // If laser was not destroyed by an enemy, check vs Obstacles
        if (!laserRemoved) {
            for (let k = gameState.obstacles.length - 1; k >= 0; k--) {
                const obstacle = gameState.obstacles[k];
                const obsRect = obstacle.getBoundingClientRect();

                if (
                    laserRect.left < obsRect.right &&
                    laserRect.right > obsRect.left &&
                    laserRect.top < obsRect.bottom &&
                    laserRect.bottom > obsRect.top
                ) {
                    laserObj.element.remove();
                    gameState.lasers.splice(i, 1);

                    let currentHealth = parseFloat(obstacle.dataset.health) - 0.25;
                    obstacle.dataset.health = currentHealth.toString();
                    obstacle.style.opacity = currentHealth;

                    if (currentHealth <= 0) {
                        obstacle.classList.add('exploding');
                        const el = obstacle;
                        setTimeout(() => {
                            el.remove();
                        }, 300);
                        gameState.obstacles.splice(k, 1);
                        updateScore(-50);
                        audio.playExplosionSound();
                    }
                    break;
                }
            }
        }
    }

    // 2. Enemy Lasers vs Player Ship
    for (let i = gameState.enemyLasers.length - 1; i >= 0; i--) {
        const eLaserObj = gameState.enemyLasers[i];
        const eLaserRect = eLaserObj.element.getBoundingClientRect();

        // Shrink the player hitbox slightly to make dodging feel fairer (Bullet Hell standard)
        const hitBoxShrinkX = 5;
        const hitBoxShrinkY = 5;

        const pLeft = playerRect.left + hitBoxShrinkX;
        const pRight = playerRect.right - hitBoxShrinkX;
        const pTop = playerRect.top + hitBoxShrinkY;
        const pBottom = playerRect.bottom;

        if (
            eLaserRect.left < pRight &&
            eLaserRect.right > pLeft &&
            eLaserRect.top < pBottom &&
            eLaserRect.bottom > pTop
        ) {
            // Player hit!
            gameOver();
            return;
        }
    }
}

/**
 * Main Game Loop
 */
function gameLoop() {
    if (!gameState.isInitialized || gameState.isGameOver) return;

    gameState.frameCount++;

    const LASER_SPEED = 12;
    const ENEMY_SPEED = 1.5;
    const ENEMY_LASER_SPEED = 7;
    const SHIP_SPEED = 8; // Velocidade da nave

    // Movement logic
    if (gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W']) {
        gameState.shipY -= SHIP_SPEED;
    }
    if (gameState.keys['ArrowDown'] || gameState.keys['s'] || gameState.keys['S']) {
        gameState.shipY += SHIP_SPEED;
    }
    if (gameState.keys['ArrowLeft'] || gameState.keys['a'] || gameState.keys['A']) {
        gameState.shipX -= SHIP_SPEED;
    }
    if (gameState.keys['ArrowRight'] || gameState.keys['d'] || gameState.keys['D']) {
        gameState.shipX += SHIP_SPEED;
    }

    // Boundaries (Limites da Tela)
    if (gameState.shipX < 0) gameState.shipX = 0;
    if (gameState.shipX > window.innerWidth) gameState.shipX = window.innerWidth;
    if (gameState.shipY < 0) gameState.shipY = 0;
    if (gameState.shipY > window.innerHeight) gameState.shipY = window.innerHeight;

    // Apply Ship Position
    if (gameState.playerShip) {
        gameState.playerShip.style.left = `${gameState.shipX}px`;
        gameState.playerShip.style.top = `${gameState.shipY}px`;
    }

    // Spawn Enemy Logic (or Boss Phase)
    if (!gameState.isBossFight) {
        if (gameState.frameCount % Math.floor(gameState.enemySpawnRate) === 0) {
            spawnEnemy();
        }
    } else if (gameState.bossObj) {
        // Boss Movement & Attack Logic
        const boss = gameState.bossObj;
        boss.x += boss.vx;

        // Ping-pong nas bordas
        if (boss.x - boss.width / 2 <= 0 || boss.x + boss.width / 2 >= window.innerWidth) {
            boss.vx *= -1;
        }

        boss.element.style.left = `${boss.x - boss.width / 2}px`;

        // Boss Shoot
        if (Math.random() < 0.05) { // 5% chance per frame (pretty frequently)
            const baseDy = 7;
            const leftDx = -2.5;
            const rightDx = 2.5;

            spawnEnemyLaser(boss.x, boss.y + boss.height, 0, baseDy);
            spawnEnemyLaser(boss.x, boss.y + boss.height, leftDx, baseDy);
            spawnEnemyLaser(boss.x, boss.y + boss.height, rightDx, baseDy);
        }
    }

    // Update Player Lasers
    for (let i = gameState.lasers.length - 1; i >= 0; i--) {
        const laserObj = gameState.lasers[i];
        laserObj.y -= LASER_SPEED;
        laserObj.element.style.top = `${laserObj.y}px`;

        if (laserObj.y < -50) {
            laserObj.element.remove();
            gameState.lasers.splice(i, 1);
        }
    }

    // Update Enemies
    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        const enemyObj = gameState.enemies[i];

        enemyObj.y += gameState.enemySpeed;
        // Zig-zag motion using sine wave
        enemyObj.x = enemyObj.baseX + Math.sin((gameState.frameCount + i * 50) / 40) * 80;

        // Offset by half-width to keep the center of the enemy aligned with x
        enemyObj.element.style.top = `${enemyObj.y}px`;
        enemyObj.element.style.left = `${enemyObj.x - (enemyObj.width / 2)}px`;

        // Random chance to shoot (~1.5% chance per frame)
        if (Math.random() < gameState.enemyShootChance) {
            spawnEnemyLaser(enemyObj.x, enemyObj.y + enemyObj.height);
        }

        // Cleanup off-screen enemies
        if (enemyObj.y > window.innerHeight + 100) {
            enemyObj.element.remove();
            gameState.enemies.splice(i, 1);
        }
    }

    // Update Enemy Lasers
    for (let i = gameState.enemyLasers.length - 1; i >= 0; i--) {
        const eLaserObj = gameState.enemyLasers[i];

        const dx = eLaserObj.dx !== undefined ? eLaserObj.dx : 0;
        const dy = eLaserObj.dy !== undefined ? eLaserObj.dy : 7;

        eLaserObj.x += dx;
        eLaserObj.y += dy;
        eLaserObj.element.style.left = `${eLaserObj.x}px`;
        eLaserObj.element.style.top = `${eLaserObj.y}px`;

        if (eLaserObj.y > window.innerHeight + 50 || eLaserObj.x < -50 || eLaserObj.x > window.innerWidth + 50) {
            eLaserObj.element.remove();
            gameState.enemyLasers.splice(i, 1);
        }
    }

    // Resolve Collisions
    checkCollisions();

    // Next Frame
    if (!gameState.isGameOver) {
        gameState.gameLoopReq = requestAnimationFrame(gameLoop);
    }
}

// Initialization hooks
window.addEventListener('DOMContentLoaded', () => {
    console.log("Page loaded. System security breach in 3 seconds...");

    // Listeners Active immediately
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseClick);

    // Initial delay
    setTimeout(initGame, 3000);
});
