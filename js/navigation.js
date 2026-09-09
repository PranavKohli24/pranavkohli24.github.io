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

function showSection() {
    if (window.location.hash) {
        const legacyId = window.location.hash.slice(1);
        history.replaceState({}, '', `/${legacyId}`);
    }
    let sectionId =
        window.location.pathname.replace(/^\/|\/$/g, '') || 'about';
    
    // /blog/1 -> blog1 (keeps blog section ids unchanged internally)
    const blogMatch = sectionId.match(/^blog\/(\d+)$/);
    if (blogMatch) {
        sectionId = `blog${blogMatch[1]}`;
    }

    if (!document.getElementById(sectionId)) {
        history.replaceState({}, '', '/');
        updateDOM('about');
        return;
    }

    document.querySelectorAll('nav a[href^="/"]').forEach(link => {
        link.classList.toggle(
            'active',
            link.getAttribute('href') === `/${sectionId}`
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