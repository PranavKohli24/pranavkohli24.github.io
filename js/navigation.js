/**
 * Navigation Module (hash-based)
 * mysite/#about, mysite/#contact, mysite/#twin, mysite/#blog/1
 */

function isSection(id) {
    const el = document.getElementById(id);
    return !!(el && el.classList.contains('section'));
}

function updateDOM(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }
}

// URL segment -> actual section id
const SECTION_ALIASES = { twin: 'digital-twin' };
// actual section id -> canonical short URL segment
const CANONICAL_PATHS = { 'digital-twin': 'twin' };

const resolveSectionId = id => SECTION_ALIASES[id] || id;
const canonicalPathFor = id => CANONICAL_PATHS[id] || id;

function getRoute() {
    return window.location.hash
        .replace(/^#\/?/, '')   // strip "#" or "#/"
        .replace(/\/$/, '');    // strip trailing slash
}

let lastSection = null;

function showSection() {
    // Old-style path URL (e.g. /about) -> /#about
    const legacyPath = window.location.pathname.replace(/^\/|\/$/g, '');
    if (legacyPath && !legacyPath.includes('.') && !window.location.hash) {
        history.replaceState({}, '', `/#${legacyPath}`);
    }

    const rawRoute = getRoute() || 'about';
    let sectionId = rawRoute;

    // #blog/1 -> blog1
    const blogMatch = rawRoute.match(/^blog\/(\d+)$/);
    if (blogMatch) sectionId = `blog${blogMatch[1]}`;

    sectionId = resolveSectionId(sectionId);

    if (!isSection(sectionId)) {
        const first = resolveSectionId(rawRoute.split('/')[0]);
        if (isSection(first)) {
            sectionId = first;
            history.replaceState({}, '', `#${canonicalPathFor(first)}`);
        } else {
            sectionId = 'about';
            history.replaceState({}, '', window.location.pathname + window.location.search);
        }
    }

    // popstate + hashchange can both fire; also skips re-render when the
    // menu / info sheet closes via history.back()
    if (sectionId === lastSection) return;
    lastSection = sectionId;

    // Blog posts (blog1, blog2...) highlight the "blog" nav item
    const navKey = /^blog\d+$/.test(sectionId) ? 'blog' : canonicalPathFor(sectionId);
    document.querySelectorAll('nav a[href^="#"]').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === `#${navKey}`);
    });

    if (typeof window.pauseAllAudioPlayers === 'function') {
        window.pauseAllAudioPlayers();
    }

    if (!document.startViewTransition) {
        updateDOM(sectionId);
        return;
    }
    document.startViewTransition(() => updateDOM(sectionId));
}

document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.target === '_blank') return;

    const targetHash = link.getAttribute('href');
    const route = targetHash.replace(/^#\/?/, '');

    // Ignore bare "#" and in-page anchors that aren't routes
    if (!route || !isSection(resolveSectionId(route.split('/')[0]))) return;

    event.preventDefault();
    if (window.location.hash === targetHash) return;

    history.pushState({}, '', targetHash);
    showSection();
});

window.addEventListener('popstate', showSection);
window.addEventListener('hashchange', showSection);
window.addEventListener('load', showSection);