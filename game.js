/**
 * NEON VOID: HYPERION
 * Built with Phaser 3
 */

// --- CONFIGURATION ---
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#050505',
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    pixelArt: false
};

const game = new Phaser.Game(config);

// --- GLOBAL STATE ---
let player;
let cursors;
let wasd;
let keySpace;
let keyShift;
let bullets;
let enemies;
let particles;
let score = 0;
let scoreText;
let level = 1;
let levelText;
let hpText;
let lastFired = 0;
let isGameOver = false;
let dashCooldown = 0;

// --- ASSET GENERATION (Draws graphics to memory) ---
function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // 1. Player Ship (Neon Blue)
    g.lineStyle(2, 0x00f3ff);
    g.fillStyle(0x002233);
    g.beginPath();
    g.moveTo(0, -15);
    g.lineTo(10, 10);
    g.lineTo(0, 5); // Engine notch
    g.lineTo(-10, 10);
    g.closePath();
    g.strokePath();
    g.fillPath();
    g.generateTexture('player', 32, 32);
    g.clear();

    // 2. Player Bullet (Bright Line)
    g.fillStyle(0xaaffff);
    g.fillRect(0, 0, 4, 16);
    g.generateTexture('bullet', 4, 16);
    g.clear();

    // 3. Enemy: Grunt (Orange Drone)
    g.lineStyle(2, 0xffaa00);
    g.strokeRect(0, 0, 24, 24);
    g.fillStyle(0xffaa00, 0.2);
    g.fillRect(0, 0, 24, 24);
    g.generateTexture('enemy_grunt', 24, 24);
    g.clear();

    // 4. Enemy: Chaser (Red Triangle)
    g.lineStyle(2, 0xff0055);
    g.beginPath();
    g.moveTo(12, 0);
    g.lineTo(24, 24);
    g.lineTo(0, 24);
    g.closePath();
    g.strokePath();
    g.generateTexture('enemy_chaser', 24, 24);
    g.clear();

    // 5. Particle (Glow)
    g.fillStyle(0xffffff);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.clear();
}

// --- INITIALIZATION ---
function create() {
    // 1. Starfield Background (Parallax)
    this.stars = this.add.group();
    for (let i = 0; i < 100; i++) {
        const star = this.add.rectangle(
            Phaser.Math.Between(0, 800),
            Phaser.Math.Between(0, 600),
            Phaser.Math.Between(1, 3),
            Phaser.Math.Between(1, 3),
            0x666666
        );
        star.speed = Math.random() * 2 + 0.5;
        this.stars.add(star);
    }

    // 2. Particle Managers
    particles = this.add.particles('particle');

    // Engine Trail
    this.trailEmitter = particles.createEmitter({
        speed: 100,
        scale: { start: 0.5, end: 0 },
        blendMode: 'ADD',
        tint: 0x00f3ff,
        lifespan: 200,
        follow: null,
        on: false
    });

    // Explosion Emitter
    this.explosionEmitter = particles.createEmitter({
        speed: { min: 50, max: 300 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.8, end: 0 },
        blendMode: 'SCREEN',
        lifespan: 600,
        gravityY: 0,
        quantity: 20,
        on: false
    });

    // 3. Player Setup
    player = this.physics.add.sprite(400, 500, 'player');
    player.setCollideWorldBounds(true);
    player.setDrag(1000);
    player.setMaxVelocity(300);
    player.hp = 100;
    player.invulnerable = false;

    // 4. Groups
    bullets = this.physics.add.group({
        classType: Phaser.Physics.Arcade.Image,
        defaultKey: 'bullet',
        maxSize: 50
    });

    enemies = this.physics.add.group();

    // 5. Input
    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys('W,A,S,D');
    keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // 6. UI
    scoreText = this.add.text(20, 20, 'SCORE: 0', { fontSize: '20px', fill: '#00f3ff', fontFamily: 'Courier' });
    levelText = this.add.text(20, 50, 'WAVE: 1', { fontSize: '20px', fill: '#00f3ff', fontFamily: 'Courier' });
    hpText = this.add.text(700, 20, 'HP: 100%', { fontSize: '20px', fill: '#00ff00', fontFamily: 'Courier' });

    // 7. Spawner Loop
    this.time.addEvent({
        delay: 1000,
        callback: spawnEnemy,
        callbackScope: this,
        loop: true
    });

    // 8. Collisions
    this.physics.add.overlap(bullets, enemies, hitEnemy, null, this);
    this.physics.add.overlap(player, enemies, hitPlayer, null, this);
}

// --- GAME LOOP ---
function update(time, delta) {
    if (isGameOver) {
        if (keySpace.isDown) restartGame(this);
        return;
    }

    // 1. Background Scroll
    if (this.stars) {
        this.stars.getChildren().forEach((star) => {
            if (!star) return;
            star.y += star.speed;
            if (star.y > 600) {
                star.y = 0;
                star.x = Phaser.Math.Between(0, 800);
            }
        });
    }

    // 2. Player Movement
    const acc = 800;
    player.setAcceleration(0);

    if (cursors.left.isDown || wasd.A.isDown) player.setAccelerationX(-acc);
    else if (cursors.right.isDown || wasd.D.isDown) player.setAccelerationX(acc);

    if (cursors.up.isDown || wasd.W.isDown) player.setAccelerationY(-acc);
    else if (cursors.down.isDown || wasd.S.isDown) player.setAccelerationY(acc);

    // Engine Particles
    if (player.body.acceleration.x !== 0 || player.body.acceleration.y !== 0) {
        this.trailEmitter.setPosition(player.x, player.y + 10);
        this.trailEmitter.emitParticle(1);
    }

    // 3. Dash Mechanic (Shift)
    if (Phaser.Input.Keyboard.JustDown(keyShift) && time > dashCooldown) {
        player.body.velocity.x *= 2;
        player.body.velocity.y *= 2;

        this.tweens.add({
            targets: player,
            alpha: 0.5,
            duration: 100,
            yoyo: true,
            repeat: 1
        });
        dashCooldown = time + 1000;
    }

    // 4. Shooting
    if (keySpace.isDown && time > lastFired) {
        const bullet = bullets.get();

        if (bullet) {
            bullet.setTexture('bullet');
            bullet.setActive(true);
            bullet.setVisible(true);

            if (bullet.body) {
                bullet.body.enable = true;
                bullet.body.reset(player.x, player.y - 20);
            } else {
                bullet.setPosition(player.x, player.y - 20);
            }

            bullet.setVelocityY(-500);
            lastFired = time + 150;
        }
    }

    // 5. Cleanup bullets
    if (bullets) {
        bullets.getChildren().forEach((b) => {
            if (!b || !b.active) return;

            if (b.y < -50) {
                bullets.killAndHide(b);
                if (b.body) {
                    b.body.enable = false;
                    b.setVelocity(0, 0);
                }
            }
        });
    }

    // 6. Enemy behavior + cleanup
    if (enemies) {
        enemies.getChildren().forEach((e) => {
            if (!e || !e.active) return;

            if (e.texture && e.texture.key === 'enemy_chaser') {
                this.physics.moveToObject(e, player, 150);
            }

            if (e.y > 650) {
                e.destroy();
            }
        });
    }
}

// --- GAME LOGIC HELPER FUNCTIONS ---

function spawnEnemy() {
    if (isGameOver) return;

    const spawnCount = Math.floor(level / 2) + 1;

    for (let i = 0; i < spawnCount; i++) {
        const x = Phaser.Math.Between(50, 750);
        const type = Math.random() > 0.3 ? 'enemy_grunt' : 'enemy_chaser';

        const enemy = enemies.create(x, -50, type);
        enemy.setBounce(1);
        enemy.setCollideWorldBounds(false);

        if (type === 'enemy_grunt') {
            enemy.setVelocity(Phaser.Math.Between(-50, 50), 100 + level * 10);
        } else {
            enemy.setTint(0xff5555);
        }
    }
}

function hitEnemy(bullet, enemy) {
    if (!bullet || !enemy) return;
    if (!bullet.active || !enemy.active) return;

    bullets.killAndHide(bullet);
    if (bullet.body) {
        bullet.body.enable = false;
        bullet.setVelocity(0, 0);
    }

    this.explosionEmitter.setPosition(enemy.x, enemy.y);
    this.explosionEmitter.setTint(0xffaa00);
    this.explosionEmitter.emitParticle(10);

    enemy.destroy();

    score += 100;
    scoreText.setText('SCORE: ' + score);

    if (score % 1000 === 0) {
        level++;
        levelText.setText('WAVE: ' + level);
        player.hp = Math.min(player.hp + 20, 100);
        hpText.setText('HP: ' + player.hp + '%');
        this.cameras.main.flash(500, 0, 255, 255);
    }

    this.cameras.main.shake(100, 0.01);
}

function hitPlayer(playerSprite, enemy) {
    if (playerSprite.invulnerable) return;

    enemy.destroy();

    playerSprite.hp -= 20;
    hpText.setText('HP: ' + playerSprite.hp + '%');

    this.cameras.main.shake(200, 0.02);
    this.cameras.main.flash(200, 255, 0, 0);

    if (playerSprite.hp <= 0) {
        gameOver(this);
    }
}

function gameOver(scene) {
    isGameOver = true;
    player.setTint(0x555555);
    player.setVelocity(0, 0);
    scene.physics.pause();

    const centerX = scene.cameras.main.width / 2;
    const centerY = scene.cameras.main.height / 2;

    scene.add.text(centerX, centerY - 50, 'SYSTEM FAILURE', {
        fontSize: '40px', fill: '#ff0000', fontFamily: 'Courier', fontStyle: 'bold'
    }).setOrigin(0.5);

    scene.add.text(centerX, centerY + 20, 'Press SPACE to Reboot', {
        fontSize: '20px', fill: '#ffffff', fontFamily: 'Courier'
    }).setOrigin(0.5);
}

function restartGame(scene) {
    isGameOver = false;
    score = 0;
    level = 1;
    scene.scene.restart();
}
