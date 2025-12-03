/**
 * NEON VOID: HYPERION
 * Built with Phaser 3
 * Audio: procedural placeholders (generated WAV data URIs at runtime)
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
        arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: { preload, create, update },
    pixelArt: false
};

const game = new Phaser.Game(config);

// --- GLOBAL STATE ---
let player, cursors, wasd, keySpace, keyShift;
let bullets, enemies, particles;
let score = 0, level = 1, lastFired = 0, isGameOver = false, dashCooldown = 0;
let scoreText, levelText, hpText;

// SFX handles (Phaser sounds)
let SFX = {};
let MUSIC;

// ---------- AUDIO HELPER: generate small WAV data URIs ----------
function wavURI({samples, sampleRate = 44100}) {
    const numChannels = 1, bitsPerSample = 16;
    const blockAlign = numChannels * bitsPerSample >> 3;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * blockAlign;

    const buf = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(buf);
    let p = 0;

    function wStr(s) { for (let i = 0; i < s.length; i++) dv.setUint8(p++, s.charCodeAt(i)); }
    function w16(v)  { dv.setUint16(p, v, true); p += 2; }
    function w32(v)  { dv.setUint32(p, v, true); p += 4; }

    // RIFF header
    wStr('RIFF'); w32(36 + dataSize); wStr('WAVE');
    // fmt chunk
    wStr('fmt '); w32(16); w16(1); w16(numChannels); w32(sampleRate); w32(byteRate); w16(blockAlign); w16(bitsPerSample);
    // data chunk
    wStr('data'); w32(dataSize);

    // PCM 16-bit
    const clamp = (x)=>Math.max(-1, Math.min(1, x));
    for (let i = 0; i < samples.length; i++) {
        const s = (clamp(samples[i]) * 32767) | 0;
        dv.setInt16(p, s, true); p += 2;
    }
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return `data:audio/wav;base64,${b64}`;
}

// Simple tone/noise generators
function makeTone({freq = 440, durMs = 140, vol = 0.5, sampleRate = 44100, env = [0.01, 0.1]}) {
    const n = Math.floor(sampleRate * (durMs / 1000));
    const [attack, release] = env; // seconds
    const aSamples = Math.floor(sampleRate * attack);
    const rSamples = Math.floor(sampleRate * release);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let amp = vol;
        if (i < aSamples) amp *= i / Math.max(1, aSamples);
        else if (i > n - rSamples) amp *= (n - i) / Math.max(1, rSamples);
        out[i] = Math.sin(2 * Math.PI * freq * (i / sampleRate)) * amp;
    }
    return wavURI({samples: out, sampleRate});
}

function makeSweep({fStart = 900, fEnd = 1400, durMs = 120, vol = 0.5, sampleRate = 44100}) {
    const n = Math.floor(sampleRate * (durMs / 1000));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / n;
        const f = fStart + (fEnd - fStart) * t;
        const env = Math.min(1, t * 10) * (1 - t); // quick attack, short release
        out[i] = Math.sin(2 * Math.PI * f * (i / sampleRate)) * vol * env;
    }
    return wavURI({samples: out, sampleRate});
}

function makeNoiseBurst({durMs = 380, vol = 0.45, sampleRate = 44100}) {
    const n = Math.floor(sampleRate * (durMs / 1000));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / n;
        const env = Math.pow(1 - t, 2); // decay
        out[i] = (Math.random() * 2 - 1) * vol * env;
    }
    return wavURI({samples: out, sampleRate});
}

function makeBgmLoop({sampleRate = 44100}) {
    // 2-second minimal loop: two sines (A2 + E3), very soft
    const durMs = 2000, n = Math.floor(sampleRate * (durMs / 1000));
    const out = new Float32Array(n);
    const f1 = 110, f2 = 165;
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        const env = 0.2 + 0.05 * Math.sin(2 * Math.PI * 0.5 * t); // tiny movement
        out[i] = (Math.sin(2 * Math.PI * f1 * t) * 0.5 + Math.sin(2 * Math.PI * f2 * t) * 0.5) * 0.15 * env;
    }
    return wavURI({samples: out, sampleRate});
}

// --- PRELOAD ---
function preload() {
    // Procedural audio assets (data URIs)
    this.load.audio('sfx-laser', [ makeSweep({fStart: 1200, fEnd: 1700, durMs: 120, vol: 0.6}) ]);
    this.load.audio('sfx-explosion', [ makeNoiseBurst({durMs: 420, vol: 0.5}) ]);
    this.load.audio('sfx-hit', [ makeTone({freq: 220, durMs: 120, vol: 0.5, env:[0.005,0.12]}) ]);
    this.load.audio('sfx-dash', [ makeSweep({fStart: 400, fEnd: 900, durMs: 100, vol: 0.5}) ]);
    this.load.audio('sfx-wave', [ makeTone({freq: 660, durMs: 240, vol: 0.4, env:[0.01,0.2]}) ]);
    this.load.audio('bgm', [ makeBgmLoop({}) ]);

    // Generated textures via Graphics
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Player
    g.lineStyle(2, 0x00f3ff); g.fillStyle(0x002233);
    g.beginPath(); g.moveTo(0, -15); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath();
    g.strokePath(); g.fillPath(); g.generateTexture('player', 32, 32); g.clear();

    // Bullet
    g.fillStyle(0xaaffff); g.fillRect(0, 0, 4, 16); g.generateTexture('bullet', 4, 16); g.clear();

    // Enemy grunt
    g.lineStyle(2, 0xffaa00); g.strokeRect(0, 0, 24, 24); g.fillStyle(0xffaa00, 0.2); g.fillRect(0, 0, 24, 24);
    g.generateTexture('enemy_grunt', 24, 24); g.clear();

    // Enemy chaser
    g.lineStyle(2, 0xff0055); g.beginPath(); g.moveTo(12, 0); g.lineTo(24, 24); g.lineTo(0, 24); g.closePath(); g.strokePath();
    g.generateTexture('enemy_chaser', 24, 24); g.clear();

    // Particle
    g.fillStyle(0xffffff); g.fillCircle(4, 4, 4); g.generateTexture('particle', 8, 8); g.clear();
}

// --- CREATE ---
function create() {
    // Starfield
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

    // Particles
    particles = this.add.particles('particle');
    this.trailEmitter = particles.createEmitter({
        speed: 100, scale: { start: 0.5, end: 0 }, blendMode: 'ADD', tint: 0x00f3ff, lifespan: 200, on: false
    });
    this.explosionEmitter = particles.createEmitter({
        speed: { min: 50, max: 300 }, angle: { min: 0, max: 360 }, scale: { start: 0.8, end: 0 },
        blendMode: 'SCREEN', lifespan: 600, gravityY: 0, quantity: 20, on: false
    });

    // Player
    player = this.physics.add.sprite(400, 500, 'player');
    player.setCollideWorldBounds(true);
    player.setDrag(1000); player.setMaxVelocity(300);
    player.hp = 100; player.invulnerable = false;

    // Groups
    bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, defaultKey: 'bullet', maxSize: 50 });
    enemies = this.physics.add.group();

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys('W,A,S,D');
    keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // UI
    scoreText = this.add.text(20, 20, 'SCORE: 0', { fontSize: '20px', fill: '#00f3ff', fontFamily: 'Courier' });
    levelText = this.add.text(20, 50, 'WAVE: 1', { fontSize: '20px', fill: '#00f3ff', fontFamily: 'Courier' });
    hpText = this.add.text(700, 20, 'HP: 100%', { fontSize: '20px', fill: '#00ff00', fontFamily: 'Courier' });

    // Spawner
    this.time.addEvent({ delay: 1000, callback: spawnEnemy, callbackScope: this, loop: true });

    // Collisions
    this.physics.add.overlap(bullets, enemies, hitEnemy, null, this);
    this.physics.add.overlap(player, enemies, hitPlayer, null, this);

    // --- SOUND SETUP ---
    SFX = {
        laser: this.sound.add('sfx-laser', { volume: 0.35 }),
        explosion: this.sound.add('sfx-explosion', { volume: 0.45 }),
        hit: this.sound.add('sfx-hit', { volume: 0.35 }),
        dash: this.sound.add('sfx-dash', { volume: 0.30 }),
        wave: this.sound.add('sfx-wave', { volume: 0.35 })
    };
    MUSIC = this.sound.add('bgm', { loop: true, volume: 0.18 });
    MUSIC.play();
}

// --- UPDATE ---
function update(time, delta) {
    if (isGameOver) {
        if (keySpace.isDown) restartGame(this);
        return;
    }

    // Starfield
    if (this.stars) {
        this.stars.getChildren().forEach((star) => {
            if (!star) return;
            star.y += star.speed;
            if (star.y > 600) { star.y = 0; star.x = Phaser.Math.Between(0, 800); }
        });
    }

    // Movement
    const acc = 800;
    player.setAcceleration(0);
    if (cursors.left.isDown || wasd.A.isDown) player.setAccelerationX(-acc);
    else if (cursors.right.isDown || wasd.D.isDown) player.setAccelerationX(acc);
    if (cursors.up.isDown || wasd.W.isDown) player.setAccelerationY(-acc);
    else if (cursors.down.isDown || wasd.S.isDown) player.setAccelerationY(acc);

    // Engine trail
    if (player.body.acceleration.x !== 0 || player.body.acceleration.y !== 0) {
        this.trailEmitter.setPosition(player.x, player.y + 10);
        this.trailEmitter.emitParticle(1);
    }

    // Dash
    if (Phaser.Input.Keyboard.JustDown(keyShift) && time > dashCooldown) {
        player.body.velocity.x *= 2; player.body.velocity.y *= 2;
        this.tweens.add({ targets: player, alpha: 0.5, duration: 100, yoyo: true, repeat: 1 });
        dashCooldown = time + 1000;
        SFX.dash.play();
    }

    // Shooting
    if (keySpace.isDown && time > lastFired) {
        const bullet = bullets.get();
        if (bullet) {
            bullet.setTexture('bullet'); bullet.setActive(true); bullet.setVisible(true);
            if (bullet.body) { bullet.body.enable = true; bullet.body.reset(player.x, player.y - 20); } else { bullet.setPosition(player.x, player.y - 20); }
            bullet.setVelocityY(-500);
            lastFired = time + 150;
            SFX.laser.play();
        }
    }

    // Cleanup bullets
    if (bullets) {
        bullets.getChildren().forEach((b) => {
            if (!b || !b.active) return;
            if (b.y < -50) {
                bullets.killAndHide(b);
                if (b.body) { b.body.enable = false; b.setVelocity(0, 0); }
            }
        });
    }

    // Enemy behavior + cleanup
    if (enemies) {
        enemies.getChildren().forEach((e) => {
            if (!e || !e.active) return;
            if (e.texture && e.texture.key === 'enemy_chaser') this.physics.moveToObject(e, player, 150);
            if (e.y > 650) e.destroy();
        });
    }
}

// --- HELPERS ---
function spawnEnemy() {
    if (isGameOver) return;
    const spawnCount = Math.floor(level / 2) + 1;
    for (let i = 0; i < spawnCount; i++) {
        const x = Phaser.Math.Between(50, 750);
        const type = Math.random() > 0.3 ? 'enemy_grunt' : 'enemy_chaser';
        const enemy = enemies.create(x, -50, type);
        enemy.setBounce(1).setCollideWorldBounds(false);
        if (type === 'enemy_grunt') enemy.setVelocity(Phaser.Math.Between(-50, 50), 100 + level * 10);
        else enemy.setTint(0xff5555);
    }
}

function hitEnemy(bullet, enemy) {
    if (!bullet || !enemy) return;
    if (!bullet.active || !enemy.active) return;

    bullets.killAndHide(bullet);
    if (bullet.body) { bullet.body.enable = false; bullet.setVelocity(0, 0); }

    this.explosionEmitter.setPosition(enemy.x, enemy.y);
    this.explosionEmitter.setTint(0xffaa00);
    this.explosionEmitter.emitParticle(10);
    enemy.destroy();

    SFX.explosion.play();

    score += 100; scoreText.setText('SCORE: ' + score);

    if (score % 1000 === 0) {
        level++; levelText.setText('WAVE: ' + level);
        player.hp = Math.min(player.hp + 20, 100); hpText.setText('HP: ' + player.hp + '%');
        this.cameras.main.flash(500, 0, 255, 255);
        SFX.wave.play();
    }

    this.cameras.main.shake(100, 0.01);
}

function hitPlayer(playerSprite, enemy) {
    if (playerSprite.invulnerable) return;
    enemy.destroy();
    playerSprite.hp -= 20; hpText.setText('HP: ' + playerSprite.hp + '%');
    this.cameras.main.shake(200, 0.02); this.cameras.main.flash(200, 255, 0, 0);
    SFX.hit.play();
    if (playerSprite.hp <= 0) gameOver(this);
}

function gameOver(scene) {
    isGameOver = true;
    player.setTint(0x555555).setVelocity(0, 0);
    scene.physics.pause();

    if (MUSIC && MUSIC.isPlaying) scene.tweens.add({ targets: MUSIC, volume: 0, duration: 600, onComplete: () => MUSIC.stop() });

    const cx = scene.cameras.main.width / 2, cy = scene.cameras.main.height / 2;
    scene.add.text(cx, cy - 50, 'SYSTEM FAILURE', { fontSize: '40px', fill: '#ff0000', fontFamily: 'Courier', fontStyle: 'bold' }).setOrigin(0.5);
    scene.add.text(cx, cy + 20, 'Press SPACE to Reboot', { fontSize: '20px', fill: '#ffffff', fontFamily: 'Courier' }).setOrigin(0.5);
}

function restartGame(scene) {
    isGameOver = false; score = 0; level = 1;
    scene.scene.restart();
}
