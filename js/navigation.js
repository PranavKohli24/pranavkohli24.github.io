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
    const sectionId =
        window.location.pathname.replace(/^\/|\/$/g, '') || 'about';

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

document.querySelectorAll('nav a[href^="/"]').forEach(link => {
    link.addEventListener('click', event => {
        const targetPath = link.getAttribute('href');

        if (window.location.pathname === targetPath) {
            event.preventDefault();
            return;
        }

        event.preventDefault();

        history.pushState({}, '', targetPath);
        showSection();
    });
});

window.addEventListener('popstate', showSection);
window.addEventListener('load', showSection);