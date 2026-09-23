(function () {
    'use strict';

    /* =====================================================================
       ESCAPE THE INTERVIEW  ·  side-scrolling runner for a portfolio site
       ---------------------------------------------------------------------
       Run, jump, double-jump and slide through four interview rounds.
       Grab coins (they unlock your skills), dodge rejections, survive.
       ===================================================================== */

    /* ---------------------------------------------------------------------
       CONFIG  –  the bits you will most likely want to edit
       --------------------------------------------------------------------- */
    const CONFIG = {
        lives: 3,
        coinsPerSkill: 10,

        // Every N coins "unlocks" the next skill. Put your real stack here.
        // They show up as a toast while playing and on the end screen.
        skills: [
            'Swift', 'React', 'Node.js', 'JavaScript', 'RAG',
            'Python', 'DSA', 'AI/ML', 'Git', 'UI/UX'
        ],

        // Optional: path to a face image. If set, it appears on the robot's
        // screen instead of the animated eyes. Leave '' for the plain robot.
        avatarSrc: '',

        bestKey: 'escapeInterviewBestCoinsV1',
        muteKey: 'escapeInterviewMuted'
    };

    /* ---------------------------------------------------------------------
       ROUNDS
       length : distance in px before the round door appears
       speed  : base scroll speed (px/s)
       gap    : breathing room after each obstacle group, in seconds
       tight  : multiplier on the combo-spacing (smaller = harder)
       pool   : obstacle patterns and how often they show up
       --------------------------------------------------------------------- */
    const ROUNDS = [
        {
            title: 'Resume Screening',
            flavor: 'They skim for six seconds. Keep moving.',
            length: 5200, speed: 305, gap: 1.05, tight: 1,
            pool: { crate: 5, tall: 2, flag: 3, bunch: 1, coins: 2 },
            labels: {
                crate: ['TYPO', 'No experience', 'Internship', 'ATS', 'CV.PDF'],
                flag: ['REJECT', 'NO REPLY', 'GHOST']
            },
            pal: {
                sky: '#efe9fb', sun: '#fbe1ee', cloud: '#ffffff',
                far: '#ddd3f3', mid: '#cbbdee', ground: '#bcaee4',
                top: '#d5c9f3', detail: '#a493d8', accent: '#8f75e0'
            }
        },
        {
            title: 'Online Assessment',
            flavor: 'Two hours. Zero partial credit.',
            length: 6400, speed: 340, gap: 0.92, tight: 0.94,
            pool: { crate: 3, tall: 2, flag: 2, bunch: 2, hop2: 2, drone: 2, flagCrate: 1, coins: 1 },
            labels: {
                crate: ['BUG', 'TLE', '404', 'NULL', 'Semicolon missing'],
                flag: ['TIMEOUT', 'DEADLINE', 'Optimise code']
            },
            pal: {
                sky: '#e6f1fb', sun: '#fff0d3', cloud: '#ffffff',
                far: '#d1e3f5', mid: '#bcd6f0', ground: '#a8c8ea',
                top: '#c3dbf3', detail: '#8db3dc', accent: '#5f9ae0'
            }
        },
        {
            title: 'Technical Interview',
            flavor: 'Can you optimize that? Keep moving.',
            length: 7600, speed: 375, gap: 0.82, tight: 0.88,
            pool: { crate: 2, tall: 2, flag: 2, bunch: 2, hop2: 2, stairs: 2, drone: 2, droneCrate: 1, ball: 2, flagCrate: 2, crateFlag: 2, coins: 1 },
            labels: {
                crate: ['O(n²)', 'EDGE CASE', 'Memory Leak', 'Race condition', 'Error'],
                flag: ['OPTIMIZE', 'WHITEBOARD', 'Sandbox']
            },
            pal: {
                sky: '#e6f5ec', sun: '#fff3cb', cloud: '#ffffff',
                far: '#d0ebda', mid: '#b9e0c9', ground: '#a2d2b4',
                top: '#bde3cc', detail: '#85bd9b', accent: '#4fb383'
            }
        },
        {
            title: 'HR Round',
            flavor: 'Where do you see yourself in five minutes?',
            length: 8800, speed: 410, gap: 0.74, tight: 0.82,
            pool: { crate: 2, tall: 2, flag: 2, bunch: 2, hop2: 2, stairs: 2, drone: 2, droneCrate: 2, ball: 2, flagCrate: 2, crateFlag: 2, gauntlet: 2, coins: 1 },
            labels: {
                crate: ['SALARY?', 'WEAKNESS', 'Strengths', 'WHY US?', 'NOTICE?'],
                flag: ['CULTURE FIT', 'GOALS?', 'REFERENCES']
            },
            pal: {
                sky: '#fdf3d9', sun: '#ffe3d6', cloud: '#ffffff',
                far: '#f7e8bd', mid: '#efdb9f', ground: '#e5cc86',
                top: '#f1dfa5', detail: '#d3b565', accent: '#e0a53a'
            }
        }
    ];

    /* ---------------------------------------------------------------------
       Look & feel constants (flat pastel, no gradients)
       --------------------------------------------------------------------- */
    const TAU = Math.PI * 2;
    const INK = '#3d3650';
    const HAZ = '#ff8fa3';
    const HAZ_DARK = '#ee6f89';
    const GOLD = '#ffd452';
    const SKYLINE_NAMES = ['OPENAI', 'ANTHROPIC', 'GOOGLE', 'NVIDIA', 'AMAZON', 'RasoiBazaar', 'Kohli', 'Pranav', 'GitHub', 'META', 'Netflix'];
    const BOT = {
        shell: '#fbf9ff',
        torso: '#d2c7f7',
        limbN: '#bcaef0',
        limbF: '#9689c9',
        pack: '#a597da',
        glow: '#9be8cf',
        ant: '#ff9db0'
    };

    /* ---------------------------------------------------------------------
       Physics / gameplay tuning
       --------------------------------------------------------------------- */
    const GRAVITY = 2300;
    const JUMP_V = 800;          // ~139px high
    const AIR_V = 700;           // double-jump boost
    const FALL_MULT = 1.25;
    const FAST_FALL_V = 1000;
    const COYOTE = 0.09;
    const BUFFER = 0.13;
    const SLIDE_TIME = 0.62;
    const RUSH_TIME = 4;
    const RUSH_SPEED = 1.4;
    const INVULN = 1.6;
    const STAND_H = 50;

    /* ---------------------------------------------------------------------
       DOM + view
       --------------------------------------------------------------------- */
    let canvas, ctx, wrap;
    let roundTitle, flavorText, hudRound, hudScore, hudLives, hud;
    let startOverlay, startBtn, pauseOverlay, resumeBtn, restartBtn, winOverlay, playAgainBtn;
    let finalStats, bestScore, pauseBtn, dpad, hint, soundBtn, shareBtn, shareCanvas;

    let FONT = 'system-ui, sans-serif';
    let cssW = 760, cssH = 400, LW = 760, LH = 338, GY = 262, PX = 120;
    let dpr = 1, viewScale = 1;
    let reduceMotion = false;

    /* ---------------------------------------------------------------------
       Game state
       --------------------------------------------------------------------- */
    let state = 'menu';     // menu | countdown | playing | paused | ending | over
    let pausedFrom = 'playing';
    let result = 'lose';

    let roundIndex = 0;
    let coinCount = 0;
    let combo = 0;
    let lives = CONFIG.lives;

    let dist = 0;
    let roundStartDist = 0;
    let scroll = 0;
    let worldT = 0;
    let runPhase = 0;
    let runEase = 1;
    let countdown = 2.5;
    let endT = 0;
    let endV = 0;

    let nextSpawn = 0;
    let nextPower = 0;
    let doorSpawned = false;
    let lastPattern = '';

    let py = 0;             // height above ground (px)
    let vy = 0;             // vertical speed, up is positive
    let coyote = 0;
    let jumpBuffer = 0;
    let airJumps = 1;
    let sliding = false;
    let slideT = 0;
    let fastFall = false;
    let flipping = false;
    let flip = 0;
    let flipDir = 1;
    let squash = 0;

    let invuln = 0;
    let rush = 0;
    let shield = false;

    let shake = 0;
    let flash = 0;

    let palT = 1;
    let palFrom = null;
    let PAL = ROUNDS[0].pal;

    let bannerT = 0;
    let toastText = '';
    let toastT = 0;
    let lastHit = '';
    let unlocked = [];
    let prevBest = 0;
    let newBestFired = false;

    let obstacles = [];
    let coinItems = [];
    let powerItems = [];
    let doors = [];
    let particles = [];
    let floaters = [];

    let lastFrame = 0;
    let gesture = null;

    const hudCache = {};

    const avatar = new Image();
    let avatarLoaded = false;
    if (CONFIG.avatarSrc) {
        avatar.onload = () => { avatarLoaded = true; };
        avatar.src = CONFIG.avatarSrc;
    }

    /* ---------------------------------------------------------------------
       Small helpers
       --------------------------------------------------------------------- */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    function hash(n) {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return s - Math.floor(s);
    }

    function weighted(pool, avoid) {
        let entries = Object.entries(pool).filter(([k]) => k !== avoid);
        if (!entries.length) entries = Object.entries(pool);
        let total = 0;
        entries.forEach(([, w]) => { total += w; });
        let r = Math.random() * total;
        for (const [k, w] of entries) {
            r -= w;
            if (r <= 0) return k;
        }
        return entries[0][0];
    }

    function hexToRgb(h) {
        const n = parseInt(h.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function mixHex(a, b, t) {
        const A = hexToRgb(a);
        const B = hexToRgb(b);
        return 'rgb(' +
            Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
            Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
            Math.round(A[2] + (B[2] - A[2]) * t) + ')';
    }

    function mixPal(a, b, t) {
        const out = {};
        for (const k in b) out[k] = mixHex(a[k], b[k], t);
        return out;
    }

    function currentPal() {
        const target = ROUNDS[roundIndex].pal;
        if (palT >= 1 || !palFrom) return target;
        return mixPal(palFrom, target, palT);
    }

    function store(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }

    function load(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function overlap(a, b) {
        return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    }

    const R = () => ROUNDS[roundIndex];
    const roundDist = () => dist - roundStartDist;
    const multiplier = () => Math.min(5, 1 + Math.floor(combo / 10));
    const spawnX = () => LW + 40;

    /* ---------------------------------------------------------------------
       Audio (tiny synth, muted with M or the sound button)
       --------------------------------------------------------------------- */
  

    let audio = null;
    let master = null;
    let muted = false;

    const VOL = 5; // sound effect loudness multiplier

    function ensureAudio() {
        if (audio) {
            if (audio.state === 'suspended') audio.resume().catch(() => {});
            return audio;
        }
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        try {
            audio = new C();
            master = audio.createGain();
            master.gain.value = 0.9;
            const comp = audio.createDynamicsCompressor();
            master.connect(comp);
            comp.connect(audio.destination);
        } catch (e) { audio = null; }
        return audio;
    }

    function tone(freq, dur, type, vol, to) {
        if (muted) return;
        const ac = ensureAudio();
        if (!ac || !master) return;
        const t0 = ac.currentTime;
        const peak = Math.min(0.5, (vol || 0.03) * VOL);
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    function whoosh(startFreq, endFreq, dur, vol, filterType = 'bandpass') {
    if (muted) return;

    const ac = ensureAudio();
    if (!ac || !master) return;

    const t0 = ac.currentTime;

    // Tonal motion layer
    const osc = ac.createOscillator();
    const oscGain = ac.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(
        endFreq,
        t0 + dur
    );

    oscGain.gain.setValueAtTime(0.0001, t0);
    oscGain.gain.linearRampToValueAtTime(
        Math.min(0.07, vol * VOL),
        t0 + 0.012
    );
    oscGain.gain.exponentialRampToValueAtTime(
        0.0001,
        t0 + dur
    );

    osc.connect(oscGain);
    oscGain.connect(master);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);

    // Air layer
    noiseBurst(
        dur,
        vol * 0.55,
        filterType,
        Math.max(startFreq * 1.8, 700),
        Math.max(endFreq * 2.2, 1200)
    );
}

    function noiseBurst(dur, vol, filterType, freq, sweepTo) {
        if (muted) return;

        const ac = ensureAudio();
        if (!ac || !master) return;

        const t0 = ac.currentTime;
        const length = Math.max(1, Math.floor(ac.sampleRate * dur));
        const buffer = ac.createBuffer(1, length, ac.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = ac.createBufferSource();
        const filter = ac.createBiquadFilter();
        const gain = ac.createGain();

        source.buffer = buffer;

        filter.type = filterType || 'lowpass';
        filter.frequency.setValueAtTime(freq || 1400, t0);

        if (sweepTo) {
            filter.frequency.exponentialRampToValueAtTime(
                sweepTo,
                t0 + dur
            );
        }

        const peak = Math.min(0.3, (vol || 0.02) * VOL);

        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(
            peak,
            t0 + Math.min(0.008, dur * 0.2)
        );
        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            t0 + dur
        );

        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);

        source.start(t0);
        source.stop(t0 + dur + 0.02);
    }

    const ARP = [
        [262, 330, 392, 330, 262, 330, 392, 523], // C
        [220, 262, 330, 262, 220, 262, 330, 440], // Am
        [175, 220, 262, 220, 175, 220, 262, 349], // F
        [196, 247, 294, 247, 196, 247, 294, 392]  // G
    ];
    const BASS_NOTES = [131, 110, 87, 98];
    let musicStep = 0;
    let musicNext = 0;

    let footstepTimer = 0;
    let footstepSide = 0;
    let slideSfxTimer = 0;

    function musicTone(freq, t0, dur, type, vol) {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    // called every frame while playing; schedules notes slightly ahead
    function musicTick() {
        if (muted || !audio || !master) return;
        const now = audio.currentTime;
        if (musicNext < now) musicNext = now + 0.05;
        const step = 0.24 - roundIndex * 0.015; // gets faster each round
        while (musicNext < now + 0.3) {
            const bar = Math.floor(musicStep / 8) % 4;
            const i = musicStep % 8;
            musicTone(ARP[bar][i], musicNext, 0.18, 'triangle', 0.032);
            if (i % 4 === 0) musicTone(BASS_NOTES[bar], musicNext, 0.4, 'sine', 0.06);
            musicStep++;
            musicNext += step;
        }
    }
   
    const sfx = {
        // Soft shoe impact + tiny air movement.
        footstep(side) {
            const pitch = side ? 105 : 95;

            tone(
                pitch,
                0.055,
                'triangle',
                0.026,
                pitch * 0.72
            );

            noiseBurst(
                0.035,
                0.017,
                'lowpass',
                1100,
                650
            );
        },

        // Physical jump: tiny body push + air whoosh.
       
        jump() {
    // Tiny launch transient.
    tone(
        115,
        0.045,
        'triangle',
        0.018,
        80
    );

    // The actual "movement" sound.
    whoosh(
        260,
        920,
        0.14,
        0.018,
        'bandpass'
    );

    // Bright little tail.
    setTimeout(() => {
        tone(
            780,
            0.055,
            'sine',
            0.008,
            980
        );
    }, 55);
},

        // Double jump: lighter and airier than the first jump.
        air() {
    whoosh(
        420,
        1200,
        0.11,
        0.014,
        'bandpass'
    );

    setTimeout(() => {
        tone(
            1050,
            0.045,
            'triangle',
            0.007,
            1350
        );
    }, 45);
},

        // Ground contact.
       
        land() {
    tone(82, 0.075, 'triangle', 0.028, 52);

    noiseBurst(
        0.035,
        0.012,
        'lowpass',
        550,
        220
    );
},

        // Keep the coin sound you already like.
        coin(n) {
            tone(
                760 + (n % 5) * 70,
                0.08,
                'triangle',
                0.025
            );
        },

        shieldPower() {
    // Soft magical lift
    tone(
        420,
        0.16,
        'sine',
        0.022,
        900
    );

    // Sparkle
    setTimeout(() => {
        tone(
            900,
            0.10,
            'triangle',
            0.018,
            1450
        );
    }, 55);

    // Magical shimmer
    setTimeout(() => {
        noiseBurst(
            0.12,
            0.012,
            'highpass',
            2200,
            5000
        );
    }, 100);

    // Final glassy note
    setTimeout(() => {
        tone(
            1320,
            0.20,
            'sine',
            0.014,
            1650
        );
    }, 145);
},


caffeinePower() {
    // Initial energy hit
    tone(
        180,
        0.08,
        'triangle',
        0.028,
        420
    );

    // Fast magical climb
    setTimeout(() => {
        tone(
            420,
            0.10,
            'sawtooth',
            0.018,
            1100
        );
    }, 45);

    // Bright energy sparkle
    setTimeout(() => {
        tone(
            1100,
            0.12,
            'triangle',
            0.022,
            1800
        );
    }, 95);

    // Tiny energy burst
    setTimeout(() => {
        noiseBurst(
            0.06,
            0.016,
            'highpass',
            2600,
            5200
        );
    }, 135);
},

        // Slide = low friction + air movement.
        slide() {
    // The body drops quickly.
    whoosh(
        520,
        150,
        0.12,
        0.016,
        'bandpass'
    );

    // Soft ground scrape.
    noiseBurst(
        0.075,
        0.014,
        'lowpass',
        1200,
        420
    );

    // Tiny trailing swipe.
    setTimeout(() => {
        whoosh(
            700,
            280,
            0.075,
            0.007,
            'bandpass'
        );
    }, 65);
},

        // Body hitting something, rather than a synth buzz.
        hit() {
            // Hard, low impact. No musical pitch.
            tone(
                72,
                0.095,
                'sine',
                0.055,
                42
            );

            // Dense stone-like contact.
            noiseBurst(
                0.042,
                0.045,
                'lowpass',
                1800,
                500
            );

            // Very short hard edge of the impact.
            noiseBurst(
                0.012,
                0.025,
                'highpass',
                3200,
                1100
            );
        },

        // Shield pop stays clean.
        pop() {
            tone(700, 0.12, 'sine', 0.03, 300);
            noiseBurst(0.05, 0.01, 'highpass', 1800, 900);
        },

        // Breaking an obstacle: low thump + crack.
        smash() {
            tone(135, 0.11, 'triangle', 0.03, 65);
            noiseBurst(0.07, 0.025, 'highpass', 1400, 500);
        },

        round() {
            tone(600, 0.1, 'triangle', 0.03);
            setTimeout(() => {
                tone(900, 0.16, 'triangle', 0.03);
            }, 110);
        },

        tick() {
            tone(440, 0.06, 'sine', 0.02);
        },

        go() {
            tone(720, 0.12, 'triangle', 0.03);
        },

        newBest() {
            [880, 1100, 1320].forEach((f, i) => {
                setTimeout(() => {
                    tone(f, 0.14, 'triangle', 0.035);
                }, i * 90);
            });
        },

        win() {
            // Quick celebratory rise.
            [660, 830, 990, 1320, 1580].forEach((f, i) => {
                setTimeout(() => {
                    tone(
                        f,
                        0.16,
                        'triangle',
                        0.038
                    );
                }, i * 75);
            });

            // Big bright chord underneath.
            setTimeout(() => {
                tone(660, 0.42, 'sine', 0.025);
                tone(830, 0.42, 'sine', 0.022);
                tone(990, 0.42, 'sine', 0.020);
                tone(1320, 0.42, 'triangle', 0.018);
            }, 280);

            // Little sparkle burst.
            setTimeout(() => {
                noiseBurst(
                    0.12,
                    0.020,
                    'highpass',
                    1800,
                    5000
                );
            }, 350);

            // Final "ta-da!"
            setTimeout(() => {
                tone(990, 0.18, 'triangle', 0.030);
                tone(1320, 0.24, 'triangle', 0.034);
                tone(1580, 0.32, 'sine', 0.028);
            }, 470);
        },

        lose() {
            tone(300, 0.4, 'triangle', 0.035, 80);
            noiseBurst(0.14, 0.018, 'lowpass', 500, 180);
        }
    };

    function setMuted(value) {
        muted = value;
        store(CONFIG.muteKey, muted ? '1' : '0');
        if (soundBtn) {
            soundBtn.textContent = muted ? 'Sound: off' : 'Sound: on';
            soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        }
    }

    /* ---------------------------------------------------------------------
       Setup
       --------------------------------------------------------------------- */
    function bind() {
        canvas = document.getElementById('mazeCanvas');
        if (!canvas) return false;
        ctx = canvas.getContext('2d');
        if (!ctx) return false;

        wrap = document.querySelector('.game-canvas-wrap');
        if (!wrap) return false;

        roundTitle = document.getElementById('roundTitle');
        flavorText = document.getElementById('flavorText');
        hudRound = document.getElementById('hudRound');
        hudScore = document.getElementById('hudCoins');
        hudLives = document.getElementById('hudLives');
        hud = document.getElementById('gameHud');
        startOverlay = document.getElementById('startOverlay');
        startBtn = document.getElementById('startBtn');
        pauseOverlay = document.getElementById('pauseOverlay');
        resumeBtn = document.getElementById('resumeBtn');
        restartBtn = document.getElementById('restartBtn');
        winOverlay = document.getElementById('winOverlay');
        playAgainBtn = document.getElementById('playAgainBtn');
        finalStats = document.getElementById('finalStats');
        bestScore = document.getElementById('bestScore');
        pauseBtn = document.getElementById('pauseBtn');
        dpad = document.getElementById('gameDpad');
        hint = document.querySelector('.game-hint');
        soundBtn = document.getElementById('soundBtn');

        shareBtn = document.createElement('button');
        shareBtn.type = 'button';
        shareBtn.className = 'game-share-btn';
        shareBtn.setAttribute('aria-label', 'Share result');
        shareBtn.setAttribute('title', 'Share result');
        shareBtn.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 18L18 6"></path>
                <path d="M10 6H18V14"></path>
            </svg>
        `;
        const controlsBottom = document.querySelector('.game-controls-bottom');
        (controlsBottom || wrap).appendChild(shareBtn);
        shareBtn.addEventListener('click', doShare);

        return !!(startOverlay && startBtn && pauseOverlay && resumeBtn &&
            winOverlay && playAgainBtn && finalStats && hud && pauseBtn);
    }

    function resize() {
        const w = wrap.clientWidth || 760;
        cssW = Math.max(280, Math.min(900, Math.floor(w)));
        cssH = cssW < 520 ? 320 : 400;

        // The game world is laid out in "logical" pixels; narrow screens see
        // a slightly zoomed-out world so obstacles still give fair warning.
        LW = clamp(cssW, 440, 760);
        viewScale = cssW / LW;
        LH = cssH / viewScale;
        GY = Math.round(LH - 76);
        PX = clamp(Math.round(LW * 0.16), 80, 120);

        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }

    function setText(el, value, key) {
        if (!el) return;
        if (hudCache[key] !== value) {
            hudCache[key] = value;
            el.textContent = value;
        }
    }

    function syncHud() {
        setText(hudRound, String(roundIndex + 1), 'round');
        setText(hudScore, String(coinCount), 'coins');
        setText(
            hudLives,
            '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, CONFIG.lives - lives)),
            'lives'
        );
    }

    function updateText() {
        const round = R();
        if (roundTitle) roundTitle.textContent = 'Round ' + (roundIndex + 1) + ': ' + round.title;
        if (flavorText) flavorText.textContent = round.flavor;
    }

    function showBest() {
        if (!bestScore) return;
        const value = Number(load(CONFIG.bestKey) || 0);
        bestScore.textContent = value
            ? 'Best run: ' + value.toLocaleString() + ' coins'
            : '';
    }

    function saveBest() {
        const old = Number(load(CONFIG.bestKey) || 0);

        if (coinCount > old) {
            store(CONFIG.bestKey, String(coinCount));
        }

        showBest();
    }

    /* ---------------------------------------------------------------------
       Effects
       --------------------------------------------------------------------- */
    function burst(x, y, n, colors, speed, life, size, grav) {
        const count = reduceMotion ? Math.ceil(n / 2) : n;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * TAU;
            const s = (speed || 140) * (0.35 + Math.random() * 0.75);
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 40,
                life: (life || 0.6) * (0.7 + Math.random() * 0.6),
                max: life || 0.6,
                size: (size || 4) * (0.6 + Math.random() * 0.8),
                grav: grav == null ? 500 : grav,
                color: pick(colors),
                square: Math.random() > 0.5,
                rot: Math.random() * TAU
            });
        }
    }

    function confetti() {
        const colors = ['#ffd452', '#ff8fa3', '#9be8cf', '#bcaef0', '#9cc5f2', '#ffb56b'];
        for (let i = 0; i < 70; i++) {
            particles.push({
                x: rand(0, LW),
                y: rand(-40, 20),
                vx: rand(-60, 60),
                vy: rand(60, 220),
                life: rand(1.6, 2.6),
                max: 2.6,
                size: rand(4, 8),
                grav: 60,
                color: pick(colors),
                square: true,
                rot: Math.random() * TAU
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            p.vy += p.grav * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += dt * 6;
        }
        for (let i = floaters.length - 1; i >= 0; i--) {
            const f = floaters[i];
            f.life -= dt;
            f.y -= 34 * dt;
            if (f.life <= 0) floaters.splice(i, 1);
        }
    }

    function floater(text, x, y, color) {
        floaters.push({ text, x, y, life: 1.1, color: color || INK });
    }

    function toast(text) {
        toastText = text;
        toastT = 2.2;
    }

    function dust() {
        burst(PX - 6, GY - 2, 6, ['#ffffff', PAL.top], 70, 0.4, 3.5, 60);
    }

    /* ---------------------------------------------------------------------
       Spawning – obstacle patterns
       --------------------------------------------------------------------- */
    let measureCtx = null;

    function textW(str, size) {
        const c = ctx || measureCtx;
        c.font = '800 ' + size + 'px ' + FONT;
        return c.measureText(str).width;
    }

    function addCoin(x, h) {
        coinItems.push({ x, h, spin: rand(0, TAU) });
    }

    function arcSpan(x0, x1, h) {
        const n = Math.max(4, Math.round((x1 - x0) / 34));
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            addCoin(x0 + t * (x1 - x0), h + 22 + 4 * t * (1 - t) * 44);
        }
    }

    function lineCoins(x0, n, h, step) {
        for (let i = 0; i < n; i++) addCoin(x0 + i * step, h);
    }

    function addCrate(dx, h, round, pat) {
        const label = pick(round.labels.crate);
        const w = Math.max(38, Math.ceil(textW(label, 12)) + 16);
        const o = { type: 'crate', x: spawnX() + dx, w, h, label, pat };
        obstacles.push(o);
        return o;
    }

    function addFlag(dx, round, pat) {
        const label = pick(round.labels.flag);
        const w = Math.max(64, Math.ceil(textW(label, 11)) + 20);
        const o = { type: 'flag', x: spawnX() + dx, w, label, pat };
        obstacles.push(o);
        return o;
    }

    function addDrone(dx, pat) {
        const o = { type: 'drone', x: spawnX() + dx, w: 46, y: GY - 62, t: rand(0, 6), label: 'RECRUITER', pat };
        obstacles.push(o);
        return o;
    }

    function addBall(dx, pat) {
        const o = { type: 'ball', x: spawnX() + dx, w: 34, vx: -120, rot: 0, label: 'PRESSURE', pat };
        obstacles.push(o);
        return o;
    }

    function coinsOver(o) {
        arcSpan(o.x - 18, o.x + o.w + 18, o.h);
    }

    function coinsUnder(o) {
        for (let i = 0; i < 3; i++) addCoin(o.x + o.w * (i + 0.5) / 3, 12);
    }

    function addPower(x) {
        const kind = (!shield && Math.random() < 0.55) ? 'shield' : 'coffee';
        powerItems.push({ x, h: 38, kind, t: rand(0, 6) });
        nextPower = dist + rand(2600, 3800);
    }

    const PATTERNS = {
        crate(v, round) {
            const c = addCrate(0, pick([34, 40, 48]), round, 'crate');
            coinsOver(c);
            return { width: c.w };
        },

        tall(v, round) {
            const c = addCrate(0, pick([62, 70, 78]), round, 'tall');
            coinsOver(c);
            return { width: c.w };
        },

        // two crates close enough to clear with a single jump
        bunch(v, round) {
            const limit = v * 0.55 - 30;
            const a = addCrate(0, pick([34, 40]), round, 'bunch');
            const gap = rand(10, 28);
            const b = addCrate(a.w + gap, pick([34, 40, 46]), round, 'bunch');
            if (a.w + gap + b.w > limit) {
                obstacles.pop();
                coinsOver(a);
                return { width: a.w };
            }
            arcSpan(a.x - 18, b.x + b.w + 18, Math.max(a.h, b.h));
            return { width: a.w + gap + b.w };
        },

        // two crates far enough apart to need two separate jumps
        hop2(v, round) {
            const a = addCrate(0, pick([34, 40]), round, 'hop2');
            const gap = v * 0.78 * round.tight;
            const b = addCrate(a.w + gap, pick([34, 40, 48]), round, 'hop2');
            coinsOver(a);
            coinsOver(b);
            return { width: a.w + gap + b.w };
        },

        // small step, then a taller one
        stairs(v, round) {
            const limit = v * 0.5 - 30;
            const lo = addCrate(0, 34, round, 'stairs');
            const hi = addCrate(lo.w + 3, pick([66, 74]), round, 'stairs');
            if (lo.w + 3 + hi.w > limit) {
                obstacles.pop();
                coinsOver(lo);
                return { width: lo.w };
            }
            arcSpan(lo.x - 18, hi.x + hi.w + 18, hi.h);
            return { width: lo.w + 3 + hi.w };
        },

        // hanging banner: slide under it
        flag(v, round) {
            const f = addFlag(0, round, 'flag');
            coinsUnder(f);
            return { width: f.w };
        },

        flagCrate(v, round) {
            const f = addFlag(0, round, 'flagCrate');
            const gap = v * 0.8 * round.tight;
            const c = addCrate(f.w + gap, pick([34, 40, 48]), round, 'flagCrate');
            coinsUnder(f);
            coinsOver(c);
            return { width: f.w + gap + c.w };
        },

        crateFlag(v, round) {
            const c = addCrate(0, pick([34, 40, 48]), round, 'crateFlag');
            const gap = v * 0.85 * round.tight;
            const f = addFlag(c.w + gap, round, 'crateFlag');
            coinsOver(c);
            coinsUnder(f);
            return { width: c.w + gap + f.w };
        },

        // low drone: don't jump, just run (or slide) under it
        drone(v) {
            const d = addDrone(0, 'drone');
            lineCoins(d.x - 4, 3, 14, 22);
            return { width: d.w };
        },

        droneCrate(v, round) {
            const d = addDrone(0, 'droneCrate');
            const gap = v * 0.75 * round.tight;
            const c = addCrate(d.w + gap, pick([34, 40]), round, 'droneCrate');
            lineCoins(d.x - 4, 3, 14, 22);
            coinsOver(c);
            return { width: d.w + gap + c.w };
        },

        // fast rolling ball
        ball() {
            addBall(0, 'ball');
            return { width: 34, gapMult: 1.35 };
        },

        // banner, crate, banner, crate
        gauntlet(v, round) {
            const k = round.tight;
            let off = 0;
            const f1 = addFlag(off, round, 'gauntlet');
            off += f1.w + v * 0.82 * k;
            const c1 = addCrate(off, 40, round, 'gauntlet');
            off += c1.w + v * 0.86 * k;
            const f2 = addFlag(off, round, 'gauntlet');
            off += f2.w + v * 0.82 * k;
            const c2 = addCrate(off, 40, round, 'gauntlet');
            coinsUnder(f1);
            coinsOver(c1);
            coinsUnder(f2);
            coinsOver(c2);
            return { width: off + c2.w, gapMult: 1.05 };
        },

        // breather with free coins (and sometimes a power-up)
        coins() {
            const x0 = spawnX();
            let width;
            if (Math.random() < 0.5) {
                lineCoins(x0, 7, 16, 28);
                width = 7 * 28;
            } else {
                const n = 9;
                for (let i = 0; i < n; i++) {
                    const t = i / (n - 1);
                    addCoin(x0 + t * 220, 24 + 4 * t * (1 - t) * 95);
                }
                width = 230;
            }
            if (dist >= nextPower) addPower(x0 + width * 0.5);
            return { width, gapMult: 0.55 };
        }
    };

    function baseSpeed() {
        const round = R();
        const p = clamp(roundDist() / round.length, 0, 1);
        return round.speed + p * 40;
    }

    function worldSpeed() {
        let v = baseSpeed() * runEase;
        if (rush > 0) v *= RUSH_SPEED;
        return v;
    }

    function spawnPattern() {
        const round = R();
        const v = baseSpeed();
        const name = weighted(round.pool, lastPattern);
        lastPattern = name;
        const spec = PATTERNS[name](v, round);
        nextSpawn = dist + spec.width +
            v * (round.gap + rand(0, 0.45)) * (spec.gapMult || 1);
    }

    function spawnDoor() {
        doorSpawned = true;
        const last = roundIndex === ROUNDS.length - 1;
        const wait = Math.max(0, nextSpawn - dist);
        doors.push({
            x: spawnX() + wait + 60,
            w: 78,
            h: 128,
            passed: false,
            label: last ? 'OFFER' : 'ROUND ' + (roundIndex + 2),
            final: last
        });
    }

    /* ---------------------------------------------------------------------
       Player controls
       --------------------------------------------------------------------- */
    function canControl() {
        return state === 'playing' || state === 'countdown';
    }

    function doJump(air) {
        sliding = false;
        slideT = 0;
        fastFall = false;
        vy = air ? AIR_V : JUMP_V;
        if (py <= 0) py = 0.01;
        coyote = 0;
        jumpBuffer = 0;
        if (air) {
            airJumps = 0;
            flipping = true;
            flip = 0.001;
            flipDir = Math.random() < 0.5 ? 1 : -1;
            burst(PX - 4, GY - py - 4, 7, ['#ffffff', '#d9d0f8'], 100, 0.35, 3.5, 200);
            sfx.air();
        }else {
            squash = -0.7;
            dust();
            sfx.jump();
        }
    }

    function pressJump() {
        if (!canControl()) return;
        const grounded = py <= 0.5 && vy <= 0;
        if (grounded || coyote > 0) {
            doJump(false);
        } else if (airJumps > 0 && (vy > 0 || py > 40)) {
            doJump(true);
        } else {
            jumpBuffer = BUFFER;
        }
    }

    function startSlide() {
        sliding = true;
        slideT = SLIDE_TIME;
        dust();
        sfx.slide();
    }

    function pressSlide() {
        if (!canControl()) return;
        if (py > 2) {
            fastFall = true;
            flipping = false;
            flip = 0;
            if (vy > -FAST_FALL_V) vy = -FAST_FALL_V;
        } else {
            startSlide();
        }
    }

    function updatePlayer(dt) {
        const grounded = py <= 0 && vy <= 0;
        if (grounded) {
            coyote = COYOTE;
            airJumps = 1;
        } else {
            coyote -= dt;
        }
        if (jumpBuffer > 0) jumpBuffer -= dt;

        if (py > 0 || vy > 0) {
            const g = GRAVITY * (vy < 0 ? FALL_MULT : 1);
            vy -= g * dt;
            py += vy * dt;
            if (py <= 0) {
                const impact = -vy;
                py = 0;
                vy = 0;
                flip = 0;
                flipping = false;
                if (impact > 250) {
                    squash = 1;
                    dust();

                    // Harder landing = slightly heavier sound.
                    if (impact > 650) {
                        sfx.land();
                        setTimeout(() => sfx.land(), 25);
                    } else {
                        sfx.land();
                    }
                }
                if (fastFall) {
                    fastFall = false;
                    startSlide();
                }
                if (jumpBuffer > 0) doJump(false);
            }
        }

        if (flipping) {
            flip += dt / 0.42 * TAU;
            if (flip >= TAU) {
                flip = 0;
                flipping = false;
            }
        }

        if (sliding) {
    slideT -= dt;
    slideSfxTimer -= dt;

    if (Math.random() < 0.5) {
        particles.push({
            x: PX + 16,
            y: GY - 2,
            vx: rand(-40, 20),
            vy: rand(-90, -30),
            life: 0.25,
            max: 0.25,
            size: 2.5,
            grav: 300,
            color: '#fff3b0',
            square: true,
            rot: 0
        });
    }

    // Occasional tiny friction swishes while sliding.
    if (slideSfxTimer <= 0 && slideT > 0.12) {
        slideSfxTimer = rand(0.11, 0.17);

        whoosh(
            rand(240, 340),
            rand(120, 180),
            rand(0.045, 0.065),
            0.005,
            'lowpass'
        );
    }

    if (slideT <= 0) {
        sliding = false;
        slideT = 0;
        slideSfxTimer = 0;
    }
}

        squash -= squash * Math.min(1, dt * 14);
    }

    /* ---------------------------------------------------------------------
       Collisions, pickups, damage
       --------------------------------------------------------------------- */
    function playerBox() {
        if (sliding) return { l: PX - 30, r: PX + 18, t: GY - 24, b: GY };
        const fy = GY - py;
        return { l: PX - 10, r: PX + 10, t: fy - STAND_H, b: fy - 2 };
    }

    function obstacleBox(o) {
        switch (o.type) {
            case 'crate':
                return { l: o.x + 3, r: o.x + o.w - 3, t: GY - o.h + 2, b: GY };
            case 'flag':
                return { l: o.x + 4, r: o.x + o.w - 4, t: GY - 170, b: GY - 40 };
            case 'drone': {
                const y = o.y + Math.sin(o.t * 3) * 6;
                return { l: o.x + 4, r: o.x + o.w - 4, t: y - 20, b: y };
            }
            default:
                return { l: o.x + 6, r: o.x + o.w - 6, t: GY - 29, b: GY };
        }
    }

    function smash(o) {
        o.dead = true;
        addCoins(2);
        floater('+2 coins', o.x + o.w / 2, GY - 60, '#e0a53a');
        burst(o.x + o.w / 2, GY - 24, 14, [HAZ, HAZ_DARK, '#fff'], 220, 0.6, 5, 500);
        shake = Math.max(shake, 4);
        sfx.smash();
    }

    function hurt(o) {
        lastHit = o.label || 'DEADLINE';
        if (shield) {
            shield = false;
            invuln = 1;
            burst(PX, GY - py - 28, 16, ['#bfe3ff', '#6fb2f0', '#fff'], 180, 0.5, 4, 100);
            sfx.pop();
            toast('Shield popped!');
            return;
        }
        lives -= 1;
        combo = 0;
        invuln = INVULN;
        runEase = 0.7;
        shake = 12;
        flash = 0.9;
        burst(PX, GY - py - 28, 16, [HAZ, '#fff', INK], 200, 0.55, 4, 500);
        sfx.hit();
        if (lives <= 0) {
            beginEnding('lose');
        } else {
            toast(lives === 1 ? 'Last life!' : 'Ouch. ' + lives + ' lives left');
        }
    }

    function addCoins(n) {
        coinCount += n;
        while (unlocked.length < CONFIG.skills.length &&
            Math.floor(coinCount / CONFIG.coinsPerSkill) > unlocked.length) {
            const skill = CONFIG.skills[unlocked.length];
            unlocked.push(skill);
            toast('Skill unlocked: ' + skill);
        }
        // mid-run "NEW BEST!" moment: fires once, the instant this run's
        // coin count overtakes the previous best (only if there IS a
        // previous best — first-ever run doesn't need the fanfare)
        if (!newBestFired && prevBest > 0 && coinCount > prevBest) {
            newBestFired = true;
            toast('NEW BEST! 🔥');
            floater('NEW BEST!', PX + 10, GY - py - 90, GOLD);
            burst(PX, GY - py - 40, 18, [GOLD, '#fff3b0', '#ffffff'], 200, 0.6, 4, 200);
            shake = Math.max(shake, 6);
            sfx.newBest();
        }
    }

    function collectCoin(c) {
        const prev = multiplier();
        combo += 1;
        addCoins(1);
        const m = multiplier();
        sfx.coin(combo);
        burst(c.x, GY - c.h, 5, [GOLD, '#fff3b0'], 110, 0.35, 3, 200);
        if (m > prev) floater('x' + m + ' combo', PX + 10, GY - py - 70, '#e0a53a');

    }

    function collectPower(p) {
    if (p.kind === 'shield') {
        sfx.shieldPower();

        burst(
            p.x,
            GY - p.h,
            14,
            ['#fff', '#bfe3ff', '#9be8cf'],
            180,
            0.55,
            4,
            120
        );

        shield = true;
        toast('Referral! Shield ready');

    } else {
        sfx.caffeinePower();

        burst(
            p.x,
            GY - p.h,
            16,
            ['#fff', '#ffd452', '#ffb56b'],
            210,
            0.50,
            4,
            140
        );

        rush = RUSH_TIME;
        invuln = Math.max(invuln, 0.3);
        toast('Caffeine rush! Smash everything');
    }
}

    function collide() {
        const pb = playerBox();

        for (const o of obstacles) {
            if (o.dead || o.hit) continue;
            if (!overlap(pb, obstacleBox(o))) continue;
            if (rush > 0) {
                smash(o);
                continue;
            }
            o.hit = true;
            if (invuln <= 0) hurt(o);
            if (state !== 'playing') return;
        }

        const cx0 = pb.l - 8;
        const cx1 = pb.r + 8;
        const cy0 = pb.t - 8;
        const cy1 = pb.b + 8;

        for (let i = coinItems.length - 1; i >= 0; i--) {
            const c = coinItems[i];
            const cy = GY - c.h;
            if (c.x > cx0 && c.x < cx1 && cy > cy0 && cy < cy1) {
                collectCoin(c);
                coinItems.splice(i, 1);
            }
        }

        for (let i = powerItems.length - 1; i >= 0; i--) {
            const p = powerItems[i];
            const cy = GY - p.h;
            if (p.x > cx0 - 8 && p.x < cx1 + 8 && cy > cy0 - 8 && cy < cy1 + 8) {
                collectPower(p);
                powerItems.splice(i, 1);
            }
        }
    }

    /* ---------------------------------------------------------------------
       World movement, rounds, endings
       --------------------------------------------------------------------- */
    function moveWorld(dx, dt) {
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const o = obstacles[i];
            o.x -= dx;
            if (o.type === 'ball') {
                o.x += o.vx * dt;
                o.rot += (dx - o.vx * dt) / 17;
            }
            if (o.type === 'drone') o.t += dt;
            if (o.dead || o.x + o.w < -80) obstacles.splice(i, 1);
        }

        for (let i = coinItems.length - 1; i >= 0; i--) {
            const c = coinItems[i];
            c.x -= dx;
            if (rush > 0 && c.x < PX + 150 && c.x > PX - 40) {
                const targetH = py + 26;
                c.x += (PX - c.x) * Math.min(1, dt * 9);
                c.h += (targetH - c.h) * Math.min(1, dt * 9);
            }
            if (c.x < -40) coinItems.splice(i, 1);
        }

        for (let i = powerItems.length - 1; i >= 0; i--) {
            const p = powerItems[i];
            p.x -= dx;
            p.t += dt;
            if (p.x < -40) powerItems.splice(i, 1);
        }

        for (let i = doors.length - 1; i >= 0; i--) {
            const d = doors[i];
            d.x -= dx;
            if (!d.passed && d.x + d.w / 2 < PX) {
                d.passed = true;
                advanceRound();
            }
            if (d.x + d.w < -100) doors.splice(i, 1);
        }
    }

    function showBanner() {
        bannerT = 2.8;
    }

    function advanceRound() {
        if (roundIndex >= ROUNDS.length - 1) {
            beginEnding('win');
            return;
        }
        palFrom = ROUNDS[roundIndex].pal;
        roundIndex += 1;
        palT = 0;
        roundStartDist = dist;
        doorSpawned = false;
        nextSpawn = dist + 260;
        addCoins(25);
        floater('+25 coins', PX + 10, GY - 80, '#e0a53a');
        sfx.round();
        showBanner();
        updateText();
    }

    function beginEnding(res) {
        state = 'ending';
        result = res;
        endT = 0;
        endV = Math.max(worldSpeed(), 120);
        sliding = false;
        fastFall = false;
        flipping = false;
        rush = 0;
        hud.classList.remove('game-started');
        if (dpad) dpad.classList.add('pre-start');

        if (res === 'lose') {
            vy = 520;
            py = 0.01;
            shake = 14;
            flash = 1;
            sfx.lose();
        } else {
            vy = 0;
            py = 0;
            addCoins(lives * 5);
            confetti();
            sfx.win();
        }
    }

    function finishRun() {
        state = 'over';
        saveBest();
        showEnd();
    }

    function buildLinkLine(label, url) {
        const row = document.createElement('span');
        row.className = 'game-link-row';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = label + ': ';
        row.appendChild(labelSpan);

        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = url;
        row.appendChild(a);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'game-copy-btn';
        btn.setAttribute('aria-label', 'Copy ' + label + ' link');
        btn.textContent = '⧉';
        row.appendChild(btn);

        function copyLink() {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(flash).catch(() => {});
            } else {
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e) { /* no-op */ }
                document.body.removeChild(ta);
                flash();
            }
        }

        function flash() {
            btn.textContent = '✓';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = '⧉';
                btn.classList.remove('copied');
            }, 1200);
        }

        a.addEventListener('click', copyLink);
        btn.addEventListener('click', copyLink);

        return row;
    }
    function showEnd() {
        const won = result === 'win';
        const h2 = winOverlay.querySelector('h2');
        const p = winOverlay.querySelector('p');

        if (h2) h2.textContent = won ? 'You got the offer! 🎉' : 'Interview failed.';
        if (p) {
            p.textContent = won
                ? 'Four rounds, one ridiculous sprint. You made it.'
                : (lastHit ? 'Rejected by "' + lastHit + '". Take another shot.' : 'Take another shot.');
        }
        if (playAgainBtn) playAgainBtn.textContent = won ? 'Run it back' : 'Try again';

        finalStats.textContent = '';
        const line = document.createElement('div');

        if (won) {
            line.textContent = 'Round 4/4 cleared · ' + coinCount + ' coins';
        } else {
            line.textContent = 'Reached Round ' + (roundIndex + 1) + '/4 · ' + coinCount + ' coins';
        }

        finalStats.appendChild(line);

        if (unlocked.length) {
            const small = document.createElement('small');
            small.textContent = 'Skills unlocked: ' + unlocked.join(' · ');
            finalStats.appendChild(small);
        }

        // On a win, replace the round title / flavor line above the canvas
        // with the actual links instead of the stale "Round 4: HR Round" text.
        if (won) {
            if (roundTitle) {
                roundTitle.innerHTML = '';
                roundTitle.appendChild(buildLinkLine('GitHub', 'https://github.com/PranavKohli24'));
            }
            if (flavorText) {
                flavorText.innerHTML = '';
                flavorText.appendChild(buildLinkLine('LinkedIn', 'https://linkedin.com/in/pranavkohli24'));
            }
        }

        document.getElementById('game').classList.toggle('win-links', won);

        if (shareBtn) shareBtn.classList.add('visible');

        winOverlay.classList.add('active');
    }

    /* ---------------------------------------------------------------------
   Shareable result card
   --------------------------------------------------------------------- */
function buildShareCanvas() {
    if (!shareCanvas) {
        shareCanvas = document.createElement('canvas');
        shareCanvas.width = 1200;
        shareCanvas.height = 630;
    }

    const c = shareCanvas.getContext('2d');
    const pal = PAL || ROUNDS[0].pal;
    const won = result === 'win';
    const W = 1200, H = 630;

    // Fallback fill, then the ACTUAL game frame, cover-fit
    c.fillStyle = pal.sky || '#efe9fb';
    c.fillRect(0, 0, W, H);

    const cw = canvas.width, ch = canvas.height;
    if (cw && ch) {
        const scale = Math.max(W / cw, H / ch);
        const dw = cw * scale, dh = ch * scale;
        c.drawImage(canvas, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    // Result badge, top-left, echoes the in-game banner style
    const kicker = won ? 'OFFER RECEIVED' : 'ROUND ' + (roundIndex + 1) + '/4';
    c.font = '800 20px ' + FONT;
    const kw = c.measureText(kicker).width + 32;
    rrShare(c, 32, 32, kw, 38, 19);
    c.fillStyle = won ? GOLD : '#ffffff';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.stroke();
    c.fillStyle = INK;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(kicker, 48, 51);

    // Bottom gradient so text stays legible over gameplay art
    const grad = c.createLinearGradient(0, H - 260, 0, H);
    grad.addColorStop(0, 'rgba(61,54,80,0)');
    grad.addColorStop(1, 'rgba(61,54,80,0.86)');
    c.fillStyle = grad;
    c.fillRect(0, H - 260, W, 260);

    // Headline
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    c.font = '800 46px ' + FONT;
    c.fillText(won ? 'I got the offer! 🎉' : 'Interview: rejected.', 56, H - 172);

    // Same description as the on-screen end card
    c.font = '600 21px ' + FONT;
    c.fillStyle = 'rgba(255,255,255,0.82)';
    const description = won
        ? 'Four rounds, one ridiculous sprint.'
        : (lastHit ? 'Rejected by "' + lastHit + '". Taking another shot.' : 'Taking another shot.');
    c.fillText(description, 56, H - 136);

    // Stat line
    c.font = '800 24px ' + FONT;
    c.fillStyle = GOLD;
    c.fillText(
        won ? 'Round 4/4 cleared · ' + coinCount + ' coins'
            : 'Reached Round ' + (roundIndex + 1) + '/4 · ' + coinCount + ' coins',
        56, H - 95
    );

    if (unlocked.length) {
        c.font = '600 17px ' + FONT;
        c.fillStyle = 'rgba(255,255,255,0.72)';
        c.fillText('Skills unlocked: ' + unlocked.join(' · '), 56, H - 62);
    }

    // Branding, bottom-right
    c.textAlign = 'right';
    c.font = '800 20px ' + FONT;
    c.fillStyle = '#ffffff';
    c.fillText('Escape the Interview', W - 56, H - 62);
    c.font = '600 15px ' + FONT;
    c.fillStyle = 'rgba(255,255,255,0.68)';
    c.fillText('a portfolio arcade game by Pranav Kohli', W - 56, H - 38);

    return shareCanvas;
}

// Rounded rectangle helper for the share card
function rrShare(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);

    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

function doShare() {
    ensureAudio();

    const c = buildShareCanvas();

    c.toBlob(blob => {
        if (!blob) return;

        let file = null;

        try {
            file = new File(
                [blob],
                'escape-the-interview.png',
                { type: 'image/png' }
            );
        } catch (e) {}

        if (
            file &&
            navigator.share &&
            navigator.canShare &&
            navigator.canShare({ files: [file] })
        ) {
            navigator.share({
                files: [file],
                title: 'Escape the Interview',
                text: result === 'win'
                    ? 'I just cleared the interview!'
                    : 'Playing this portfolio game made by Pranav Kohli'
            }).catch(() => {});

            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = 'escape-the-interview.png';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
}

    /* ---------------------------------------------------------------------
       State machine
       --------------------------------------------------------------------- */
    function start() {
        ensureAudio();

        musicStep = 0;
        musicNext = 0;
        state = 'countdown';
        result = 'lose';

        roundIndex = 0;
        coinCount = 0;
        combo = 0;
        lives = CONFIG.lives;

        dist = 0;
        roundStartDist = 0;
        countdown = 2.5;
        endT = 0;

        py = 0; vy = 0; coyote = 0; jumpBuffer = 0; airJumps = 1;
        sliding = false; slideT = 0; fastFall = false;
        flipping = false; flip = 0; squash = 0;

        invuln = 0; rush = 0; shield = false;
        shake = 0; flash = 0;

        palT = 1;
        palFrom = null;
        PAL = ROUNDS[0].pal;

        doorSpawned = false;
        lastPattern = '';
        nextSpawn = 520;
        nextPower = 1800;

        unlocked = [];
        lastHit = '';
        toastT = 0;
        bannerT = 0;
        prevBest = Number(load(CONFIG.bestKey) || 0);
        newBestFired = false;

        obstacles = [];
        coinItems = [];
        powerItems = [];
        doors = [];
        particles = [];
        floaters = [];

        startOverlay.classList.remove('active');
        pauseOverlay.classList.remove('active');
        winOverlay.classList.remove('active');
        if (shareBtn) shareBtn.classList.remove('visible');
        wrap.classList.remove('is-paused');
        pauseBtn.classList.remove('is-resume');
        pauseBtn.setAttribute('aria-label', 'Pause game');

        hud.classList.add('game-started');
        if (dpad) dpad.classList.remove('pre-start');

        document.getElementById('game').classList.remove('win-links');
        updateText();
        syncHud();
        sfx.tick();
    }

    function pause() {
        if (state !== 'playing' && state !== 'countdown') return;
        pausedFrom = state;
        state = 'paused';
        pauseOverlay.classList.add('active');
        wrap.classList.add('is-paused');
        pauseBtn.classList.add('is-resume');
        pauseBtn.setAttribute('aria-label', 'Resume game');
    }

    function resume() {
        if (state !== 'paused') return;
        state = pausedFrom;
        pauseOverlay.classList.remove('active');
        wrap.classList.remove('is-paused');
        pauseBtn.classList.remove('is-resume');
        pauseBtn.setAttribute('aria-label', 'Pause game');
        lastFrame = performance.now();
    }

    function updateFootsteps(dt, speed) {
        if (state !== 'playing') {
            footstepTimer = 0;
            return;
        }

        if (sliding || py > 1 || vy > 0) {
            footstepTimer = 0;
            return;
        }

        // Faster game = faster footsteps.
        const interval = clamp(
            0.235 - (speed - 300) * 0.00018,
            0.155,
            0.235
        );

        footstepTimer += dt;

        if (footstepTimer >= interval) {
            footstepTimer -= interval;

            footstepSide ^= 1;
            sfx.footstep(footstepSide);
        }
    }

    function stepPlaying(dt) {
        runEase = Math.min(1, runEase + dt * 0.8);

        if (invuln > 0) invuln -= dt;
        if (rush > 0) {
            rush -= dt;
            if (Math.random() < 0.6) {
                particles.push({
                    x: PX - 14, y: GY - py - rand(8, 34),
                    vx: rand(-160, -80), vy: rand(-30, 30),
                    life: 0.3, max: 0.3, size: rand(2.5, 5), grav: 0,
                    color: pick(['#ffb56b', '#ffe08a', '#fff']),
                    square: true, rot: 0
                });
            }
            if (rush <= 0) {
                rush = 0;
                invuln = Math.max(invuln, 0.8);
                toast('Caffeine wore off');
            }
        }

        const v = worldSpeed();
        const dx = v * dt;
        dist += dx;

        updatePlayer(dt);
        updateFootsteps(dt, v);

        moveWorld(dx, dt);

        if (state !== 'playing') return v;

        collide();
        if (state !== 'playing') return v;

        if (!doorSpawned) {
            if (roundDist() >= R().length) spawnDoor();
            else if (dist >= nextSpawn) spawnPattern();
        }
        return v;
    }

    function stepEnding(dt) {
        endT += dt;
        const slow = Math.max(0, 1 - endT * 1.4);

        if (result === 'lose') {
            vy -= GRAVITY * dt;
            py += vy * dt;
            if (py <= 0) {
                py = 0;
                if (vy < -220) {
                    vy = -vy * 0.35;
                    py = 0.01;
                } else {
                    vy = 0;
                }
            }
        } else {
            py = endT > 0.15 ? Math.abs(Math.sin(endT * 6.5)) * 42 : 0;
        }

        if (endT >= (result === 'win' ? 2.4 : 1.25)) finishRun();
        return endV * slow;
    }

    function update(dt) {
        worldT += dt;

        if (shake > 0) shake = Math.max(0, shake - dt * 45);
        if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
        if (palT < 1) palT = Math.min(1, palT + dt / 1.1);
        if (toastT > 0) toastT -= dt;
        if (bannerT > 0) bannerT -= dt;

        let v = 0;

        if (state === 'menu') {
            v = 70;
        } else if (state === 'countdown') {
            v = 85;
            countdown -= dt;
            updatePlayer(dt);
            const n = Math.ceil((countdown - 0.4) / 0.7);
            if (n !== hudCache.count && n >= 1) {
                hudCache.count = n;
                sfx.tick();
            }
            if (countdown <= 0) {
                state = 'playing';
                runEase = 0.6;
                showBanner();
                sfx.go();
            }
        } else if (state === 'playing') {
            v = stepPlaying(dt);
        } else if (state === 'ending') {
            v = stepEnding(dt);
        }

        scroll += v * dt;
        if (v > 8) runPhase += dt * (6 + v * 0.012);

        updateParticles(dt);
    }

    /* ---------------------------------------------------------------------
       Drawing helpers
       --------------------------------------------------------------------- */
    function rr(x, y, w, h, r) {
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function circle(x, y, r) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
    }

    function fillStroke(fill, lw) {
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = lw || 2.5;
        ctx.strokeStyle = INK;
        ctx.stroke();
    }

    function text(str, x, y, size, color, weight, align) {
        ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
    }

    function outlinedText(str, x, y, size, color, weight) {
        ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(str, x, y);
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
    }

    function blob(cx, cy, r) {
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, TAU);
    }

    /* ---------------------------------------------------------------------
       Drawing – world
       --------------------------------------------------------------------- */
    function drawSky() {
        ctx.fillStyle = PAL.sky;
        ctx.fillRect(0, 0, LW, LH);
    }

    function drawBackground() {
        // sun
        ctx.fillStyle = PAL.sun;
        circle(LW * 0.78, GY * 0.3, 44);
        ctx.fill();

        // clouds
        ctx.fillStyle = PAL.cloud;
        const span = LW + 300;
        for (let i = 0; i < 6; i++) {
            const cx = (((i * span / 6 - scroll * 0.06) % span) + span) % span - 150;
            const cy = 34 + ((i * 41) % 70);
            const s = 0.8 + (i % 3) * 0.25;
            ctx.beginPath();
            blob(cx, cy, 13 * s);
            blob(cx + 17 * s, cy - 8 * s, 17 * s);
            blob(cx + 35 * s, cy, 13 * s);
            ctx.rect(cx, cy, 35 * s, 13 * s);
            ctx.fill();
        }

        // far skyline
        const tile = 74;
        const off = scroll * 0.16;
        for (let i = Math.floor(off / tile) - 1; i * tile - off < LW + tile; i++) {
            const h = 46 + hash(i) * 84;
            const w = 46 + hash(i + 40) * 24;
            const x = i * tile - off;

            ctx.fillStyle = PAL.far;
            rr(x, GY - h, w, h + 6, 6);
            ctx.fill();

            const r = hash(i + 9);
            if (r > 0.6 && w > 58) {
                // named building sign, only on wide-enough buildings
                const name = SKYLINE_NAMES[Math.floor(hash(i + 21) * SKYLINE_NAMES.length)];
                ctx.fillStyle = PAL.detail;
                rr(x + 6, GY - h + 10, w - 12, 13, 3);
                ctx.fill();
                text(name, x + w / 2, GY - h + 16.5, 8.5, PAL.sky, 800);
            } else if (r > 0.4) {
                ctx.fillRect(x + w / 2 - 1.5, GY - h - 14, 3, 14);
            }
        }

        drawMidProps();
    }

    function drawMidProps() {
        const tile = 190;
        const off = scroll * 0.42;
        for (let i = Math.floor(off / tile) - 1; i * tile - off < LW + tile; i++) {
            const x = i * tile - off + hash(i + 3) * 60;
            const kind = Math.floor(hash(i + 11) * 4);
            const b = GY;

            ctx.fillStyle = PAL.mid;
            if (kind === 0) {           // plant
                rr(x, b - 16, 22, 16, 4); ctx.fill();
                ctx.beginPath();
                blob(x + 11, b - 38, 14);
                blob(x + 1, b - 28, 9);
                blob(x + 21, b - 28, 9);
                ctx.fill();
            } else if (kind === 1) {    // monitor
                rr(x, b - 58, 64, 42, 6); ctx.fill();
                ctx.fillRect(x + 28, b - 18, 8, 18);
                rr(x + 16, b - 5, 32, 5, 2); ctx.fill();
                ctx.fillStyle = PAL.sky;
                rr(x + 6, b - 52, 52, 30, 3); ctx.fill();
            } else if (kind === 2) {    // résumé sheet
                rr(x, b - 74, 48, 64, 5); ctx.fill();
                ctx.fillStyle = PAL.sky;
                ctx.fillRect(x + 8, b - 62, 32, 4);
                ctx.fillRect(x + 8, b - 52, 24, 3);
                ctx.fillRect(x + 8, b - 44, 30, 3);
                ctx.fillRect(x + 8, b - 36, 20, 3);
            } else {                    // filing cabinet
                rr(x, b - 66, 42, 66, 4); ctx.fill();
                ctx.fillStyle = PAL.sky;
                for (let k = 0; k < 3; k++) {
                    rr(x + 14, b - 56 + k * 20, 14, 5, 2); ctx.fill();
                }
            }
        }
    }

    function drawGround() {
        ctx.fillStyle = PAL.ground;
        ctx.fillRect(0, GY, LW, LH - GY);
        ctx.fillStyle = PAL.top;
        ctx.fillRect(0, GY, LW, 12);
        ctx.fillStyle = INK;
        ctx.fillRect(0, GY - 1.25, LW, 2.5);

        ctx.fillStyle = PAL.detail;
        const tile = 64;
        for (let i = Math.floor(scroll / tile) - 1; i * tile - scroll < LW + tile; i++) {
            const x = i * tile - scroll + hash(i + 5) * 26;
            rr(x, GY + 28, 22 + hash(i + 1) * 16, 4, 2); ctx.fill();
            rr(x + 34, GY + 52, 12 + hash(i + 2) * 12, 4, 2); ctx.fill();
        }
    }

    function drawSpeedLines() {
        if (rush <= 0) return;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (let i = 0; i < 9; i++) {
            const speed = 1100 + i * 90;
            const x = LW - (((worldT * speed + i * 173) % (LW + 240)) - 120);
            const y = 26 + ((i * 47) % (GY - 60));
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 50 + (i % 3) * 22, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawDoor(d) {
        const x = d.x;
        const w = d.w;
        const h = d.h;
        const y = GY - h;
        const open = d.x < PX + 46;
        const leaf = d.final ? GOLD : PAL.accent;

        rr(x - 7, y - 7, w + 14, h + 7, 9);
        fillStroke('#fffdf8', 2.5);

        rr(x, y, w, h, 5);
        fillStroke(open ? '#fff6cf' : leaf, 2.5);

        if (!open) {
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.35;
            rr(x + 10, y + 12, w - 20, 40, 4); ctx.fill();
            rr(x + 10, y + 62, w - 20, 50, 4); ctx.fill();
            ctx.globalAlpha = 1;
            circle(x + w - 13, y + h * 0.55, 4.5);
            fillStroke('#fffdf8', 2);
        } else {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 20, y + 9);
            ctx.lineTo(x + 20, y + h - 3);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            fillStroke(leaf, 2.5);
        }

        const sw = Math.max(66, textW(d.label, 12) + 20);
        rr(x + w / 2 - sw / 2, y - 38, sw, 24, 8);
        fillStroke(d.final ? GOLD : '#ffffff', 2.5);
        text(d.label, x + w / 2, y - 26, 12, INK, 800);
    }

    function drawCoin(c) {
        const y = GY - c.h + Math.sin(worldT * 4 + c.spin) * 2;
        const sx = 0.35 + 0.65 * Math.abs(Math.cos(worldT * 4 + c.spin));
        ctx.save();
        ctx.translate(c.x, y);
        ctx.scale(sx, 1);
        circle(0, 0, 8);
        fillStroke(GOLD, 2);
        ctx.fillStyle = '#fff3b0';
        circle(-2, -2, 2.6);
        ctx.fill();
        ctx.restore();
    }

    function drawPower(p) {
        const y = GY - p.h + Math.sin(p.t * 3) * 4;
        ctx.save();
        ctx.translate(p.x, y);

        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        circle(0, 0, 21);
        ctx.fill();
        ctx.globalAlpha = 1;

        circle(0, 0, 14);
        fillStroke(p.kind === 'shield' ? '#bfe3ff' : '#ffdcb8', 2.5);

        if (p.kind === 'shield') {
            ctx.beginPath();
            ctx.moveTo(0, -8);
            ctx.lineTo(7, -4);
            ctx.lineTo(6, 3);
            ctx.quadraticCurveTo(0, 9, -6, 3);
            ctx.lineTo(-7, -4);
            ctx.closePath();
            fillStroke('#ffffff', 2);
        } else {
            rr(-6, -3, 10, 10, 2.5);
            fillStroke('#ffffff', 2);
            ctx.beginPath();
            ctx.arc(5, 2, 3.4, -Math.PI / 2, Math.PI / 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = INK;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-2, -5); ctx.quadraticCurveTo(0, -8, -2, -10);
            ctx.moveTo(2, -5); ctx.quadraticCurveTo(4, -8, 2, -10);
            ctx.lineWidth = 1.6;
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawCrate(o) {
        const y = GY - o.h;
        ctx.save();
        if (o.hit) ctx.globalAlpha = 0.5;

        rr(o.x, y, o.w, o.h, 7);
        ctx.fillStyle = HAZ;
        ctx.fill();

        ctx.save();
        rr(o.x, y, o.w, o.h, 7);
        ctx.clip();
        ctx.fillStyle = HAZ_DARK;
        ctx.fillRect(o.x, GY - 10, o.w, 10);
        ctx.restore();

        rr(o.x, y, o.w, o.h, 7);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = INK;
        ctx.stroke();

        text(o.label, o.x + o.w / 2, y + (o.h - 10) / 2, 12, INK, 800);
        ctx.restore();
    }

    function drawFlag(o) {
        const top = GY - 170;
        const bot = GY - 40;
        const x = o.x;
        const w = o.w;
        ctx.save();
        if (o.hit) ctx.globalAlpha = 0.5;

        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.22, 0); ctx.lineTo(x + w * 0.22, top);
        ctx.moveTo(x + w * 0.78, 0); ctx.lineTo(x + w * 0.78, top);
        ctx.stroke();

        rr(x - 3, top - 4, w + 6, 10, 4);
        fillStroke(HAZ_DARK, 2.2);

        ctx.beginPath();
        ctx.moveTo(x, top + 6);
        ctx.lineTo(x + w, top + 6);
        ctx.lineTo(x + w, bot);
        ctx.lineTo(x + w / 2, bot - 14);
        ctx.lineTo(x, bot);
        ctx.closePath();
        fillStroke(HAZ, 2.5);

        // down arrow = "slide under me"
        const ax = x + w / 2;
        const ay = top + 34;
        ctx.beginPath();
        ctx.moveTo(ax - 10, ay);
        ctx.lineTo(ax + 10, ay);
        ctx.lineTo(ax, ay + 14);
        ctx.closePath();
        fillStroke('#ffffff', 2);

        text(o.label, ax, bot - 32, 11, INK, 800);
        ctx.restore();
    }

    function drawDrone(o) {
        const y = o.y + Math.sin(o.t * 3) * 6;
        const cx = o.x + o.w / 2;
        const cy = y - 10;
        ctx.save();
        if (o.hit) ctx.globalAlpha = 0.5;

        const spin = Math.abs(Math.sin(worldT * 30));
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 15, 5 + 17 * spin, 2.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillRect(cx - 1.5, cy - 14, 3, 6);

        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy + 9); ctx.lineTo(cx - 10, cy + 14);
        ctx.moveTo(cx + 10, cy + 9); ctx.lineTo(cx + 10, cy + 14);
        ctx.stroke();

        rr(cx - 22, cy - 9, 44, 19, 9);
        fillStroke(HAZ, 2.5);
        circle(cx + 8, cy, 5);
        fillStroke('#ffffff', 2);
        ctx.fillStyle = INK;
        circle(cx + 9.5, cy, 2);
        ctx.fill();
        ctx.restore();
    }

    function drawBall(o) {
        const cx = o.x + 17;
        const cy = GY - 17;
        ctx.save();
        if (o.hit) ctx.globalAlpha = 0.5;
        ctx.translate(cx, cy);
        ctx.rotate(o.rot);
        circle(0, 0, 17);
        fillStroke(HAZ, 2.5);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-17, 0); ctx.lineTo(17, 0);
        ctx.moveTo(0, -17); ctx.lineTo(0, 17);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        circle(0, 0, 5);
        fillStroke('#ffffff', 2);
        ctx.restore();
    }

    function drawObstacle(o) {
        if (o.x > LW + 120) return;
        if (o.type === 'crate') drawCrate(o);
        else if (o.type === 'flag') drawFlag(o);
        else if (o.type === 'drone') drawDrone(o);
        else drawBall(o);
    }

    /* ---------------------------------------------------------------------
       Drawing – the robot
       --------------------------------------------------------------------- */
    const HIP_Y = -19;
    const THIGH = 9.5;
    const SHIN = 9.5;
    const ARM_UP = 7;
    const ARM_LOW = 7;
    const SOLE = 3;

    // eases the visual pose between run/air/slide/etc so limbs don't
    // teleport on a mode switch; gameplay timing is untouched
    let poseBlend = { t: 1, from: null, current: null };
    let poseLastMode = null;

    function footY(l) {
        return HIP_Y + Math.cos(l.a) * THIGH + Math.cos(l.a - l.k) * SHIN;
    }

    function drawLimb(sx, sy, a1, a2, l1, l2, color, isLeg) {
        const kx = sx + Math.sin(a1) * l1;
        const ky = sy + Math.cos(a1) * l1;
        const fx = kx + Math.sin(a2) * l2;
        const fy = ky + Math.cos(a2) * l2;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(kx, ky);
        ctx.lineTo(fx, fy);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.stroke();

        if (isLeg) {
            rr(fx - 4, fy - 3, 12, 6.5, 3);
            fillStroke(color, 2);
        } else {
            circle(fx, fy, 3.6);
            fillStroke(color, 2);
        }
    }

    function drawEyes(kind, blink) {
        const cy = -48.5;
        const xs = [-2, 7];
        ctx.fillStyle = BOT.glow;
        ctx.strokeStyle = BOT.glow;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';

        xs.forEach(ex => {
            if (kind === 'x') {
                ctx.beginPath();
                ctx.moveTo(ex - 2.6, cy - 2.6); ctx.lineTo(ex + 2.6, cy + 2.6);
                ctx.moveTo(ex + 2.6, cy - 2.6); ctx.lineTo(ex - 2.6, cy + 2.6);
                ctx.stroke();
            } else if (kind === 'happy') {
                ctx.beginPath();
                ctx.arc(ex, cy + 2, 3, Math.PI, TAU);
                ctx.stroke();
            } else {
                const h = blink ? 1.6 : 6.5;
                rr(ex - 1.8, cy - h / 2, 3.6, h, 1.8);
                ctx.fill();
            }
        });
    }

    function drawRobot(o) {
        const mode = o.mode;
        const p = o.phase;
        let legN, legF, armN, armF;
        let lean = 0;
        let dy = 0;
        let bounce = 0;
        let thrust = false;
        let eyes = 'open';
        let headBob = 0;

        if (mode === 'run') {
            legN = { a: 0.75 * Math.sin(p), k: 0.15 + 0.95 * Math.max(0, Math.cos(p)) };
            legF = { a: 0.75 * Math.sin(p + Math.PI), k: 0.15 + 0.95 * Math.max(0, Math.cos(p + Math.PI)) };
            armN = { a: -0.85 * Math.sin(p), e: 1.0 };
            armF = { a: 0.85 * Math.sin(p), e: 1.0 };
            // slow secondary wave on lean/head so consecutive strides
            // aren't perfectly identical, like natural weight-shifting
            lean = 0.09 + Math.sin(p * 0.5) * 0.025;
            bounce = Math.abs(Math.sin(p)) * 2.2;
            headBob = Math.sin(p * 2) * 0.8 + Math.sin(p * 0.5) * 0.35;
            dy = -(Math.max(footY(legN), footY(legF)) + SOLE);
        } else if (mode === 'air') {
            if (o.vy > 0) {
                legN = { a: 0.95, k: 1.0 };
                legF = { a: -0.5, k: 0.7 };
                // both arms reach up and slightly back on takeoff,
                // clear of the face
                armN = { a: 3.0, e: 0.5 };
                armF = { a: -2.7, e: 0.5 };
                lean = -0.04;
                thrust = true;
            } else {
                legN = { a: 0.45, k: 0.35 };
                legF = { a: -0.3, k: 0.25 };
                armN = { a: 1.5, e: 0.3 };
                armF = { a: -1.0, e: 0.3 };
                lean = 0.12;
            }
            dy = -SOLE;
        } else if (mode === 'slide') {
            legN = { a: 0.08, k: 0 };
            legF = { a: -0.05, k: 0 };
            // arms reach forward and slightly bent, like bracing for balance
            // low to the ground, instead of tucked up near the head
            armN = { a: 1.3, e: 0.3 };
            armF = { a: 1.1, e: 0.2 };
            thrust = true;
        } else if (mode === 'dead') {
            legN = { a: 0.6, k: 0.2 };
            legF = { a: -0.7, k: 0.3 };
            armN = { a: 2.2, e: 0.2 };
            armF = { a: -2.0, e: 0.2 };
            eyes = 'x';
        } else { // win
            const w = Math.sin(worldT * 12) * 0.25;
            legN = { a: 0.35, k: 0.35 };
            legF = { a: -0.3, k: 0.3 };
            armN = { a: 2.7 + w, e: 0.2 };
            armF = { a: 2.7 - w, e: 0.2 };
            eyes = 'happy';
            dy = -SOLE;
        }

                if (mode !== poseLastMode) {
            poseBlend.from = poseBlend.current || { legN, legF, armN, armF, lean };
            poseBlend.t = 0;
            poseLastMode = mode;
        }
        poseBlend.t = Math.min(1, poseBlend.t + 0.14);
        if (poseBlend.t < 1 && poseBlend.from) {
            const bt = poseBlend.t;
            const bl = (a, b) => a + (b - a) * bt;
            legN = { a: bl(poseBlend.from.legN.a, legN.a), k: bl(poseBlend.from.legN.k, legN.k) };
            legF = { a: bl(poseBlend.from.legF.a, legF.a), k: bl(poseBlend.from.legF.k, legF.k) };
            armN = { a: bl(poseBlend.from.armN.a, armN.a), e: bl(poseBlend.from.armN.e, armN.e) };
            armF = { a: bl(poseBlend.from.armF.a, armF.a), e: bl(poseBlend.from.armF.e, armF.e) };
            lean = bl(poseBlend.from.lean, lean);
        }
        poseBlend.current = { legN, legF, armN, armF, lean };

        ctx.save();
        if (o.alpha != null) ctx.globalAlpha = o.alpha;

        if (mode === 'slide') {
            ctx.translate(o.x + 18, o.gy - 8);
            ctx.rotate(-1.38);
        } else {
            ctx.translate(o.x, o.gy + dy - bounce);
            const sq = o.squash || 0;
            if (sq) ctx.scale(1 + sq * 0.18, 1 - sq * 0.18);
            ctx.translate(0, HIP_Y);
            ctx.rotate(lean);
            ctx.translate(0, -HIP_Y);
            if (o.spin) {
                ctx.translate(0, -30);
                ctx.rotate(o.spin);
                ctx.translate(0, 30);
            }
        }

        // jet pack + flame
        rr(-18, -37, 8, 17, 3);
        fillStroke(BOT.pack, 2);
        if (thrust || o.rush) {
            const f = 8 + Math.random() * 7;
            ctx.beginPath();
            ctx.moveTo(-17, -20);
            ctx.lineTo(-11, -20);
            ctx.lineTo(-14, -20 + f);
            ctx.closePath();
            fillStroke('#ffb56b', 1.8);
        }

        // far limbs
                // laptop tucked under the far arm, held against the torso
        if (mode !== 'dead') {
            ctx.save();
            ctx.translate(-13, -27);
            ctx.rotate(-0.18);
            rr(-9, -1, 11, 8, 1.5);
            fillStroke(BOT.shell, 1.8);
            ctx.fillStyle = PAL.sky;
            rr(-8, -0.5, 9, 5.5, 1);
            ctx.fill();
            ctx.restore();
        }

        // far limbs
        drawLimb(0, -32, armF.a, armF.a + armF.e, ARM_UP, ARM_LOW, BOT.limbF, false);
        drawLimb(-2, HIP_Y, legF.a, legF.a - legF.k, THIGH, SHIN, BOT.limbF, true);
        
        // torso
        rr(-11, -37, 22, 20, 7);
        fillStroke(BOT.torso, 2.5);
        rr(-6, -32, 14, 9, 3.5);
        fillStroke(BOT.shell, 1.8);
        ctx.fillStyle = BOT.glow;
        circle(1, -27.5, 2.3);
        ctx.fill();

        // head
        const hy = headBob;
        ctx.save();
        ctx.translate(0, hy);

        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        const sway = -3 - Math.sin(o.t * 11) * 1.6 - clamp(o.vy * 0.004, -3, 3);
        ctx.beginPath();
        ctx.moveTo(2, -59);
        ctx.lineTo(2 + sway, -67);
        ctx.stroke();
        circle(2 + sway, -68.5, 3.3);
        fillStroke(BOT.ant, 2);

        rr(-14, -59, 28, 21, 8);
        fillStroke(BOT.shell, 2.5);
        circle(-14, -48, 2.8);
        fillStroke(BOT.torso, 2);

        if (avatarLoaded && CONFIG.avatarSrc) {
            ctx.save();
            circle(2, -48.5, 9);
            ctx.clip();
            ctx.drawImage(avatar, -7, -57.5, 18, 18);
            ctx.restore();
            circle(2, -48.5, 9);
            ctx.strokeStyle = BOT.glow;
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            rr(-11, -55, 22, 13, 5);
            ctx.fillStyle = INK;
            ctx.fill();
            drawEyes(eyes, o.blink);
        }
        ctx.restore();

        // near limbs
        drawLimb(3, HIP_Y, legN.a, legN.a - legN.k, THIGH, SHIN, BOT.limbN, true);
        drawLimb(0, -32, armN.a, armN.a + armN.e, ARM_UP, ARM_LOW, BOT.limbN, false);

        ctx.restore();
    }

    function drawPlayer() {
        const gy = GY - py;

        // ground shadow
        const shrink = 1 - clamp(py / 220, 0, 0.6);
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(PX + (sliding ? 6 : 0), GY + 3, (sliding ? 30 : 17) * shrink, 5 * shrink, 0, 0, TAU);
        ctx.fill();
        ctx.restore();

        let mode = 'run';
        if (state === 'ending' || state === 'over') mode = result === 'win' ? 'win' : 'dead';
        else if (sliding) mode = 'slide';
        else if (py > 0.5 || vy > 0) mode = 'air';

        let spin = 0;
        if (flipping) spin = flip * flipDir;
        if (mode === 'dead') spin = -1.4 * clamp(endT / 0.45, 0, 1);

        const flicker = invuln > 0 && rush <= 0 && Math.floor(worldT * 18) % 2 === 0;

        drawRobot({
            x: PX,
            gy,
            mode,
            phase: runPhase,
            vy,
            squash,
            spin,
            t: worldT,
            blink: (worldT % 3.4) < 0.12,
            alpha: flicker ? 0.4 : 1,
            rush: rush > 0
        });

        if (shield) {
            ctx.save();
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = '#bfe3ff';
            circle(PX, gy - 28, 40);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#6fb2f0';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([7, 6]);
            ctx.lineDashOffset = -worldT * 24;
            ctx.stroke();
            ctx.restore();
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1);
            ctx.fillStyle = p.color;
            if (p.square) {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            } else {
                circle(p.x, p.y, p.size / 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        for (const f of floaters) {
            ctx.globalAlpha = clamp(f.life * 2, 0, 1);
            outlinedText(f.text, f.x, f.y, 14, f.color, 800);
        }
        ctx.globalAlpha = 1;
    }

    /* ---------------------------------------------------------------------
       Drawing – in-canvas HUD
       --------------------------------------------------------------------- */
    function drawHud() {
        // four progress segments, one per round
        const segW = 44;
        const gap = 6;
        const total = ROUNDS.length * segW + (ROUNDS.length - 1) * gap;
        const x0 = LW / 2 - total / 2;
        for (let i = 0; i < ROUNDS.length; i++) {
            const x = x0 + i * (segW + gap);
            let p = 0;
            if (i < roundIndex) p = 1;
            else if (i === roundIndex) p = clamp(roundDist() / ROUNDS[i].length, 0, 1);
            if (state === 'over' && result === 'win') p = 1;

            rr(x, 12, segW, 9, 4.5);
            fillStroke('#ffffff', 2);
            if (p > 0) {
                rr(x, 12, Math.max(9, segW * p), 9, 4.5);
                fillStroke(PAL.accent, 2);
            }
        }

        // combo
        const m = multiplier();
        if (m > 1) {
            rr(LW - 74, 8, 62, 24, 12);
            fillStroke('#fff3b0', 2);
            text('x' + m + ' combo', LW - 43, 20.5, 11, INK, 800);
        }

        // power-ups
        let py2 = 8;
        if (rush > 0) {
            rr(12, py2, 104, 24, 12);
            fillStroke('#ffdcb8', 2);
            rr(18, py2 + 16, 92 * (rush / RUSH_TIME), 4, 2);
            ctx.fillStyle = HAZ_DARK;
            ctx.fill();
            text('Caffeine rush', 64, py2 + 8.5, 10.5, INK, 800);
            py2 += 30;
        }
        if (shield) {
            rr(12, py2, 78, 24, 12);
            fillStroke('#bfe3ff', 2);
            text('Shield', 51, py2 + 12.5, 11, INK, 800);
        }

        // toast
        if (toastT > 0) {
            const a = clamp(toastT / 0.4, 0, 1);
            const w = textW(toastText, 13) + 30;
            ctx.save();
            ctx.globalAlpha = a;
            rr(LW / 2 - w / 2, 34, w, 28, 14);
            fillStroke('#ffffff', 2);
            text(toastText, LW / 2, 48.5, 13, INK, 800);
            ctx.restore();
        }

        // round banner
        if (bannerT > 0 && state !== 'ending' && state !== 'over') {
            const a = clamp(Math.min(bannerT, 2.8 - bannerT) / 0.3, 0, 1);
            const round = R();
            const title = 'Round ' + (roundIndex + 1) + ' · ' + round.title;
            const w = Math.max(textW(title, 17), textW(round.flavor, 12)) + 44;
            const yOff = (1 - a) * -14;
            ctx.save();
            ctx.globalAlpha = a;
            rr(LW / 2 - w / 2, 74 + yOff, w, 54, 14);
            fillStroke('#ffffff', 2.5);
            text(title, LW / 2, 93 + yOff, 17, INK, 800);
            text(round.flavor, LW / 2, 114 + yOff, 12, '#6a6282', 600);
            ctx.restore();
        }
    }

    function drawCountdown() {
        if (state !== 'countdown') return;
        const n = Math.ceil((countdown - 0.4) / 0.7);
        const label = countdown <= 0.4 ? 'GO!' : String(Math.max(1, n));
        const size = label === 'GO!' ? 76 : 88;
        outlinedText(label, LW / 2, GY * 0.42, size, INK, 800);
        text(R().title, LW / 2, GY * 0.42 + 56, 14, INK, 700);
    }

    /* ---------------------------------------------------------------------
       Main draw
       --------------------------------------------------------------------- */
    function draw() {
        ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
        PAL = currentPal();

        drawSky();

        ctx.save();
        if (shake > 0 && !reduceMotion) {
            ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        }

        drawBackground();
        drawGround();
        drawSpeedLines();

        doors.forEach(drawDoor);
        coinItems.forEach(drawCoin);
        powerItems.forEach(drawPower);
        obstacles.forEach(drawObstacle);

        drawPlayer();
        drawParticles();
        ctx.restore();

        if (flash > 0 && !reduceMotion) {
            ctx.globalAlpha = flash * 0.22;
            ctx.fillStyle = HAZ;
            ctx.fillRect(0, 0, LW, LH);
            ctx.globalAlpha = 1;
        }

        if (state !== 'menu') drawHud();
        drawCountdown();
    }

    let locked = false;
    function setLock(on) {
        if (on === locked) return;
        locked = on;
        document.documentElement.classList.toggle('game-lock', on);
    }

    /* ---------------------------------------------------------------------
       Loop
       --------------------------------------------------------------------- */
    function sectionVisible() {
        const section = document.getElementById('game');
        return !!(section && section.classList.contains('active') &&
            !document.hidden && wrap.clientWidth > 0);
    }

    function loop(now) {
        requestAnimationFrame(loop);

        const dt = Math.min(0.033, Math.max(0, (now - lastFrame) / 1000));
        lastFrame = now;

        if (!sectionVisible()) {
            setLock(false);
            if (state === 'playing' || state === 'countdown') pause();
            return;
        }

        setLock(true);

        if (state === 'playing' || state === 'countdown') musicTick();

        if (state !== 'paused') {
            update(dt);
            if (state === 'ending' || state === 'over') {
                // keep the end screen alive but let the numbers settle
            }
        }

        syncHud();
        draw();
    }

    /* ---------------------------------------------------------------------
       Input
       --------------------------------------------------------------------- */
    function keydown(event) {
        const section = document.getElementById('game');
        if (!section || !section.classList.contains('active')) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target && event.target.isContentEditable)) return;

        const key = event.key;

        // stop the page from scrolling while the game section is open
        if (key === 'ArrowUp' || key === 'ArrowDown' ||
            (key === ' ' && tag !== 'BUTTON' && tag !== 'A')) {
            event.preventDefault();
        }

        if (key === 'm' || key === 'M') {
            setMuted(!muted);
            return;
        }

        if (key === 'Escape' || key === 'p' || key === 'P') {
            if (state === 'paused') resume();
            else pause();
            event.preventDefault();
            return;
        }

        // Enter / Space starts a run from the menu or end screen
        if ((key === 'Enter' || key === ' ') && tag !== 'BUTTON' && tag !== 'A') {
            if (state === 'menu' || state === 'over') {
                event.preventDefault();
                start();
                return;
            }
        }

        if (!canControl()) return;

        switch (key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
            case ' ':
                event.preventDefault();
                if (!event.repeat) pressJump();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                event.preventDefault();
                if (!event.repeat) pressSlide();
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
                event.preventDefault();
                break;
            default:
        }
    }

    function bindPress(btn, action) {
        if (!btn) return;
        let last = 0;
        btn.addEventListener('pointerdown', event => {
            event.preventDefault();
            last = performance.now();
            ensureAudio();
            action();
        });
        btn.addEventListener('click', () => {
            if (performance.now() - last > 500) {
                ensureAudio();
                action();
            }
        });
    }

    function pointerControls() {
        canvas.addEventListener('pointerdown', event => {
            gesture = { x: event.clientX, y: event.clientY };
        });

        canvas.addEventListener('pointerup', event => {
            if (!gesture) return;
            const dx = event.clientX - gesture.x;
            const dy = event.clientY - gesture.y;
            gesture = null;
            if (dy > 26 && Math.abs(dy) > Math.abs(dx)) pressSlide();
            else pressJump();
        });

        canvas.addEventListener('pointercancel', () => { gesture = null; });
    }

    function listeners() {
        window.addEventListener('keydown', keydown);

        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(resize).observe(wrap);
        } else {
            window.addEventListener('resize', resize);
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) pause();
        });

        startBtn.addEventListener('click', start);
        resumeBtn.addEventListener('click', resume);
        restartBtn.addEventListener('click', () => {
            pauseOverlay.classList.remove('active');
            wrap.classList.remove('is-paused');
            start();
        });
        playAgainBtn.addEventListener('click', start);

        pauseBtn.addEventListener('click', () => {
            if (state === 'paused') resume();
            else pause();
            pauseBtn.blur();
        });

        if (soundBtn) soundBtn.addEventListener('click', () => {
            setMuted(!muted);
            soundBtn.blur();
        });

        bindPress(document.getElementById('btnUp'), pressJump);
        bindPress(document.getElementById('btnDown'), pressSlide);

        pointerControls();
    }

    function init() {
        if (!bind()) return;

        if (typeof getComputedStyle === 'function') {
            const f = getComputedStyle(document.body).fontFamily;
            if (f) FONT = f;
        }
        reduceMotion = !!(window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);

        muted = load(CONFIG.muteKey) === '1';
        setMuted(muted);

        resize();

        startOverlay.classList.add('active');
        pauseOverlay.classList.remove('active');
        winOverlay.classList.remove('active');
        if (dpad) dpad.classList.add('pre-start');

        if (hint) {
            const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
            hint.textContent = touch
                ? 'Tap to jump (tap twice mid-air to double jump) · swipe down to slide'
                : 'Space or ↑ to jump (twice for a double jump) · ↓ to slide · P to pause · M to mute';
        }

        showBest();
        updateText();
        syncHud();
        listeners();

        state = 'menu';
        lastFrame = performance.now();
        requestAnimationFrame(loop);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();