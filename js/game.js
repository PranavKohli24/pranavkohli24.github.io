/**
 * Escape the Interview - Maze Game Module
 * A 4-round maze game themed around interview stages.
 * Lives inside the #game section, following the same nav pattern as blog/contact.
 */

(function() {
    'use strict';

    const ROUNDS = [
        {
            size: 7,
            title: "Round 1: Resume Screening",
            flavor: "They're skimming your resume for 6 seconds. Move fast."
        },
        {
            size: 9,
            title: "Round 2: Online Assessment",
            flavor: "Two hours, one maze, zero partial credit."
        },
        {
            size: 11,
            title: "Round 3: Technical Interview",
            flavor: "\"Can you optimize that?\" Yes. Find the exit faster."
        },
        {
            size: 13,
            title: "Round 4: HR Round",
            flavor: "Last one. Where do you see yourself in 5 minutes?"
        }
    ];

    const CELL = 32;

    const profileImg = new Image();
    let profileImgLoaded = false;

    profileImg.onload = () => {
        profileImgLoaded = true;
    };

    profileImg.src = 'Pranav.png';

    let canvas, ctx;

    let roundTitleEl,
        flavorEl,
        hudRound,
        hudMoves,
        hudTime,
        winOverlay,
        finalStats,
        bestScoreEl,
        playAgainBtn;

    let pauseBtn,
        resumeBtn,
        pauseOverlay,
        canvasWrap,
        gameHud;

    let grid,
        cols,
        rows,
        playerX,
        playerY,
        exitX,
        exitY;

    let currentRoundIndex = 0;
    let totalMoves = 0;

    let startTime = null;
    let timerInterval = null;

    let initialized = false;
    let gameStarted = false;

    let gamePaused = false;
    let pausedAt = null;

    let btnUp,
        btnDown,
        btnLeft,
        btnRight;

    let startOverlay,
        startBtn,
        dpadContainer;

    let gameSectionObserver = null;


    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }

        return arr;
    }


    function generateMaze(size) {
        cols = size;
        rows = size;

        const g = Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => ({
                visited: false,
                top: true,
                right: true,
                bottom: true,
                left: true
            }))
        );

        function neighbors(x, y) {
            const dirs = [
                [0, -1, 'top', 'bottom'],
                [1, 0, 'right', 'left'],
                [0, 1, 'bottom', 'top'],
                [-1, 0, 'left', 'right']
            ];

            const result = [];

            for (const [dx, dy, a, b] of dirs) {
                const nx = x + dx;
                const ny = y + dy;

                if (
                    nx >= 0 &&
                    nx < cols &&
                    ny >= 0 &&
                    ny < rows &&
                    !g[ny][nx].visited
                ) {
                    result.push([nx, ny, a, b]);
                }
            }

            return result;
        }

        const stack = [[0, 0]];
        g[0][0].visited = true;

        while (stack.length) {
            const [x, y] = stack[stack.length - 1];
            const ns = shuffle(neighbors(x, y));

            if (ns.length === 0) {
                stack.pop();
                continue;
            }

            const [nx, ny, a, b] = ns[0];

            g[y][x][a] = false;
            g[ny][nx][b] = false;
            g[ny][nx].visited = true;

            stack.push([nx, ny]);
        }

        return g;
    }


    function startRound(index, startClock) {
        currentRoundIndex = index;

        const round = ROUNDS[index];

        grid = generateMaze(round.size);

        playerX = 0;
        playerY = 0;

        exitX = round.size - 1;
        exitY = round.size - 1;

        // Render at actual screen pixel density so lines, the player dot,
        // and the profile photo all stay crisp on retina/high-DPI screens.
        const dpr = window.devicePixelRatio || 1;

        const logicalWidth = cols * CELL;
        const logicalHeight = rows * CELL;

        canvas.width = logicalWidth * dpr;
        canvas.height = logicalHeight * dpr;

        canvas.style.width = logicalWidth + 'px';
        canvas.style.height = logicalHeight + 'px';

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        roundTitleEl.textContent = round.title;
        flavorEl.textContent = round.flavor;
        hudRound.textContent = index + 1;
        hudMoves.textContent = totalMoves;

        if (index === 0 && startClock) {
            totalMoves = 0;
            hudMoves.textContent = 0;

            startTime = Date.now();

            if (timerInterval) {
                clearInterval(timerInterval);
            }

            timerInterval = setInterval(updateTimer, 100);
        }

        draw();
    }


    function updateTimer() {
        if (!startTime || gamePaused) return;

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        hudTime.textContent = elapsed + 's';
    }


    function pauseGame() {
        if (!gameStarted || gamePaused) return;
        if (winOverlay.classList.contains('active')) return;

        gamePaused = true;
        pausedAt = Date.now();

        clearInterval(timerInterval);
        timerInterval = null;

        canvasWrap.classList.add('is-paused');
        pauseOverlay.classList.add('active');

        pauseBtn.textContent = '▶';

        pauseBtn.setAttribute(
            'aria-label',
            'Resume game'
        );

        pauseBtn.setAttribute(
            'title',
            'Resume game'
        );
    }


    function resumeGame() {
        if (!gamePaused) return;

        const pauseDuration = Date.now() - pausedAt;

        // Shift the start time forward so paused time isn't counted.
        startTime += pauseDuration;

        pausedAt = null;
        gamePaused = false;

        canvasWrap.classList.remove('is-paused');
        pauseOverlay.classList.remove('active');

        pauseBtn.textContent = '⏸';

        pauseBtn.setAttribute(
            'aria-label',
            'Pause game'
        );

        pauseBtn.setAttribute(
            'title',
            'Pause game'
        );

        timerInterval = setInterval(updateTimer, 100);
    }


    function draw() {
        ctx.clearRect(
            0,
            0,
            cols * CELL,
            rows * CELL
        );

        ctx.strokeStyle = '#0a0a0a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cell = grid[y][x];

                const px = x * CELL;
                const py = y * CELL;

                ctx.beginPath();

                if (cell.top) {
                    ctx.moveTo(px, py);
                    ctx.lineTo(px + CELL, py);
                }

                if (cell.right) {
                    ctx.moveTo(px + CELL, py);
                    ctx.lineTo(px + CELL, py + CELL);
                }

                if (cell.bottom) {
                    ctx.moveTo(px, py + CELL);
                    ctx.lineTo(px + CELL, py + CELL);
                }

                if (cell.left) {
                    ctx.moveTo(px, py);
                    ctx.lineTo(px, py + CELL);
                }

                ctx.stroke();
            }
        }

        const exitCx = exitX * CELL + CELL / 2;
        const exitCy = exitY * CELL + CELL / 2;
        const exitRadius = CELL * 0.46;

        if (profileImgLoaded) {
            ctx.save();

            ctx.beginPath();
            ctx.arc(
                exitCx,
                exitCy,
                exitRadius,
                0,
                Math.PI * 2
            );

            ctx.closePath();
            ctx.clip();

            ctx.drawImage(
                profileImg,
                exitCx - exitRadius,
                exitCy - exitRadius,
                exitRadius * 2,
                exitRadius * 2
            );

            ctx.restore();

        } else {
            // fallback while image is still loading
            ctx.fillStyle = 'rgba(93, 0, 247, 0.12)';

            ctx.fillRect(
                exitX * CELL + 4,
                exitY * CELL + 4,
                CELL - 8,
                CELL - 8
            );
        }

        ctx.beginPath();

        ctx.fillStyle = '#5d00f7';

        ctx.arc(
            playerX * CELL + CELL / 2,
            playerY * CELL + CELL / 2,
            CELL * 0.28,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }


    function isGameSectionActive() {
        const section = document.getElementById('game');

        return section &&
            section.classList.contains('active');
    }


    function tryMove(dx, dy) {
        if (!gameStarted) return;
        if (gamePaused) return;
        if (winOverlay.classList.contains('active')) return;

        const cell = grid[playerY][playerX];

        if (dx === 1 && cell.right) return;
        if (dx === -1 && cell.left) return;
        if (dy === 1 && cell.bottom) return;
        if (dy === -1 && cell.top) return;

        const nx = playerX + dx;
        const ny = playerY + dy;

        if (
            nx < 0 ||
            nx >= cols ||
            ny < 0 ||
            ny >= rows
        ) {
            return;
        }

        playerX = nx;
        playerY = ny;

        totalMoves++;

        hudMoves.textContent = totalMoves;

        draw();

        if (
            playerX === exitX &&
            playerY === exitY
        ) {
            handleRoundComplete();
        }
    }


    function handleRoundComplete() {
        gamePaused = false;
        pausedAt = null;

        pauseOverlay.classList.remove('active');
        canvasWrap.classList.remove('is-paused');

        if (currentRoundIndex < ROUNDS.length - 1) {

            setTimeout(() => {
                startRound(
                    currentRoundIndex + 1,
                    true
                );
            }, 350);

        } else {

            clearInterval(timerInterval);
            timerInterval = null;

            gameHud.classList.remove('game-started');

            const totalTime = (
                (Date.now() - startTime) / 1000
            ).toFixed(1);

            finalStats.textContent =
                `${totalMoves} moves \u00b7 ${totalTime}s`;

            const best =
                localStorage.getItem('escapeInterviewBest');

            if (
                !best ||
                parseFloat(totalTime) < parseFloat(best)
            ) {
                localStorage.setItem(
                    'escapeInterviewBest',
                    totalTime
                );
            }

            winOverlay.classList.add('active');
        }
    }


    function showBest() {
        const best =
            localStorage.getItem('escapeInterviewBest');

        if (best) {
            bestScoreEl.textContent =
                `Your best escape: ${best}s`;
        }
    }


    function handleStart() {
        gameStarted = true;
        gamePaused = false;
        pausedAt = null;

        startOverlay.classList.remove('active');
        pauseOverlay.classList.remove('active');
        canvasWrap.classList.remove('is-paused');

        dpadContainer.classList.remove('pre-start');

        // Show pause button only after game starts.
        gameHud.classList.add('game-started');

        pauseBtn.textContent = '⏸';

        pauseBtn.setAttribute(
            'aria-label',
            'Pause game'
        );

        pauseBtn.setAttribute(
            'title',
            'Pause game'
        );

        startRound(0, true);
    }


    function resetGame() {
        winOverlay.classList.remove('active');

        gamePaused = false;
        pausedAt = null;

        pauseOverlay.classList.remove('active');
        canvasWrap.classList.remove('is-paused');

        // Show pause button again.
        gameHud.classList.add('game-started');

        pauseBtn.textContent = '⏸';

        pauseBtn.setAttribute(
            'aria-label',
            'Pause game'
        );

        pauseBtn.setAttribute(
            'title',
            'Pause game'
        );

        showBest();

        gameStarted = true;

        startRound(0, true);
    }


    function bindElements() {
        canvas = document.getElementById('mazeCanvas');

        if (!canvas) return false;

        ctx = canvas.getContext('2d');

        roundTitleEl =
            document.getElementById('roundTitle');

        flavorEl =
            document.getElementById('flavorText');

        hudRound =
            document.getElementById('hudRound');

        hudMoves =
            document.getElementById('hudMoves');

        hudTime =
            document.getElementById('hudTime');

        gameHud =
            document.getElementById('gameHud');

        winOverlay =
            document.getElementById('winOverlay');

        finalStats =
            document.getElementById('finalStats');

        bestScoreEl =
            document.getElementById('bestScore');

        playAgainBtn =
            document.getElementById('playAgainBtn');

        btnUp =
            document.getElementById('btnUp');

        btnDown =
            document.getElementById('btnDown');

        btnLeft =
            document.getElementById('btnLeft');

        btnRight =
            document.getElementById('btnRight');

        startOverlay =
            document.getElementById('startOverlay');

        startBtn =
            document.getElementById('startBtn');

        dpadContainer =
            document.getElementById('gameDpad');

        pauseBtn =
            document.getElementById('pauseBtn');

        resumeBtn =
            document.getElementById('resumeBtn');

        pauseOverlay =
            document.getElementById('pauseOverlay');

        canvasWrap =
            document.querySelector('.game-canvas-wrap');

        return true;
    }


    function attachListeners() {

        window.addEventListener('keydown', (e) => {
            if (!isGameSectionActive()) return;
            if (winOverlay.classList.contains('active')) return;

            let moved = true;

            switch (e.key) {
                case 'ArrowUp':
                case 'w':
                case 'W':
                    tryMove(0, -1);
                    break;

                case 'ArrowDown':
                case 's':
                case 'S':
                    tryMove(0, 1);
                    break;

                case 'ArrowLeft':
                case 'a':
                case 'A':
                    tryMove(-1, 0);
                    break;

                case 'ArrowRight':
                case 'd':
                case 'D':
                    tryMove(1, 0);
                    break;

                default:
                    moved = false;
            }

            // Prevent page scroll only while actually playing the game.
            if (moved && !gamePaused) {
                e.preventDefault();
            }
        });


        let touchStartX = 0;
        let touchStartY = 0;

        canvas.addEventListener(
            'touchstart',
            (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            },
            { passive: true }
        );


        canvas.addEventListener(
            'touchend',
            (e) => {
                if (gamePaused) return;

                const dx =
                    e.changedTouches[0].clientX -
                    touchStartX;

                const dy =
                    e.changedTouches[0].clientY -
                    touchStartY;

                if (
                    Math.abs(dx) < 20 &&
                    Math.abs(dy) < 20
                ) {
                    return;
                }

                if (Math.abs(dx) > Math.abs(dy)) {
                    tryMove(
                        dx > 0 ? 1 : -1,
                        0
                    );
                } else {
                    tryMove(
                        0,
                        dy > 0 ? 1 : -1
                    );
                }
            },
            { passive: true }
        );


        playAgainBtn.addEventListener(
            'click',
            resetGame
        );


        startBtn.addEventListener(
            'click',
            handleStart
        );


        pauseBtn.addEventListener(
            'click',
            () => {
                if (gamePaused) {
                    resumeGame();
                } else {
                    pauseGame();
                }
            }
        );


        resumeBtn.addEventListener(
            'click',
            resumeGame
        );


        // D-pad button controls
        const dpadMap = [
            [btnUp, 0, -1],
            [btnDown, 0, 1],
            [btnLeft, -1, 0],
            [btnRight, 1, 0]
        ];

        dpadMap.forEach(([btn, dx, dy]) => {
            if (!btn) return;

            btn.addEventListener(
                'click',
                () => tryMove(dx, dy)
            );

            // touchstart gives snappier response than click on mobile
            btn.addEventListener(
                'touchstart',
                (e) => {
                    e.preventDefault();
                    tryMove(dx, dy);
                },
                { passive: false }
            );
        });


        // Pause when the browser/tab becomes hidden.
        document.addEventListener(
            'visibilitychange',
            () => {
                if (
                    document.hidden &&
                    gameStarted &&
                    !gamePaused
                ) {
                    pauseGame();
                }
            }
        );
    }


    function observeGameSection() {
        const gameSection = document.getElementById('game');

        if (!gameSection) return;

        gameSectionObserver = new MutationObserver(() => {
            if (
                gameStarted &&
                !gamePaused &&
                !isGameSectionActive()
            ) {
                pauseGame();
            }
        });

        gameSectionObserver.observe(
            gameSection,
            {
                attributes: true,
                attributeFilter: ['class']
            }
        );
    }


    function init() {
        if (initialized) return;

        if (!bindElements()) return;

        attachListeners();
        observeGameSection();

        showBest();

        startRound(0, false);

        initialized = true;
    }


    // Same init timing as your other modules: run once DOM is ready.
    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            init
        );
    } else {
        init();
    }

})();