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
        mobile: ['ios', 'react native', 'swift', 'swiftui'],
        app: ['ios', 'react native'],
        android: ['react native'],
        ai: ['nlp', 'rag', 'deep learning'],
        ml: ['nlp', 'rag', 'deep learning'],
        genai: ['nlp', 'rag', 'deep learning'],
        'machine learning': ['nlp', 'rag', 'deep learning'],
        db: ['mongodb'],
        database: ['mongodb'],
        node: ['node.js'],
        nodejs: ['node.js'],
        api: ['restful api'],
        rest: ['restful api'],
        socket: ['socket.io'],
        sockets: ['socket.io'],
        realtime: ['socket.io'],
        animation: ['gsap', 'core haptics'],
        animations: ['gsap', 'core haptics'],
        state: ['redux', 'zustand'],
        nextjs: ['next.js']
    };

    const ICONS = {
        github: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>',
        arrow: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>',
        play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>'
    };

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

        function resetVideoStage(videoEl) {
            if (!videoEl) return;

            const stage = videoEl.closest('[data-video-stage]');

            videoEl.pause();
            videoEl.currentTime = 0;
            videoEl.muted = true;
            videoEl.removeAttribute('controls');

            if (stage) {
                stage.classList.remove('is-previewing', 'is-active');
            }

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
            videoEl.removeAttribute('controls');
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
            videoEl.setAttribute('controls', '');

            if (stage) {
                stage.classList.remove('is-previewing');
                stage.classList.add('is-active');
            }

            const playPromise = videoEl.play();
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {
                    // If unmuted autoplay is blocked, the native controls
                    // are already visible, so the person can just press
                    // play themselves — nothing further to do here.
                });
            }
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
                        ${thumbnail}
                        <video
                            class="project-preview-video"
                            src="${escapeHTML(video)}"
                            data-project-video
                            muted
                            playsinline
                            preload="none"
                        ></video>
                        <button
                            type="button"
                            class="project-play-btn"
                            data-play-video
                            aria-label="Play video of ${title}"
                        >${ICONS.play}</button>
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

// Click/tap promotes the same video to a real, controllable player.
// Once that's happened the stage carries .is-active and the native
// <video controls> receives its own clicks directly (play/pause/
// seek/volume), so this handler steps aside for it.
list.addEventListener('click', event => {
    const stage = event.target.closest('[data-video-stage]');
    if (!stage || stage.classList.contains('is-active')) return;

    // Clicking a link inside the content area (demo/source/ask-twin)
    // should behave normally — this only concerns the media stage.
    const videoEl = stage.querySelector('[data-project-video]');
    if (!videoEl) return;

    event.preventDefault();
    startFullPlayback(videoEl);
});

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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProjects, {
            once: true
        });
    } else {
        initProjects();
    }
})();