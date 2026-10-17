/**
 * Projects Renderer
 * Renders project strips, natural-language search and category filters.
 * Add, remove or edit projects only in projects-data.js.
 *
 * Search behaviour:
 * - This only ever filters by category (iOS, React, React Native,
 *   Angular, Backend, DSA) — it does not do free-text matching against
 *   titles/descriptions. Typing something that doesn't name a category
 *   (e.g. "show me" on its own) does nothing at all: no re-render, no
 *   "no results" state, the list just stays exactly as it was.
 * - Re-rendering is debounced (~320ms after the last keystroke), and in
 *   practice a category name only matches once it's typed in full (word
 *   boundaries), so there's no flicker while someone is mid-word.
 * - Pressing Enter / Search applies immediately, bypassing the debounce.
 *
 * Layout behaviour:
 * - Each project is a full-width strip, alternating media side for
 *   rhythm, divided by hairlines — not a grid of cards.
 * - Only the very first paint fades rows in on scroll. Re-renders caused
 *   by filtering/search swap content instantly with no animation, so the
 *   page never visibly "jumps" while someone is typing.
 *
 * Video preview/player behaviour (optional, per project):
 * - Set `video` on a project in projects-data.js and nothing else is
 *   required — the row automatically gets a hover-preview + click-to-play
 *   player. Leave it unset/empty and that project behaves exactly as
 *   before (static thumbnail only).
 * - Desktop hover: silent, muted preview plays once from the start.
 *   Moving the cursor away reverts to the thumbnail and resets the clip.
 * - Click/tap (desktop or mobile): the same video is promoted in place
 *   to a real player — unmuted, native controls — and keeps playing
 *   regardless of cursor movement, the way clicking a YouTube thumbnail
 *   hands you a real player instead of just a hover preview.
 * - Only one video (preview or active) plays anywhere on the page at a
 *   time; starting any other immediately stops and resets the last one.
 * - When a video finishes, on its own, it always reverts to the static
 *   thumbnail — whether it was a hover preview or a fully-watched clip.
 */
(function () {
    'use strict';

    const FILTER_CATEGORIES = ['iOS', 'React Native', 'Deep Learning', 'React', 'Backend', 'DSA'];

    const SEARCH_PLACEHOLDERS = [
        'Show me iOS projects',
        'Have you worked on React projects?',
        'Find React Native projects',
        'Show me your backend projects',
        'What have you built with AI?',
        'Do you have any DSA projects?',
        'Show me AI projects you worked on'
    ];

    const SEARCH_DEBOUNCE_MS = 320;
    const PLACEHOLDER_ROTATE_MS = 3000;

    // Check longer/overlapping category phrases before shorter ones.
    // Only matches the category's OWN name (and trivial spelling
    // variants like "React.js" / "ReactNative"). No tech-word synonyms
    // like "express", "node", "api", "mongodb" — those are real
    // technologies, so they're matched by the tech whole-word search
    // instead, against each project's actual `tech` list. That's what
    // keeps "express" from pulling in every Backend-tagged project
    // regardless of whether it really uses Express.
    const CATEGORY_RULES = [
        {
            category: 'React Native',
            pattern: /\breact[\s.-]*native\b|\breactnative\b/gi,
            strip: /\breact[\s.-]*native\b|\breactnative\b/gi
        },
        {
            category: 'iOS',
            pattern: /\bios\b/gi,
            strip: /\bios\b/gi
        },
        {
            category: 'Deep Learning',
            pattern: /\bdeep[\s.-]*learning\b/gi,
            strip: /\bdeep[\s.-]*learning\b/gi
        },
        {
            category: 'DSA',
            pattern: /\bdsa\b/gi,
            strip: /\bdsa\b/gi
        },
        {
            category: 'Backend',
            pattern: /\bback[\s-]?end\b/gi,
            strip: /\bback[\s-]?end\b/gi
        },
        {
            category: 'React',
            pattern: /\breact(?:[\s.-]*js)?\b|\bjsx\b/gi,
            strip: /\breact(?:[\s.-]*js)?\b/gi
        }
    ];
    // Maps a typed word to related terms that actually exist in
    // projects-data.js (title or tech_categories). Only add an entry
    // here if something real would match it.
    const SYNONYMS = {
        // Mobile development
        mobile: ['ios', 'react native', 'swift', 'swiftui', 'uikit'],
        app: ['ios', 'react native'],
        iphone: ['ios'],
        ipad: ['ios'],
        apple: ['ios'],
        android: ['react native'],

        // Frontend development
        frontend: ['react', 'react native', 'swiftui', 'uikit'],
        'front-end': ['react', 'react native', 'swiftui', 'uikit'],
        front: ['react', 'react native', 'swiftui', 'uikit'],
        'client-side': ['react', 'react native', 'swiftui', 'uikit'],
        website: ['digital twin', 'rasoi bazaar', 'marketconnect', 'chatrify', 'velvet pour'],
        websites: ['digital twin', 'rasoi bazaar', 'marketconnect', 'chatrify', 'velvet pour'],
        web: ['digital twin', 'rasoi bazaar', 'marketconnect', 'chatrify', 'velvet pour'],
        design: ['digital twin', 'rasoi bazaar', 'velvet pour'],

        // Full-stack development
        fullstack: ['digital twin', 'rasoi bazaar', 'marketconnect', 'chatrify'],
        'full-stack': ['digital twin', 'rasoi bazaar', 'marketconnect', 'chatrify'],
        full: ['digital twin', 'rasoi bazaar', 'marketconnect', 'chatrify'],
        stack: ['digital twin', 'rasoi bazaar', 'marketconnect', 'chatrify'],

        // Backend development
        'server-side': ['backend'],
        server: ['backend'],

        // AI and machine learning
        ai: ['nlp', 'rag', 'deep learning', 'llm'],
        artificial:  ['nlp', 'rag', 'deep learning', 'llm'],
        ml: ['nlp', 'rag', 'deep learning'],
        genai: ['nlp', 'rag', 'deep learning', 'llm'],
        learning: ['deep learning', 'nlp', 'rag'],
        llm: ['llm', 'gpt transformer architecture'],
        llms: ['llm', 'gpt transformer architecture'],
        gpt: ['gpt transformer architecture'],
        transformer: ['gpt transformer architecture'],
        transformers: ['gpt transformer architecture'],
        attention: ['gpt transformer architecture'],
        ann: ['gpt transformer architecture', 'scratch neuralnetwork'],
        rnn: ['gpt transformer architecture', 'scratch neuralnetwork'],
        lstm: ['gpt transformer architecture'],
        neural: ['scratch neuralnetwork', 'gpt transformer architecture'],
        neuralnetwork: ['scratch neuralnetwork', 'gpt transformer architecture'],
        mnist: ['scratch neuralnetwork'],
        chatbot: ['digital twin', 'chatrify'],
        assistant: ['digital twin'],
        gemini: ['chatrify'],
        chatgpt: ['gpt transformer architecture'],
        tensorflow : ['gpt transformer architecture'],
        pytorch : ['gpt transformer architecture'],
        keras: ['gpt transformer architecture'],
        gradient: ['gpt transformer architecture'],
        descent: ['gpt transformer architecture'],
        intelligent: ['digital twin', 'gpt transformer architecture'],
        intelligence: ['digital twin', 'gpt transformer architecture'],
        smart: ['digital twin', 'gpt transformer architecture'],

        // Databases and backend technologies
        db: ['mongodb', 'swiftdata'],
        database: ['mongodb', 'swiftdata'],
        mongo: ['mongodb'],
        nosql: ['mongodb'],
        nodejs: ['node'],
        'node.js': ['node'],
        nextjs: ['next'],
        'next.js': ['next'],
        api: ['restful api'],
        rest: ['restful api'],
        elasticsearch: ['elastic search'],
        'elastic-search': ['elastic search'],
        debouncing: ['foodly',  'rasoi bazaar'],
        debounced: ['foodly',  'rasoi bazaar'],

        // Real-time communication
        chat: ['chatrify', 'digital twin'],
        chats: ['chatrify', 'digital twin'],
        message: ['chatrify', 'digital twin'],
        messaging: ['chatrify', 'digital twin'],
        conversation: ['digital twin', 'chatrify'],
        conversations: ['digital twin', 'chatrify'],
        socket: ['socket'],
        sockets: ['socket'],
        realtime: ['socket'],
        websocket: ['socket'],
        websockets: ['socket'],
        'socket.io': ['socket'],

        // UI, animation and state management
        animation: ['gsap', 'core haptics'],
        animations: ['gsap', 'core haptics'],
        motion: ['gsap', 'core haptics'],
        state: ['redux', 'zustand'],
        navigation: ['react native', 'uikit'],
        storytelling : ['velvet pour'],
        mocktail: ['velvet pour'],
        cocktail: ['velvet pour'],
        mocktails: ['velvet pour'],
        cocktails: ['velvet pour'],
        drink: ['velvet pour'],
        drinks: ['velvet pour'],
        juice: ['velvet pour'],

        // Project-intent searches
        recipe: ['rasoi bazaar'],
        recipes: ['rasoi bazaar'],
        cook: ['rasoi bazaar'],
        cooked: ['rasoi bazaar'],
        cooking: ['rasoi bazaar'],
        cuisine: ['rasoi bazaar'],
        dishes: ['rasoi bazaar'],
        swiggy: ['rasoi bazaar'],
        food: ['foodly', 'rasoi bazaar'],
        foodtech: ['rasoi bazaar'],
        delivery: ['foodly', 'rasoi bazaar'],
        ordering: ['marketconnect' , 'rasoi bazaar'],
        marketplace: ['marketconnect'],
        retail: ['marketconnect'],
        retailer: ['marketconnect'],
        pricing: ['marketconnect'],
        'price-comparison': ['marketconnect'],
        movie: ['movie nest'],
        movies: ['movie nest'],
        film: ['movie nest'],
        ghibli: ['movie nest'],
        journal: ['grateful moments'],
        journaling: ['grateful moments'],
        diary: ['grateful moments'],
        gratitude: ['grateful moments'],
        memories: ['locket'],
        memory: ['locket'],
        keepsake: ['locket'],
        hackathon: ['locket'],
        voice: ['digital twin'],

        // Backend, authentication and API documentation
        auth: ['postaway'],
        authentication: ['postaway'],
        jwt: ['postaway'],
        swagger: ['postaway'],
        comments: ['postaway'],
        likes: ['postaway'],
        social: ['postaway'],
        login: ['postaway'],
        logout: ['postaway'],

        // Rasoi Bazaar — integrations and discovery
        mcp: ['rasoi bazaar'],
        instamart: ['rasoi bazaar'],
        dish: ['rasoi bazaar'],
        dishes: ['rasoi bazaar'],

        // MarketConnect — marketplace features
        preorder: ['marketconnect'],
        pickup: ['marketconnect'],
        shopkeeper: ['marketconnect'],
        shopkeepers: ['marketconnect'],
        'quick-pickup': ['marketconnect'],
        'price-updates': ['marketconnect'],

        // Chatrify — communication and security
        encrypted: ['chatrify'],
        encryption: ['chatrify'],
        persistent: ['chatrify'],
        'real-time': ['socket'],

        // Photos and personal memories
        photo: ['digital twin', 'locket'],
        photos: ['digital twin', 'locket'],
        particle: ['locket'],
        particles: ['locket'],
        pictures: ['digital twin', 'locket'],
        picture:  ['digital twin', 'locket'],

        // Movie Nest
        autolayout: ['ios'],
        autolayouts: ['ios'],
        'unit-testing': ['movie nest'],

        //DSA
        algorithm : ['dsa'],
        algorithms : ['dsa'],
    };

    const ICONS = {
        github: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>',
        arrow: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>',
        play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>',
        pause: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"></path></svg>',
        volumeOn: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9H5zm13.5 3A4.5 4.5 0 0 0 16 7.97v8.06A4.5 4.5 0 0 0 18.5 12z"></path></svg>',
        volumeOff: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM19 12a7 7 0 0 0-4-6.32v2.06A5 5 0 0 1 17 12c0 .62-.12 1.21-.33 1.75l1.46 1.46C18.68 14.21 19 13.14 19 12zM12 4 9.91 6.09 12 8.18V4z"></path></svg>',
        fullscreenEnter: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 14H3v7h7v-2H5v-5zM3 10h2V5h5V3H3v7zm16 9h-5v2h7v-7h-2v5zM14 3v2h5v5h2V3h-7z"></path></svg>',
        fullscreenExit: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"></path></svg>'
    };

    // Cycled on each click of the speed button — same cheap
    // next-in-list pattern as the native players this is standing in
    // for, just presented as a small text pill instead of a menu.
    const SPEED_STEPS = [0.5, 1, 1.25, 1.5, 1.75, 2];

    // Kaggle's and Google's own "Open in Kaggle" / "Open in Colab"
    // badge assets — the exact images they publish for embedding in
    // READMEs and notebooks — rather than a hand-drawn stand-in icon.
    const DEMO_BADGES = {
        kaggle: {
            src: 'https://kaggle.com/static/images/open-in-kaggle.svg',
            alt: 'Open In Kaggle'
        },
        colab: {
            src: 'https://colab.research.google.com/assets/colab-badge.svg',
            alt: 'Open In Colab'
        }
    };

    function initProjects() {
        const list = document.getElementById('projectsGrid');
        const filters = document.getElementById('projectsFilters');
        const searchForm = document.getElementById('projectsSearchForm');
        const searchInput = document.getElementById('projectsSearchInput');
        const searchClear = document.getElementById('projectsSearchClear');
        const searchHint = document.getElementById('projectsSearchHint');
        const searchGhost = document.getElementById('projectsSearchGhost');

        if (!list || !filters) return;

        function focusInputWithoutKeyboard() {
            if (!searchInput) return;

            searchInput.setAttribute('readonly', 'readonly');
            searchInput.focus();

            setTimeout(() => {
                searchInput.removeAttribute('readonly');
            }, 50);
        }

        let activeFilter = 'All';
        let appliedQuery = '';
        let debounceTimer = null;
        let hasRenderedOnce = false;
        let lastQueryLength = 0; // tracks typing direction: growing vs shrinking

        const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);

        const safeURL = value => {
            if (typeof value !== 'string' || !value.trim()) return '';

            try {
                const url = new URL(value, window.location.origin);
                return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
            } catch (_) {
                return '';
            }
        };

        // Picks the icon/label/placement for a demo link based on its
        // host. Falls back to the plain "View live" treatment for
        // anything that isn't Kaggle or Colab — adding a new provider
        // here is just one more hostname check, no renderRow changes
        // needed.
        const getDemoMeta = url => {
            if (!url) return null;

            let hostname = '';

            try {
                hostname = new URL(url).hostname.toLowerCase();
            } catch (_) {
                hostname = '';
            }

            if (hostname.includes('kaggle.com')) {
                return { type: 'badge', ...DEMO_BADGES.kaggle };
            }

            if (hostname.includes('colab.research.google.com')) {
                return { type: 'badge', ...DEMO_BADGES.colab };
            }

            return { type: 'text', icon: ICONS.arrow, label: 'View live' };
        };

        // Only ever extracts recognised categories — there is no
        // free-text keyword matching anymore. A query that names no
        // category returns an empty list, and the caller treats that
        // as "nothing to do".
        const SEARCH_STOPWORDS = new Set([
            'show', 'me', 'have', 'you', 'worked', 'on', 'find', 'do', 'i',
            'any', 'projects', 'project', 'what', 'built', 'with', 'the',
            'a', 'an', 'about', 'for', 'to', 'in', 'is', 'are', 'can', 'your',
            'and', 'or', 'which', 'that', 'whose', 'where', 'who', 'this'
        ]);

        function parseSearch(query) {
            let remaining = String(query || '')
                .toLowerCase()
                .replace(/[’']/g, '')
                .replace(/[!?;,()[\]{}"“”]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const original = remaining;
            const categories = [];

            for (const rule of CATEGORY_RULES) {
                const detector = new RegExp(rule.pattern.source, 'gi');

                if (detector.test(remaining)) {
                    categories.push(rule.category);
                    // Strip the matched category phrase so it doesn't
                    // also get treated as a free-text keyword below.
                    remaining = remaining
                        .replace(new RegExp(rule.strip.source, 'gi'), ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                }
            }

            // Whatever's left is free text — matched dynamically against
            // project titles and tech stacks (projects-data.js), never a
            // hardcoded list here.
            const keywords = remaining
                .split(' ')
                .map(word => word.trim())
                .filter(word => word.length > 1 && !SEARCH_STOPWORDS.has(word));
            // "react and backend" → both required. "react or backend",
            // or no connector at all, → either is enough. Checked
            // against the ORIGINAL text, before category phrases were
            // stripped out of `remaining`.
            const categoryMode = (categories.length > 1 && /\band\b/.test(original) && !/\bor\b/.test(original))
                ? 'all'
                : 'any';

            return {
                categories,
                categoryMode,
                keywords
            };
        }

        // Reads straight from window.projects — adding or renaming a
        // project or a tech entry in projects-data.js just works, no
        // changes needed here.
        // "rasoi" is 5 letters and should match "Rasoi Bazaar" as soon
        // as it's fully typed. Anything shorter than this is too easy
        // to misfire as a substring (e.g. "ai" inside half the
        // alphabet), so short keywords fall back to requiring a full
        // word match instead — same rule tech already follows always.
        const SEARCH_SUBSTRING_MIN_LENGTH = 5;

        function projectMatchesKeywords(project, keywords) {
            if (!keywords.length) return false;

            const titleText = String(project.title || '').toLowerCase();
            const titleWords = new Set(
                titleText.split(/[^a-z0-9]+/).filter(Boolean)
            );

            const techWords = new Set();

            (Array.isArray(project.tech_categories) ? project.tech_categories : [])
                .forEach(item => {            
                    String(item)
                        .toLowerCase()
                        .split(/[^a-z0-9]+/)
                        .forEach(word => {
                            if (word) techWords.add(word);
                        });
                });

            return keywords.some(keyword => {
                const terms = [keyword, ...(SYNONYMS[keyword] || [])];

                return terms.some(term => {
                    // Multi-word synonym (e.g. "react native") → phrase match.
                    if (term.includes(' ')) {
                        return titleText.includes(term) ||
                            Array.from(techWords).join(' ').includes(term) ||
                            (Array.isArray(project.tech_categories)
                                ? project.tech_categories.some(t => String(t).toLowerCase().includes(term))
                                : false);
                    }

                    // Long enough → substring match against the title only.
                    if (
                        term.length >= SEARCH_SUBSTRING_MIN_LENGTH &&
                        titleText.includes(term)
                    ) {
                        return true;
                    }

                    // Otherwise (short term, or no substring hit) →
                    // must be a whole word, in title OR tech.
                    return titleWords.has(term) || techWords.has(term);
                });
            });
        }
        // Returns only the keywords that actually matched at least one
        // project — not every token left over after stopword removal.
        // This is what the hint text should reflect; a keyword that
        // matched nothing (a stray "which", a typo, anything not yet
        // in SEARCH_STOPWORDS) has no business being displayed as if
        // it drove the results.
        function keywordsThatMatched(keywords, projects) {
            if (!keywords.length) return [];

            return keywords.filter(keyword =>
                projects.some(project => projectMatchesKeywords(project, [keyword]))
            );
        }
        // Returns true only once the current query actually matches
        // something — a recognized category, or a keyword that's
        // really found in some project's title/tech. While the user
        // is still mid-word (e.g. "sho") this stays false, so the
        // grid is left untouched instead of flickering to empty.
        function hasMatch(parsed) {
            if (parsed.categories.length) return true;

            if (!parsed.keywords.length) return false;

            const allProjects = Array.isArray(window.projects) ? window.projects : [];

            return allProjects.some(project =>
                projectMatchesKeywords(project, parsed.keywords)
            );
        }
    
        function renderFilters(parsed) {
            const activeCategories = parsed.categories.length
                ? parsed.categories
                : [activeFilter];
            const categories = ['All', ...FILTER_CATEGORIES];

            filters.innerHTML = categories.map(category => {
                const isActive = activeCategories.includes(category);

                return `
                    <button
                        class="project-filter${isActive ? ' is-active' : ''}"
                        type="button"
                        data-category="${escapeHTML(category)}"
                        aria-pressed="${isActive ? 'true' : 'false'}"
                    >
                        ${escapeHTML(category)}
                    </button>
                `;
            }).join('');
        }

        // Toggles which edge fade shows based on real scroll position.
        // EDGE_THRESHOLD is the "leave some gap" tolerance — without
        // it, sub-pixel scroll rounding can leave the bar stuck a
        // fraction short of "the end" forever, so the right fade
        // never clears even once the last pill is fully in view.
        function updateFilterEdges() {
            const maxScrollLeft = filters.scrollWidth - filters.clientWidth;

            if (maxScrollLeft <= 1) {
                filters.classList.add('is-at-start', 'is-at-end');
                return;
            }

            const EDGE_THRESHOLD = 4;

            filters.classList.toggle('is-at-start', filters.scrollLeft <= EDGE_THRESHOLD);
            filters.classList.toggle(
                'is-at-end',
                filters.scrollLeft >= maxScrollLeft - EDGE_THRESHOLD
            );
        }

        // ---- Video preview / player ----
        // Only one video (preview or active/clicked) plays anywhere on
        // the page at a time. This tracks whichever element is
        // currently "live" so a new hover or click can cleanly stop it.
        let activeVideoEl = null;

        function updatePlayIcon(stage, isPaused) {
            updateCenterButton(stage, isPaused);

            if (!stage) return;
            const toggleBtn = stage.querySelector('[data-video-toggle]');
            if (!toggleBtn) return;

            toggleBtn.innerHTML = isPaused ? ICONS.play : ICONS.pause;
            toggleBtn.setAttribute('aria-label', isPaused ? 'Play' : 'Pause');
        }

        function updateSpeedLabel(stage, rate) {
            if (!stage) return;

            const speedBtn = stage.querySelector('[data-video-speed]');
            if (!speedBtn) return;

            speedBtn.textContent = `${rate}x`;
        }

        function updateFullscreenIcon(stage, isFullscreen) {
            if (!stage) return;

            const fsBtn = stage.querySelector('[data-video-fullscreen]');
            if (!fsBtn) return;

            fsBtn.innerHTML = isFullscreen ? ICONS.fullscreenExit : ICONS.fullscreenEnter;
            fsBtn.setAttribute('aria-label', isFullscreen ? 'Exit full screen' : 'Full screen');
        }

        function exitFullscreenIfActive(stage) {
            const fsEl = document.fullscreenElement
                || document.webkitFullscreenElement
                || document.mozFullScreenElement
                || document.msFullscreenElement;

            if (fsEl && fsEl === stage) {
                const exit = document.exitFullscreen
                    || document.webkitExitFullscreen
                    || document.mozCancelFullScreen
                    || document.msExitFullscreen;

                if (exit) exit.call(document);
            }
        }

        function resetVideoStage(videoEl) {
            if (!videoEl) return;

            const stage = videoEl.closest('[data-video-stage]');

            videoEl.pause();
            videoEl.currentTime = 0;
            videoEl.muted = true;
            videoEl.playbackRate = 1;

            if (stage) {
                exitFullscreenIfActive(stage);
                stage.classList.remove('is-previewing', 'is-active', 'is-idle', 'is-buffering');
                clearTimeout(idleTimers.get(stage));

                const fill = stage.querySelector('[data-video-progress-fill]');
                if (fill) fill.style.width = '0%';

                const bufferedEl = stage.querySelector('[data-video-buffered]');
                if (bufferedEl) bufferedEl.style.width = '0%';

                const timeEl = stage.querySelector('[data-video-time]');
                if (timeEl) timeEl.textContent = '0:00 / 0:00';

                // In case a reset (scrolled off-screen, finished, etc.)
                // happens mid-drag, make sure the bar doesn't get stuck
                // thinking it's still being scrubbed.
                const progressEl = stage.querySelector('[data-video-progress]');
                if (progressEl) {
                    scrubbingBars.delete(progressEl);
                    progressEl.classList.remove('is-scrubbing');
                }
                updatePlayIcon(stage, true);
                updateSpeedLabel(stage, 1);
            }

            if (lastActiveStage === stage) lastActiveStage = null;

            if (activeVideoEl === videoEl) {
                activeVideoEl = null;
            }
        }

        function stopActiveVideo() {
            if (activeVideoEl) resetVideoStage(activeVideoEl);
        }

        function startPreview(videoEl) {
            if (!videoEl) return;

            // Already the active element and already previewing or
            // playing — nothing to do, avoids restarting on repeated
            // mouseover noise from child-element boundaries.
            const stage = videoEl.closest('[data-video-stage]');
            if (stage && (stage.classList.contains('is-previewing') || stage.classList.contains('is-active'))) {
                return;
            }

            if (activeVideoEl && activeVideoEl !== videoEl) stopActiveVideo();

            activeVideoEl = videoEl;
            videoEl.muted = true;
            videoEl.currentTime = 0;

            if (stage) stage.classList.add('is-previewing');

            const playPromise = videoEl.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    // Autoplay can be blocked in rare cases — fall back
                    // to just showing the thumbnail, no error surfaced.
                    resetVideoStage(videoEl);
                });
            }
        }

        function startFullPlayback(videoEl) {
            if (!videoEl) return;

            const stage = videoEl.closest('[data-video-stage]');

            if (activeVideoEl && activeVideoEl !== videoEl) stopActiveVideo();

            activeVideoEl = videoEl;
            videoEl.muted = false;

            if (stage) {
                stage.classList.remove('is-previewing');
                stage.classList.add('is-active');
                updatePlayIcon(stage, false);
                lastActiveStage = stage;
                wakeControls(stage);
            }

            const playPromise = videoEl.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    // If unmuted autoplay is blocked, our own controls are
                    // already visible, so the person can just press play
                    // themselves — reflect the paused state on the button.
                    if (stage) updatePlayIcon(stage, true);
                });
            }
        }

        function seekFromPointer(videoEl, progressEl, clientX) {
            if (!videoEl || !progressEl || !isFinite(videoEl.duration) || videoEl.duration <= 0) return;

            const rect = progressEl.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const seekTime = ratio * videoEl.duration;

            videoEl.currentTime = seekTime;

            const fill = progressEl.querySelector('[data-video-progress-fill]');
            if (fill) fill.style.width = `${ratio * 100}%`;

            const tooltip = progressEl.querySelector('[data-video-tooltip]');
            if (tooltip) {
                const timeLabel = tooltip.querySelector('[data-video-tooltip-time]');
                if (timeLabel) timeLabel.textContent = formatTime(seekTime);
                tooltip.style.left = `${ratio * 100}%`;
                updateSpritePreview(tooltip, seekTime);
            }

            updateTimeDisplay(progressEl.closest('[data-video-stage]'), videoEl);
        }
    
        // Scrubbing state: which progress bar (if any) is currently
        // being dragged, and which video it belongs to. Pointer
        // capture means pointermove/pointerup keep firing on the bar
        // itself even once the cursor/finger drifts outside it.
        const scrubbingBars = new WeakMap();
        const wasPlayingBeforeScrub = new WeakMap();

        const idleTimers = new WeakMap();
const clickTimers = new WeakMap();
const showRemainingTime = new WeakMap();
let lastActiveStage = null;

function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Shows the right frame of a project's sprite sheet (if it has one)
// for a given hover/scrub time, by shifting background-position on a
// fixed-size box — no video decoding, just CSS math.
function updateSpritePreview(tooltipEl, time) {
    if (!tooltipEl) return;

    const spriteSrc = tooltipEl.dataset.spriteSrc;
    const spriteEl = tooltipEl.querySelector('[data-video-sprite]');
    if (!spriteSrc || !spriteEl) return;

    const cols = Number(tooltipEl.dataset.spriteCols) || 1;
    const rows = Number(tooltipEl.dataset.spriteRows) || 1;
    const frameW = Number(tooltipEl.dataset.spriteFrameW) || 0;
    const frameH = Number(tooltipEl.dataset.spriteFrameH) || 0;
    const interval = Number(tooltipEl.dataset.spriteInterval) || 2;

    if (!frameW || !frameH) return;

    // Set the image + sizing once per tooltip, not on every hover move.
    if (spriteEl.dataset.ready !== 'true') {
        spriteEl.style.width = `${frameW}px`;
        spriteEl.style.height = `${frameH}px`;
        spriteEl.style.backgroundImage = `url("${spriteSrc}")`;
        spriteEl.style.backgroundSize = `${cols * frameW}px ${rows * frameH}px`;
        spriteEl.dataset.ready = 'true';
    }

    const maxFrame = (cols * rows) - 1;
    const frameIndex = Math.min(Math.max(Math.floor(time / interval), 0), maxFrame);
    const col = frameIndex % cols;
    const row = Math.floor(frameIndex / cols);

    spriteEl.style.backgroundPosition = `-${col * frameW}px -${row * frameH}px`;
}

function updateTimeDisplay(stage, videoEl) {
    const timeEl = stage && stage.querySelector('[data-video-time]');
    if (!timeEl || !videoEl) return;
    const duration = isFinite(videoEl.duration) ? videoEl.duration : 0;

    if (stage && showRemainingTime.get(stage)) {
        const remaining = Math.max(0, duration - videoEl.currentTime);
        timeEl.textContent = `-${formatTime(remaining)} / ${formatTime(duration)}`;
    } else {
        timeEl.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(duration)}`;
    }
}

function updateBuffered(stage, videoEl) {
    const bufferedEl = stage && stage.querySelector('[data-video-buffered]');
    if (!bufferedEl || !videoEl || !isFinite(videoEl.duration) || videoEl.duration <= 0) return;
    const ranges = videoEl.buffered;
    if (!ranges.length) return;
    const end = ranges.end(ranges.length - 1);
    bufferedEl.style.width = `${Math.min(100, (end / videoEl.duration) * 100)}%`;
}

// The center button always shows the real play/pause state and is
// itself the only way to toggle playback — visible whenever controls
// are visible, hidden whenever controls are hidden (see CSS).
function updateCenterButton(stage, isPaused) {
    if (!stage) return;
    const centerBtn = stage.querySelector('[data-video-center-flash]');
    if (!centerBtn) return;

    centerBtn.innerHTML = isPaused ? ICONS.play : ICONS.pause;
    centerBtn.setAttribute('aria-label', isPaused ? 'Play' : 'Pause');
}

function togglePlayback(stage, videoEl) {
    if (!videoEl) return;

    if (videoEl.paused) {
        videoEl.play();
    } else {
        videoEl.pause();
    }

    pulseCenterButton(stage);
}

// Brief glow pulse on the center button, same visual as the old
// flash — layered on top of the persistent button so it keeps
// showing the correct icon/state throughout, not replaced by it.
function pulseCenterButton(stage) {
    if (!stage) return;
    const centerBtn = stage.querySelector('[data-video-center-flash]');
    if (!centerBtn) return;

    centerBtn.classList.remove('is-pulsing');
    void centerBtn.offsetWidth; // restart animation on rapid re-toggles
    centerBtn.classList.add('is-pulsing');

    clearTimeout(centerBtn._pulseTimer);
    centerBtn._pulseTimer = setTimeout(() => centerBtn.classList.remove('is-pulsing'), 500);
}

// Controls auto-hide while actively playing — any pointer movement
// or a pause brings them straight back.
function wakeControls(stage) {
    if (!stage) return;
    stage.classList.remove('is-idle');
    clearTimeout(idleTimers.get(stage));

    const videoEl = stage.querySelector('[data-project-video]');
    if (!stage.classList.contains('is-active') || !videoEl || videoEl.paused) return;

    idleTimers.set(stage, setTimeout(() => stage.classList.add('is-idle'), 2500));
}
    
        function renderRow(project, index, highlightTerms) {
            const title = escapeHTML(project.title || 'Untitled project');
            const description = escapeHTML(
                project.description || 'More details coming soon.'
            );
            const image = safeURL(project.image);
            const alt = escapeHTML(
                project.imageAlt || `${project.title || 'Project'} thumbnail`
            );
            const video = safeURL(project.video);

            const allTags = Array.isArray(project.tech_categories)
                ? project.tech_categories
                : [];

            // Category pills are just whichever tags match the known
            // filter list (FILTER_CATEGORIES) — everything else in the
            // same array is displayed as tech, as-is, no dedupe needed.
            const categories = allTags.filter(tag => FILTER_CATEGORIES.includes(tag));
            const github = safeURL(project.github);
            const demo = safeURL(project.demo);
            const demoMeta = demo ? getDemoMeta(demo) : null;

            const thumbnail = image
                ? `
                    <img
                        class="project-thumbnail"
                        src="${escapeHTML(image)}"
                        alt="${alt}"
                        loading="lazy"
                        decoding="async"
                    >
                `
                : `
                    <div
                        class="project-thumbnail project-thumbnail--empty"
                        role="img"
                        aria-label="No project thumbnail added yet"
                    >
                        <span>Thumbnail coming soon</span>
                    </div>
                `;

            // Video is entirely optional — a project with no `video` in
            // projects-data.js renders exactly the plain thumbnail, no
            // extra markup, no behaviour change.
            const media = video
                ? `
                    <div class="project-media-stage" data-video-stage>
                        <button
                            type="button"
                            class="project-video-back-projects"
                            data-video-back-projects
                        >Back to all projects</button>

                        ${thumbnail}
                        <video
                            class="project-preview-video"
                            src="${escapeHTML(video)}"
                            data-project-video
                            muted
                            playsinline
                            preload="metadata"
                            disablepictureinpicture
                            controlslist="nodownload noremoteplayback noplaybackrate"
                        ></video>
                        <button
                            type="button"
                            class="project-play-btn"
                            data-play-video
                            aria-label="Play video of ${title}"
                        >${ICONS.play}</button>

                        <div class="project-video-spinner" data-video-spinner aria-hidden="true"></div>
                        <div class="project-video-longpress-badge" data-video-longpress-badge aria-hidden="true">&raquo;&raquo; ${LONG_PRESS_RATE}x</div>
                        <button
                            type="button"
                            class="project-video-center-flash"
                            data-video-center-flash
                            aria-label="Play"
                        >${ICONS.play}</button>

                        <!-- Our own minimal controls — shown only once
                             someone has clicked into the full player.
                             No native browser chrome, no PiP button. -->
                        <div class="project-video-controls" data-video-controls>
                            <button
                                type="button"
                                class="project-video-toggle"
                                data-video-toggle
                                aria-label="Pause"
                            >${ICONS.pause}</button>

                            <div class="project-video-progress" data-video-progress>
                                <div class="project-video-progress-buffered" data-video-buffered></div>
                                <div class="project-video-progress-fill" data-video-progress-fill></div>
                                <div
                                    class="project-video-tooltip"
                                    data-video-tooltip
                                    ${safeURL(project.spriteSheet) ? `
                                        data-sprite-src="${escapeHTML(safeURL(project.spriteSheet))}"
                                        data-sprite-interval="${Number(project.spriteInterval) || 2}"
                                        data-sprite-cols="${Number(project.spriteCols) || 0}"
                                        data-sprite-rows="${Number(project.spriteRows) || 0}"
                                        data-sprite-frame-w="${Number(project.spriteFrameWidth) || 0}"
                                        data-sprite-frame-h="${Number(project.spriteFrameHeight) || 0}"
                                    ` : ''}
                                >
                                    ${safeURL(project.spriteSheet) ? '<div class="project-video-sprite" data-video-sprite></div>' : ''}
                                    <span data-video-tooltip-time>0:00</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                class="project-video-time"
                                data-video-time
                                data-video-time-toggle
                                aria-label="Toggle remaining time"
                            >0:00 / 0:00</button>

                            <button
                                type="button"
                                class="project-video-speed"
                                data-video-speed
                                aria-label="Playback speed"
                            >1x</button>

                            <button
                                type="button"
                                class="project-video-fullscreen"
                                data-video-fullscreen
                                aria-label="Full screen"
                            >${ICONS.fullscreenEnter}</button>
                        </div>
                    </div>
                `
                : thumbnail;

            const terms = Array.isArray(highlightTerms) ? highlightTerms : [];

            const techLine = allTags.length
                ? `<p class="project-tech-line">${
                    allTags.map(tag => {
                        const tagLower = String(tag).toLowerCase();
                        const isMatch = terms.some(term => tagLower === term || tagLower.includes(term));

                        return isMatch
                            ? `<span class="project-tech-tag--matched">${escapeHTML(tag)}</span>`
                            : escapeHTML(tag);
                    }).join('  ·  ')
                }</p>`
                : '';
            const askTwinLink = `
    <a
        class="project-link project-link--ask-twin"
        href="#twin"
        data-ask-project
        data-project-title="${escapeHTML(project.title || 'this project')}"
        data-project-tech="${escapeHTML(allTags.join(', '))}"
    >
        Ask about this project from my AI Twin
        <span aria-hidden="true">↗</span>
    </a>
`;

const links = [
    demo
        ? `<a class="project-link${demoMeta.type === 'badge' ? ' project-link--badge' : ''}" href="${escapeHTML(demo)}" target="_blank" rel="noopener noreferrer">${
            demoMeta.type === 'badge'
                ? `<img class="project-link-badge" src="${escapeHTML(demoMeta.src)}" alt="${escapeHTML(demoMeta.alt)}" loading="lazy" style="height:20px;width:auto;display:block;">`
                : `${demoMeta.label} ${demoMeta.icon}`
        }</a>`
        : '',

    demo && github
        ? '<span class="project-link-divider" aria-hidden="true"></span>'
        : '',

    github
        ? `<a class="project-link project-link--secondary" href="${escapeHTML(github)}" target="_blank" rel="noopener noreferrer">${ICONS.github} Source</a>`
        : '',

    demo || github
        ? '<span class="project-link-divider" aria-hidden="true"></span>'
        : '',

    askTwinLink
].filter(Boolean).join('');

            return `
                <article class="project-row" data-project-id="${escapeHTML(project.id || '')}">
                    <div class="project-row-media">${media}</div>

                    <div class="project-row-content">
                        <h2 class="project-row-title">${title}</h2>

                        <p class="project-row-description">${description}</p>

                        ${techLine}

                        ${links
                            ? `<div class="project-row-links">${links}</div>`
                            : ''
                        }
                    </div>
                </article>
            `;
        }

        let revealObserver = null;
        let offscreenPauseObserver = null;

        // Only the very first paint fades rows in on scroll. This is
        // called once, right after the first render, never again — so
        // filtering/search can never retrigger it and make rows appear
        // to "jump".
        function revealOnFirstLoad() {
            const reduceMotion = window.matchMedia
                ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
                : false;

            const rows = list.querySelectorAll('.project-row');

            if (reduceMotion || !('IntersectionObserver' in window)) {
                rows.forEach(row => row.classList.add('is-visible'));
                return;
            }

            revealObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

            rows.forEach(row => revealObserver.observe(row));
        }

        // A playing video (preview or active) that scrolls out of view
        // is paused and reset — nothing keeps playing silently below
        // the fold while someone keeps scrolling.
        function watchVideosForOffscreenPause() {
            if (offscreenPauseObserver) offscreenPauseObserver.disconnect();

            const videos = list.querySelectorAll('[data-project-video]');
            if (!videos.length || !('IntersectionObserver' in window)) return;

            offscreenPauseObserver = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting && !entry.target.paused) {
                        resetVideoStage(entry.target);
                    }
                });
            }, { threshold: 0 });

            videos.forEach(videoEl => offscreenPauseObserver.observe(videoEl));
        }

        function renderProjects() {
            // A fresh render replaces every row, so whatever video was
            // playing is about to be torn down with it.
            activeVideoEl = null;

            const allProjects = Array.isArray(window.projects)
                ? window.projects
                : [];

            const parsed = parseSearch(appliedQuery);

            const inferredCategories = parsed.categories.map(category =>
                category.toLowerCase()
            );

            // How many of the requested categories/keywords a project
            // satisfies — used to rank "matches everything asked for"
            // above "matches only one of several things", instead of
            // a strict all-or-nothing filter.
            function matchScore(project) {
                const allTags = Array.isArray(project.tech_categories)
                    ? project.tech_categories
                    : [];
                const categories = allTags
                    .filter(tag => FILTER_CATEGORIES.includes(tag))
                    .map(category => category.toLowerCase());

                const matchedCategoryCount = inferredCategories
                    .filter(category => categories.includes(category)).length;

                const matchedKeywordCount = parsed.keywords
                    .filter(keyword => projectMatchesKeywords(project, [keyword])).length;

                return matchedCategoryCount + matchedKeywordCount;
            }

            let visibleProjects = allProjects.filter(project => {
                if (inferredCategories.length || parsed.keywords.length) {
                    return matchScore(project) > 0;
                }

                const allTags = Array.isArray(project.tech_categories)
                    ? project.tech_categories
                    : [];
                const categories = allTags
                    .filter(tag => FILTER_CATEGORIES.includes(tag))
                    .map(category => category.toLowerCase());

                return activeFilter === 'All'
                    || categories.includes(activeFilter.toLowerCase());
            });

            // Projects satisfying more of the requested terms rank
            // first — "react and backend" shows projects using both
            // before projects using only one. Ties keep their
            // original relative order (stable sort).
            if (inferredCategories.length || parsed.keywords.length) {
                visibleProjects = visibleProjects
                    .map((project, index) => ({ project, index, score: matchScore(project) }))
                    .sort((a, b) => b.score - a.score || a.index - b.index)
                    .map(entry => entry.project);
            }
            const highlightTerms = [
                ...inferredCategories,
                ...parsed.keywords.flatMap(k => [k, ...(SYNONYMS[k] || [])])
            ];

            list.innerHTML = visibleProjects.length
                ? visibleProjects.map((project, index) => renderRow(project, index, highlightTerms)).join('')
                : `
                    <div class="projects-empty-state">
                        <span class="projects-empty-icon" aria-hidden="true">⌕</span>
                        <h2>No projects in this category yet</h2>
                        <p>Try another filter to see more work.</p>
                    </div>
                `;

            if (searchHint) {
                const matchedKeywords = keywordsThatMatched(parsed.keywords, allProjects);
                const hasCategories = parsed.categories.length > 0;
                const hasKeywords = matchedKeywords.length > 0;

                if (hasCategories && hasKeywords) {
                    const joiner = parsed.categoryMode === 'any' ? ' or ' : ' and ';
                    searchHint.textContent =
                        `Matching ${parsed.categories.join(joiner)} projects mentioning "${matchedKeywords.join(' ')}".`;
                } else if (parsed.categories.length === 1) {
                    searchHint.textContent =
                        `Showing projects categorised as ${parsed.categories[0]}.`;
                } else if (parsed.categories.length > 1) {
                    const joiner = parsed.categoryMode === 'any' ? ' or ' : ' and ';
                    searchHint.textContent =
                        `Matching projects across ${parsed.categories.join(joiner)}.`;
                } else if (hasKeywords) {
                    searchHint.textContent =
                        `Matching projects mentioning "${matchedKeywords.join(' ')}".`;
                } else {
                    searchHint.textContent =
                        'Search by project name, technology, or category - try "iOS", "React Native", or "Rasoi Bazaar".';
                }
            }
            if (searchClear) {
                searchClear.classList.toggle(
                    'is-hidden',
                    !(searchInput && searchInput.value.trim())
                );
            }
            renderFilters(parsed);
            updateFilterEdges();
            watchVideosForOffscreenPause();

            // An image already in the browser cache can finish
            // loading (and skip firing 'load') before this listener
            // ever attaches to it — catch that case explicitly so
            // cached thumbnails don't stay stuck at opacity:0.
            list.querySelectorAll('img.project-thumbnail').forEach(img => {
                if (img.complete && img.naturalWidth > 0) {
                    img.classList.add('is-loaded');
                }
            });

            if (!hasRenderedOnce) {
                hasRenderedOnce = true;
                revealOnFirstLoad();
            } else {
                // Subsequent renders (filtering/search) show rows in
                // their final state immediately — no fade, no
                // translate, nothing that could read as a "jump".
                if (revealObserver) revealObserver.disconnect();
                list.querySelectorAll('.project-row').forEach(row => {
                    // Freshly created elements — skip the fade
                    // transition entirely so swapping results never
                    // animates, just appears.
                    row.style.transition = 'none';
                    row.classList.add('is-visible');
                });
            }
        }

        // Typed text that names no recognised category does nothing to
        // the grid — not even an empty state. The hint still responds
        // so there's some feedback, but the list is left completely
        // alone until a category is actually recognised (or the field
        // is cleared, which resets to the active filter tab).
        function applyQuery(value) {
            const trimmed = value.trim();
            const isDeleting = trimmed.length < lastQueryLength;

            lastQueryLength = trimmed.length;

            if (trimmed) {
                const parsed = parseSearch(trimmed);

                if (!hasMatch(parsed)) {
                    if (isDeleting) {
                        // Backspaced into something that no longer
                        // matches (e.g. "react" → "reac") — fall back
                        // to showing everything instead of leaving the
                        // old filtered results stuck on screen.
                        appliedQuery = '';
                    } else {
                        // Still typing forward and nothing matches yet
                        // — leave the grid exactly as-is, don't flicker
                        // to empty mid-word.
                        if (searchHint) {
                            searchHint.textContent =
                                'Keep typing - search by project, technology, or category.';
                        }
                        return;
                    }
                } else {
                    appliedQuery = trimmed;
                }
            } else {
                appliedQuery = '';
            }

            renderProjects();
        }

        function applyQueryNow(value) {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }

            applyQuery(value);
        }

        function scheduleQuery(value) {
            if (debounceTimer) clearTimeout(debounceTimer);

            debounceTimer = window.setTimeout(() => {
                debounceTimer = null;
                applyQuery(value);
            }, SEARCH_DEBOUNCE_MS);
        }

        // Prepare a project-specific prompt before navigating to the Digital Twin.
list.addEventListener('click', event => {
    const link = event.target.closest('a[data-ask-project]');
    if (!link) return;

    const title = link.dataset.projectTitle || 'this project';
    const tech = link.dataset.projectTech || 'its tech stack';

    const prompt =
        `Tell me about ${title} project, including what it does`;

    window.pendingDigitalTwinPrompt = prompt.slice(0, 200);
});

// ---- Video preview / player wiring ----
// Delegated on the list so it keeps working across re-renders
// (filtering/search rebuild the DOM, individual listeners would not
// survive that).

// Prime the video as soon as the cursor enters the card — before it
// reaches the actual video stage — so buffering has a head start by
// the time startPreview() fires.
list.addEventListener('mouseover', event => {
    const row = event.target.closest('.project-row');
    if (!row || row.contains(event.relatedTarget)) return;

    const videoEl = row.querySelector('[data-project-video]');
    if (!videoEl || videoEl.dataset.primed) return;

    videoEl.dataset.primed = 'true';
    videoEl.preload = 'auto';
    videoEl.load();
});

// mouseover/mouseout + a relatedTarget check stands in for
// mouseenter/mouseleave here, since delegation needs bubbling events
// and mouseenter/mouseleave don't bubble.
list.addEventListener('mouseover', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (!stage || stage.contains(event.relatedTarget)) return;

    const videoEl = stage.querySelector('[data-project-video]');
    startPreview(videoEl);
});

list.addEventListener('mouseout', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (!stage || stage.contains(event.relatedTarget)) return;

    const videoEl = stage.querySelector('[data-project-video]');
    if (!videoEl) return;

    // Only a silent hover-preview is interrupted by the cursor
    // leaving. Once someone has clicked into the real player, it
    // keeps playing regardless of where the mouse goes.
    if (stage.classList.contains('is-previewing')) {
        resetVideoStage(videoEl);
    }
});

// Our own control bar: play/pause toggle, a click-to-seek progress
// bar, and a mute toggle. Handled first so they don't also trigger
// the "click the stage to enter full playback" behaviour below.
list.addEventListener('click', event => {
    const toggleBtn = event.target.closest('[data-video-toggle]');
    if (toggleBtn) {
        event.preventDefault();
        event.stopPropagation();

        const stage = toggleBtn.closest('[data-video-stage]');
        const videoEl = stage && stage.querySelector('[data-project-video]');
        if (!videoEl) return;

        togglePlayback(stage, videoEl);
        return;
    }

    const centerBtn = event.target.closest('[data-video-center-flash]');
    if (centerBtn) {
        event.preventDefault();
        event.stopPropagation();

        const stage = centerBtn.closest('[data-video-stage]');
        const videoEl = stage && stage.querySelector('[data-project-video]');
        if (!videoEl) return;

        togglePlayback(stage, videoEl);
        return;
    }
    // Plain clicks (no drag) on the bar are handled by pointerdown/up
    // below, which covers both tap-to-seek and drag-to-seek in one
    // path — this click handler intentionally does nothing for the
    // progress bar itself.

    const speedBtn = event.target.closest('[data-video-speed]');
    if (speedBtn) {
        event.preventDefault();
        event.stopPropagation();

        const stage = speedBtn.closest('[data-video-stage]');
        const videoEl = stage && stage.querySelector('[data-project-video]');
        if (!videoEl) return;

        const currentIndex = SPEED_STEPS.indexOf(videoEl.playbackRate);
        const nextRate = SPEED_STEPS[(currentIndex + 1) % SPEED_STEPS.length];

        videoEl.playbackRate = nextRate;
        speedBtn.textContent = `${nextRate}x`;
        return;
    }

    const timeToggle = event.target.closest('[data-video-time-toggle]');
    if (timeToggle) {
        event.preventDefault();
        event.stopPropagation();

        const stage = timeToggle.closest('[data-video-stage]');
        const videoEl = stage && stage.querySelector('[data-project-video]');
        if (!stage || !videoEl) return;

        showRemainingTime.set(stage, !showRemainingTime.get(stage));
        updateTimeDisplay(stage, videoEl);
        return;
    }
    const backBtn = event.target.closest('[data-video-back-projects]');
    if (backBtn) {
        event.preventDefault();
        event.stopPropagation();
        exitFullscreenIfActive(backBtn.closest('[data-video-stage]'));
        return;
    }

    const fsBtn = event.target.closest('[data-video-fullscreen]');
    if (fsBtn) {
        event.preventDefault();
        event.stopPropagation();

        const stage = fsBtn.closest('[data-video-stage]');
        if (!stage) return;

        const fsEl = document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement;

        if (fsEl === stage) {
            const exit = document.exitFullscreen
                || document.webkitExitFullscreen
                || document.mozCancelFullScreen
                || document.msExitFullscreen;
            if (exit) exit.call(document);
        } else {
            const request = stage.requestFullscreen
                || stage.webkitRequestFullscreen
                || stage.mozRequestFullScreen
                || stage.msRequestFullscreen;
            if (request) request.call(stage);
        }
        return;
    }
});

// Drag-to-seek on the progress bar — pointerdown starts the drag and
// seeks immediately (so a plain tap still works exactly like before),
// pointermove keeps scrubbing live while held, pointerup/cancel ends
// it. Works the same way for mouse and touch since it's all Pointer
// Events, no separate touch handling needed.
list.addEventListener('pointerdown', event => {
    const progressEl = event.target.closest('[data-video-progress]');
    if (!progressEl) return;

    const stage = progressEl.closest('[data-video-stage]');
    const videoEl = stage && stage.querySelector('[data-project-video]');
    if (!videoEl) return;

    event.preventDefault();
    event.stopPropagation();

    scrubbingBars.set(progressEl, videoEl);
    progressEl.classList.add('is-scrubbing');
    progressEl.classList.remove('is-touch-ended');
    if (stage) stage.classList.remove('is-buffering');

    // Pause while dragging so the frame only moves in response to the
    // scrub itself, not also advancing on its own underneath it.
    // Resume (only if it was actually playing) once the drag ends.
    wasPlayingBeforeScrub.set(progressEl, !videoEl.paused);
    videoEl.pause();

    if (progressEl.setPointerCapture) {
        progressEl.setPointerCapture(event.pointerId);
    }

    seekFromPointer(videoEl, progressEl, event.clientX);
});

list.addEventListener('pointermove', event => {
    const progressEl = event.target.closest('[data-video-progress]');
    const videoEl = progressEl && scrubbingBars.get(progressEl);
    if (!videoEl) return;

    seekFromPointer(videoEl, progressEl, event.clientX);
});

// Long-press (mobile) or right-click (desktop) on the video would
// otherwise open the native context menu with a "Download video"
// option — block it entirely since we have our own controls.
list.addEventListener('contextmenu', event => {
    if (event.target.closest('[data-project-video]')) {
        event.preventDefault();
    }
});

// Hover-preview tooltip — shows the time at the pointer position
// even before anyone starts dragging.
list.addEventListener('pointermove', event => {
    const progressEl = event.target.closest('[data-video-progress]');
    if (!progressEl || scrubbingBars.has(progressEl)) return;

    const stage = progressEl.closest('[data-video-stage]');
    const videoEl = stage && stage.querySelector('[data-project-video]');
    if (!videoEl || !isFinite(videoEl.duration) || videoEl.duration <= 0) return;

    const rect = progressEl.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const hoverTime = ratio * videoEl.duration;
    const tooltip = progressEl.querySelector('[data-video-tooltip]');
    if (tooltip) {
        const timeLabel = tooltip.querySelector('[data-video-tooltip-time]');
        if (timeLabel) timeLabel.textContent = formatTime(hoverTime);
        tooltip.style.left = `${ratio * 100}%`;
        updateSpritePreview(tooltip, hoverTime);
    }
}, { passive: true });

// Wakes the control bar on any pointer activity over an active stage.
list.addEventListener('pointermove', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (stage) wakeControls(stage);
}, { passive: true });

// Thumbnails start at opacity:0 (see CSS) and fade in once actually
// decoded — this avoids the abrupt "pop" when a slow-loading image
// finally renders. Covers both a fresh load and the case where the
// image was already cached by the time this listener attaches.
list.addEventListener('load', event => {
    const image = event.target;

    if (
        !(image instanceof HTMLImageElement) ||
        !image.classList.contains('project-thumbnail')
    ) {
        return;
    }

    image.classList.add('is-loaded');
}, true);
// pointerdown fires before our click handler further down, so we
// remember whether controls were hidden at the moment of touch —
// the click handler needs that original state, not the post-wake
// state, to decide whether this tap should also toggle playback.
const tapStartedIdle = new WeakMap();

const LONG_PRESS_MS = 500;
const LONG_PRESS_RATE = 1.5;
const longPressTimers = new WeakMap();
const longPressActive = new WeakMap();
const preLongPressRate = new WeakMap();
const suppressNextTapToggle = new WeakMap();
let pressedStage = null;
let pressedVideo = null;

list.addEventListener('pointerdown', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (!stage) return;

    tapStartedIdle.set(stage, stage.classList.contains('is-idle'));
    wakeControls(stage);
}, { passive: true });

// Press-and-hold anywhere on an ACTIVE, PLAYING video speeds it up to
// 1.5x while held — independent of the tap-to-toggle-controls logic,
// and never touches controls visibility itself.
list.addEventListener('pointerdown', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (!stage || !stage.classList.contains('is-active')) return;
    if (event.target.closest('[data-video-controls]')) return;

    const videoEl = stage.querySelector('[data-project-video]');
    if (!videoEl || videoEl.paused) return;

    pressedStage = stage;
    pressedVideo = videoEl;

    clearTimeout(longPressTimers.get(stage));
    const timer = setTimeout(() => {
        if (pressedStage !== stage) return;

        preLongPressRate.set(stage, videoEl.playbackRate);
        videoEl.playbackRate = LONG_PRESS_RATE;
        stage.classList.add('is-long-pressing');
        longPressActive.set(stage, true);
    }, LONG_PRESS_MS);

    longPressTimers.set(stage, timer);
}, { passive: true });

function endLongPress() {
    if (!pressedStage) return;

    const stage = pressedStage;
    const videoEl = pressedVideo;
    clearTimeout(longPressTimers.get(stage));

    if (longPressActive.get(stage)) {
        videoEl.playbackRate = preLongPressRate.get(stage) || 1;
        stage.classList.remove('is-long-pressing');
        longPressActive.delete(stage);

        // The release of a long-press would otherwise also fire a
        // click, which the tap-to-toggle-controls logic would read as
        // "hide controls" — suppress just that one upcoming click.
        suppressNextTapToggle.set(stage, true);
    }

    pressedStage = null;
    pressedVideo = null;
}

list.addEventListener('pointerup', endLongPress);
list.addEventListener('pointercancel', endLongPress);

function endScrub(event) {
    const progressEl = event.target.closest('[data-video-progress]');
    if (!progressEl || !scrubbingBars.has(progressEl)) return;

    const videoEl = scrubbingBars.get(progressEl);

    scrubbingBars.delete(progressEl);
    progressEl.classList.remove('is-scrubbing');

    if (videoEl && wasPlayingBeforeScrub.get(progressEl)) {
        videoEl.play();
    }
    wasPlayingBeforeScrub.delete(progressEl);

    // Touch/pen has no real hover state to fall back on once the
    // finger lifts, so force the tooltip closed immediately instead
    // of leaving it visually "stuck" open.
    if (event.pointerType && event.pointerType !== 'mouse') {
        progressEl.classList.add('is-touch-ended');
    }
}

list.addEventListener('pointerup', endScrub);
list.addEventListener('pointercancel', endScrub);

// Keeps the fullscreen icon correct even when someone exits via Esc
// or a system gesture rather than our own button.
['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(eventName => {
    document.addEventListener(eventName, () => {
        const fsEl = document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement;

        list.querySelectorAll('[data-video-stage]').forEach(stage => {
            const isFullscreen = stage === fsEl;

            updateFullscreenIcon(stage, isFullscreen);
            stage.classList.toggle('is-fullscreen', isFullscreen);
        });

        // Mobile only, and only where supported (mainly Android
        // Chrome — iOS Safari has no orientation-lock API, so this
        // silently does nothing there and the person just rotates
        // manually). Never blocks or breaks fullscreen itself if the
        // lock call fails or isn't available.
        if (fsEl && screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        } else if (!fsEl && screen.orientation && screen.orientation.unlock) {
            try {
                screen.orientation.unlock();
            } catch (_) {}
        }
    });
});

// Space/K toggle, arrows seek ±5s, M mutes, F toggles full screen —
// scoped to whichever video is currently the active player.
document.addEventListener('keydown', event => {
    if (!lastActiveStage || !lastActiveStage.classList.contains('is-active')) return;

    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const videoEl = lastActiveStage.querySelector('[data-project-video]');
    if (!videoEl) return;

    switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
            event.preventDefault();
            togglePlayback(lastActiveStage, videoEl);
            wakeControls(lastActiveStage);
            break;
        case 'ArrowRight': {
            const max = isFinite(videoEl.duration) ? videoEl.duration : Infinity;
            videoEl.currentTime = Math.min(videoEl.currentTime + 5, max);
            flashSeek(lastActiveStage, 'forward');
            wakeControls(lastActiveStage);
            break;
        }
        case 'ArrowLeft':
            videoEl.currentTime = Math.max(videoEl.currentTime - 5, 0);
            flashSeek(lastActiveStage, 'backward');
            wakeControls(lastActiveStage);
            break;
        case 'f':
        case 'F': {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement
                || document.mozFullScreenElement || document.msFullscreenElement;
            if (fsEl === lastActiveStage) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen
                    || document.mozCancelFullScreen || document.msExitFullscreen;
                if (exit) exit.call(document);
            } else {
                const request = lastActiveStage.requestFullscreen || lastActiveStage.webkitRequestFullscreen
                    || lastActiveStage.mozRequestFullScreen || lastActiveStage.msRequestFullscreen;
                if (request) request.call(lastActiveStage);
            }
            break;
        }
        default:
            return;
    }
});

// Click/tap promotes the same video to a real, controllable player —
// our own control bar takes over from here, not the browser's.
// AFTER — insert this right below it:
list.addEventListener('click', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (!stage) return;

    const videoEl = stage.querySelector('[data-project-video]');
    if (!videoEl) return;

    if (!stage.classList.contains('is-active')) {
        event.preventDefault();
        startFullPlayback(videoEl);
        return;
    }
    // Clicks on the control bar (scrubber, speed, fullscreen, the
    // center button itself) are handled by their own dedicated
    // handlers above — this generic stage-tap logic only governs
    // taps on the open video area.
    if (event.target.closest('[data-video-controls]')) return;

    // A long-press just ended on release of this same click — consume
    // it here so it doesn't also toggle controls visibility.
    if (suppressNextTapToggle.get(stage)) {
        suppressNextTapToggle.delete(stage);
        event.preventDefault();
        return;
    }

    event.preventDefault();

    // Controls were hidden at the moment this tap started (before our
    // own pointerdown handler revealed them). Checking the live class
    // here would be wrong, since pointerdown has already removed
    // is-idle by the time click fires.
    const wasIdle = tapStartedIdle.get(stage);
    tapStartedIdle.delete(stage);

    if (wasIdle) {
        // Controls were hidden: this tap's job is just to reveal them
        // (wakeControls already ran on pointerdown). If the video was
        // paused, resume it too — otherwise leave playback untouched.
        if (videoEl.paused) videoEl.play();
        return;
    }

    // Controls were already visible: a tap here means "hide them" —
    // playback is never touched by tapping the open video area, only
    // by the center button itself.
    clearTimeout(idleTimers.get(stage));
    stage.classList.add('is-idle');
});

function flashSeek(stage, direction) {
    if (!stage) return;

    const flash = document.createElement('div');
    flash.className = `project-seek-flash project-seek-flash--${direction}`;
    flash.textContent = direction === 'forward' ? '+5s' : '-5s';
    stage.appendChild(flash);

    requestAnimationFrame(() => flash.classList.add('is-visible'));
    setTimeout(() => flash.remove(), 500);
}

// Double-tap/double-click left or right half of an ACTIVE player to
// seek ±5s, YouTube-style. Only applies once in full playback — the
// first tap/click is already spent promoting the stage to active.
list.addEventListener('dblclick', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (!stage || !stage.classList.contains('is-active')) return;

    const videoEl = stage.querySelector('[data-project-video]');
    if (!videoEl) return;
    event.preventDefault();
    event.stopPropagation();

    clearTimeout(clickTimers.get(stage));
    clickTimers.delete(stage);

    const rect = stage.getBoundingClientRect();
    const isRightHalf = (event.clientX - rect.left) > rect.width / 2;
    const delta = isRightHalf ? 5 : -5;
    const max = isFinite(videoEl.duration) ? videoEl.duration : Infinity;

    videoEl.currentTime = Math.min(Math.max(0, videoEl.currentTime + delta), max);

    flashSeek(stage, isRightHalf ? 'forward' : 'backward');
});

// Keep the progress bar and play/pause icon in sync with real
// playback state (covers seeking, buffering, autoplay getting
// blocked, etc. — not just clicks on our own buttons).
list.addEventListener('timeupdate', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;

    const stage = videoEl.closest('[data-video-stage]');
    const fill = stage && stage.querySelector('[data-video-progress-fill]');

    if (fill && isFinite(videoEl.duration) && videoEl.duration > 0) {
        fill.style.width = `${(videoEl.currentTime / videoEl.duration) * 100}%`;
    }

    updateTimeDisplay(stage, videoEl);
    updateBuffered(stage, videoEl);
}, true);

list.addEventListener('loadedmetadata', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;
    updateTimeDisplay(videoEl.closest('[data-video-stage]'), videoEl);
}, true);

list.addEventListener('progress', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;
    updateBuffered(videoEl.closest('[data-video-stage]'), videoEl);
}, true);

// Buffering spinner — only while actually in full playback, and
// never while someone is still mid-drag on the progress bar (every
// seek during a scrub briefly fires 'waiting', which would otherwise
// flash the spinner on each drag step before they've even let go).
list.addEventListener('waiting', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;
    const stage = videoEl.closest('[data-video-stage]');
    if (!stage || !stage.classList.contains('is-active')) return;

    const progressEl = stage.querySelector('[data-video-progress]');
    if (progressEl && progressEl.classList.contains('is-scrubbing')) return;

    stage.classList.add('is-buffering');
}, true);

list.addEventListener('playing', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;
    const stage = videoEl.closest('[data-video-stage]');
    if (stage) stage.classList.remove('is-buffering');
}, true);

list.addEventListener('play', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;
    const stage = videoEl.closest('[data-video-stage]');
    updatePlayIcon(stage, false);
    wakeControls(stage);
}, true);

list.addEventListener('pause', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;
    const stage = videoEl.closest('[data-video-stage]');
    updatePlayIcon(stage, true);
    if (stage) {
        stage.classList.remove('is-idle');
        clearTimeout(idleTimers.get(stage));
    }
}, true);

// A video that finishes on its own — preview or fully watched —
// always settles back to the static thumbnail, ready to be replayed
// from the start next time.
list.addEventListener('ended', event => {
    const videoEl = event.target;
    if (!videoEl || !videoEl.matches('[data-project-video]')) return;

    resetVideoStage(videoEl);
}, true);

// Manual category filters.
        filters.addEventListener('click', event => {
            const button = event.target.closest('button[data-category]');
            if (!button) return;

            activeFilter = button.dataset.category;

            if (searchInput) searchInput.value = '';
            if (searchClear) searchClear.classList.add('is-hidden');
            updateGhostVisibility();

            applyQueryNow('');
        });
        filters.addEventListener('scroll', () => {
            window.requestAnimationFrame(updateFilterEdges);
        }, { passive: true });

        window.addEventListener('resize', () => {
            window.requestAnimationFrame(updateFilterEdges);
        });
        if (searchForm && searchInput) {
            // Submit applies instantly, bypassing the debounce.
            searchForm.addEventListener('submit', event => {
                event.preventDefault();
                applyQueryNow(searchInput.value);
            });

            // Typing re-renders only after the person pauses, not on
            // every keystroke — this is what stops the list visibly
            // shifting while someone is still mid-sentence.
            searchInput.addEventListener('input', () => {
                if (searchClear) {
                    searchClear.classList.toggle('is-hidden', !searchInput.value.trim());
                }
                updateGhostVisibility();
                scheduleQuery(searchInput.value);
            });

            // Escape clears instantly.
            searchInput.addEventListener('keydown', event => {
                if (event.key === 'Escape' && searchInput.value) {
                    searchInput.value = '';
                    if (searchClear) searchClear.classList.add('is-hidden');
                    updateGhostVisibility();
                    applyQueryNow('');
                }
            });

            if (searchClear) {
                searchClear.addEventListener('click', () => {
                    searchInput.value = '';
                    updateGhostVisibility();
                    applyQueryNow('');
                    searchInput.focus();
                });
            }

            searchInput.addEventListener('focus', updateGhostVisibility);
            searchInput.addEventListener('blur', updateGhostVisibility);
        }

        // ---- Animated rotating example (replaces the native placeholder) ----

        let placeholderIndex = 0;

        // Behaves like a normal placeholder: visible on an empty field
        // whether or not it's focused, and hidden only once there's
        // actual text in it — not the moment the field is clicked.
        function updateGhostVisibility() {
            if (!searchGhost) return;

            const hasText = Boolean(searchInput && searchInput.value.trim());

            searchGhost.classList.toggle('is-hidden', hasText);
        }

        function startPlaceholderRotation() {
            // Always set a plain, visible placeholder first — this is
            // the fallback that shows if the animated ghost layer
            // below never activates (missing markup, JS error, etc).
            // Without this line the bar can go completely blank, which
            // is exactly the bug this replaces.
            if (searchInput) {
                searchInput.setAttribute('placeholder', SEARCH_PLACEHOLDERS[0]);
            }

            if (!searchGhost || !searchInput) return;

            // The ghost element exists — hand it the text and tell the
            // CSS to hide the native placeholder so they never overlap.
            searchInput.classList.add('has-ghost');

            const reduceMotion = window.matchMedia
                ? window.matchMedia('(prefers-reduced-motion: reduce)')
                : null;

            searchGhost.textContent = SEARCH_PLACEHOLDERS[0];

            if (reduceMotion && reduceMotion.matches) return;

            window.setInterval(() => {
                // Keeps rotating even while the field is focused — it
                // only stops once there's actual text to protect, or
                // the tab is in the background.
                if (
                    (searchInput.value.trim()) ||
                    document.visibilityState === 'hidden'
                ) {
                    return;
                }

                searchGhost.classList.add('is-swapping');

                window.setTimeout(() => {
                    placeholderIndex = (placeholderIndex + 1) % SEARCH_PLACEHOLDERS.length;
                    searchGhost.textContent = SEARCH_PLACEHOLDERS[placeholderIndex];
                    searchGhost.classList.remove('is-swapping');
                }, 260);
            }, PLACEHOLDER_ROTATE_MS);
        }

        // Replace failed thumbnail images with a graceful fallback.
        list.addEventListener('error', event => {
            const image = event.target;

            if (
                !(image instanceof HTMLImageElement) ||
                !image.classList.contains('project-thumbnail')
            ) {
                return;
            }

            const fallback = document.createElement('div');
            fallback.className =
                'project-thumbnail project-thumbnail--empty';

            fallback.setAttribute('role', 'img');
            fallback.setAttribute(
                'aria-label',
                'Project thumbnail unavailable'
            );

            fallback.innerHTML = '<span>Thumbnail unavailable</span>';
            image.replaceWith(fallback);
        }, true);

        renderProjects();
        startPlaceholderRotation();
        updateGhostVisibility();

        const projectsSection = document.getElementById('projects');

        if (projectsSection) {
            const focusProjectsSearch = () => {
                if (!projectsSection.classList.contains('active')) return;

                requestAnimationFrame(() => {
                    focusInputWithoutKeyboard();
                });
            };

            new MutationObserver(focusProjectsSearch).observe(projectsSection, {
                attributes: true,
                attributeFilter: ['class']
            });

            focusProjectsSearch();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProjects, {
            once: true
        });
    } else {
        initProjects();
    }
})();