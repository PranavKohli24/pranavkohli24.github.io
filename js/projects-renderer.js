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
 */
(function () {
    'use strict';

    const FILTER_CATEGORIES = ['iOS', 'React Native', 'Angular', 'React', 'Backend', 'DSA'];

    const SEARCH_PLACEHOLDERS = [
        'Show me iOS projects',
        'Have you worked on React projects?',
        'Find React Native projects',
        'Show me backend projects',
        'What have I built with Gemini?',
        'Do I have any DSA projects?',
        'Show me Angular projects'
    ];

    const SEARCH_DEBOUNCE_MS = 320;
    const PLACEHOLDER_ROTATE_MS = 3000;

    // Check longer/overlapping category phrases before shorter ones.
    const CATEGORY_RULES = [
        {
            category: 'React Native',
            pattern: /\breact[\s.-]*native\b|\breactnative\b|\brn\b|\bexpo\b/gi,
            strip: /\breact[\s.-]*native\b|\breactnative\b|\brn\b/gi
        },
        {
            category: 'iOS',
            pattern: /\bios(?:\s+development)?\b|\biphone\b|\bipad\b|\bswiftui\b|\bswift\b|\bapple\s+apps?\b/gi,
            strip: /\bios(?:\s+development)?\b|\biphone\b|\bipad\b|\bapple\s+apps?\b/gi
        },
        {
            category: 'Angular',
            pattern: /\bangular(?:[\s.-]*js)?\b/gi,
            strip: /\bangular(?:[\s.-]*js)?\b/gi
        },
        {
            category: 'DSA',
            pattern: /\bdsa\b|\bdata\s+structures?\b|\balgorithms?\b|\bleetcode\b|\bcodeforces\b|\bcompetitive\s+programming\b/gi,
            strip: /\bdsa\b|\bdata\s+structures?\b|\balgorithms?\b|\bleetcode\b|\bcodeforces\b|\bcompetitive\s+programming\b/gi
        },
        {
            category: 'Backend',
            pattern: /\bback[\s-]?end\b|\bapis?\b|\bnode(?:[\s.-]*js)?\b|\bexpress(?:[\s.-]*js)?\b|\bservers?\b|\bcloudflare\b|\bmongodb\b|\bmysql\b|\bdatabases?\b|\brest(?:ful)?\b/gi,
            // Keep specific technologies in the remaining query as keywords.
            strip: /\bback[\s-]?end\b|\bservers?\b/gi
        },
        {
            category: 'React',
            pattern: /\breact(?:[\s.-]*js)?\b|\bjsx\b/gi,
            strip: /\breact(?:[\s.-]*js)?\b/gi
        }
    ];

    const ICONS = {
        github: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>',
        arrow: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>'
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

        // Only ever extracts recognised categories — there is no
        // free-text keyword matching anymore. A query that names no
        // category returns an empty list, and the caller treats that
        // as "nothing to do".
        function parseSearch(query) {
            const remaining = String(query || '')
                .toLowerCase()
                .replace(/[’']/g, '')
                .replace(/[!?;,()[\]{}"“”]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const categories = [];

            for (const rule of CATEGORY_RULES) {
                const detector = new RegExp(rule.pattern.source, 'gi');

                if (detector.test(remaining)) {
                    categories.push(rule.category);
                }
            }

            return {
                categories,
                categoryMode: 'any'
            };
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

        function renderRow(project, index) {
            const title = escapeHTML(project.title || 'Untitled project');
            const description = escapeHTML(
                project.description || 'More details coming soon.'
            );
            const image = safeURL(project.image);
            const alt = escapeHTML(
                project.imageAlt || `${project.title || 'Project'} thumbnail`
            );

            const categories = Array.isArray(project.categories)
                ? project.categories
                : [];

            const tech = Array.isArray(project.tech)
                ? project.tech
                : [];

            const github = safeURL(project.github);
            const demo = safeURL(project.demo);

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

            const eyebrow = categories.length
                ? `<span class="project-eyebrow">${escapeHTML(categories.join(' / '))}</span>`
                : '';

            const techLine = tech.length
                ? `<p class="project-tech-line">${escapeHTML(tech.join('  ·  '))}</p>`
                : '';

            const links = [
                demo
                    ? `<a class="project-link" href="${escapeHTML(demo)}" target="_blank" rel="noopener noreferrer">View live ${ICONS.arrow}</a>`
                    : '',
                demo && github ? '<span class="project-link-divider" aria-hidden="true"></span>' : '',
                github
                    ? `<a class="project-link project-link--secondary" href="${escapeHTML(github)}" target="_blank" rel="noopener noreferrer">${ICONS.github} Source</a>`
                    : ''
            ].filter(Boolean).join('');

            const indexLabel = String(index + 1).padStart(2, '0');

            return `
                <article class="project-row" data-project-id="${escapeHTML(project.id || '')}">
                    <div class="project-row-media">${thumbnail}</div>

                    <div class="project-row-content">
                        <span class="project-index" aria-hidden="true">${indexLabel}</span>
                        ${eyebrow}

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

        function renderProjects() {
            const allProjects = Array.isArray(window.projects)
                ? window.projects
                : [];

            const parsed = parseSearch(appliedQuery);

            const inferredCategories = parsed.categories.map(category =>
                category.toLowerCase()
            );

            const visibleProjects = allProjects.filter(project => {
                const categories = (
                    Array.isArray(project.categories) ? project.categories : []
                ).map(category => String(category).toLowerCase());

                if (inferredCategories.length) {
                    return parsed.categoryMode === 'any'
                        ? inferredCategories.some(category =>
                            categories.includes(category)
                        )
                        : inferredCategories.every(category =>
                            categories.includes(category)
                        );
                }

                return activeFilter === 'All'
                    || categories.includes(activeFilter.toLowerCase());
            });

            list.innerHTML = visibleProjects.length
                ? visibleProjects.map((project, index) => renderRow(project, index)).join('')
                : `
                    <div class="projects-empty-state">
                        <span class="projects-empty-icon" aria-hidden="true">⌕</span>
                        <h2>No projects in this category yet</h2>
                        <p>Try another filter to see more work.</p>
                    </div>
                `;

            if (searchHint) {
                if (parsed.categories.length === 1) {
                    searchHint.textContent =
                        `Showing projects categorised as ${parsed.categories[0]}.`;
                } else if (parsed.categories.length > 1) {
                    const joiner = parsed.categoryMode === 'any' ? ' or ' : ' and ';

                    searchHint.textContent =
                        `Matching projects across ${parsed.categories.join(joiner)}.`;
                } else {
                    searchHint.textContent =
                        'Search by category — try iOS, React, React Native, Angular, Backend, or DSA.';
                }
            }

            if (searchClear) {
                searchClear.classList.toggle(
                    'is-hidden',
                    !(searchInput && searchInput.value.trim())
                );
            }

            renderFilters(parsed);

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
            const parsed = parseSearch(trimmed);

            if (trimmed && !parsed.categories.length) {
                if (searchHint) {
                    searchHint.textContent =
                        'Search by category — try iOS, React, React Native, Angular, Backend, or DSA.';
                }
                return;
            }

            appliedQuery = trimmed;
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