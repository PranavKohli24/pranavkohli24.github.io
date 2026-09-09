/**
 * Navigation Module
 * Handles section navigation based on URL path
 */

// Helper function that actually changes the HTML
function updateDOM(sectionId) {
    const sections = document.querySelectorAll('.section');

    sections.forEach(section => {
        section.classList.remove('active');
    });

    const targetSection = document.getElementById(sectionId);

    if (targetSection) {
        targetSection.classList.add('active');
        window.scrollTo(0, 0);
    }
}

// Short-URL aliases: URL segment -> actual section element id.
// Add more here anytime you want to shorten a URL without renaming its id.
const SECTION_ALIASES = {
    twin: 'digital-twin'
};

// Reverse map: actual section id -> canonical (preferred) short URL.
const CANONICAL_PATHS = {
    'digital-twin': 'twin'
};

function resolveSectionId(id) {
    return SECTION_ALIASES[id] || id;
}

function canonicalPathFor(id) {
    return CANONICAL_PATHS[id] || id;
}

function showSection() {
    const isRootPath =
        window.location.pathname === '/' || window.location.pathname === '';

    if (window.location.hash && isRootPath) {
        const legacyId = window.location.hash.slice(1);
        history.replaceState({}, '', `/${legacyId}`);
    }

    const rawPath =
        window.location.pathname.replace(/^\/|\/$/g, '') || 'about';

    let sectionId = rawPath;

    // /blog/1 -> blog1 (keeps blog section ids unchanged internally)
    const blogMatch = rawPath.match(/^blog\/(\d+)$/);
    if (blogMatch) {
        sectionId = `blog${blogMatch[1]}`;
    }

    // Resolve short-URL aliases (e.g. /twin -> digital-twin)
    sectionId = resolveSectionId(sectionId);

    if (!document.getElementById(sectionId)) {
        // Full path didn't resolve - check if the first segment is a valid section
        const firstSegment = resolveSectionId(rawPath.split('/')[0]);

        if (firstSegment && firstSegment !== sectionId && document.getElementById(firstSegment)) {
            history.replaceState({}, '', `/${canonicalPathFor(firstSegment)}`);
            updateDOM(firstSegment);
            return;
        }

        history.replaceState({}, '', '/');
        updateDOM('about');
        return;
    }

    document.querySelectorAll('nav a[href^="/"]').forEach(link => {
        link.classList.toggle(
            'active',
            link.getAttribute('href') === `/${canonicalPathFor(sectionId)}`
        );
    });

    // Pause all audio players when navigating
    if (typeof window.pauseAllAudioPlayers === 'function') {
        window.pauseAllAudioPlayers();
    }

    if (!document.startViewTransition) {
        updateDOM(sectionId);
        return;
    }

    document.startViewTransition(() => {
        updateDOM(sectionId);
    });
}

document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="/"]');
    if (!link || link.target === '_blank') return;

    const targetPath = link.getAttribute('href');

    if (window.location.pathname === targetPath) {
        event.preventDefault();
        return;
    }

    event.preventDefault();

    history.pushState({}, '', targetPath);
    showSection();
});

window.addEventListener('popstate', showSection);
window.addEventListener('load', showSection);