/**
 * Navigation Module
 * Handles section navigation based on URL hash
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
    const hash = window.location.hash || '#about';
    const sectionId = hash.substring(1);
    
    // Pause all audio players when navigating
    if (typeof window.pauseAllAudioPlayers === 'function') {
        window.pauseAllAudioPlayers();
    }

    // 1. If the browser doesn't support it, just change the section normally
    if (!document.startViewTransition) {
        updateDOM(sectionId);
        return;
    }

    // 2. If supported, wrap the DOM update in the transition API
    document.startViewTransition(() => {
        updateDOM(sectionId);
    });
}

// Initialize navigation
window.addEventListener('hashchange', showSection);
window.addEventListener('load', showSection);