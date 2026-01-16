/**
 * Navigation Module
 * Handles section navigation based on URL hash
 */

function showSection() {
    const hash = window.location.hash || '#about';
    const sectionId = hash.substring(1);
    
    // Hide all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        window.scrollTo(0, 0);
    }
    
    // Close mobile menu if open
    // const navMenu = document.querySelector('nav');
    // if (navMenu && navMenu.classList.contains('is-active')) {
    //     if (typeof toggleMenu === 'function') {
    //         toggleMenu();
    //     }
    // }

    // Pause all audio players when navigating
    if (typeof window.pauseAllAudioPlayers === 'function') {
        window.pauseAllAudioPlayers();
    }
}

// Initialize navigation
window.addEventListener('hashchange', showSection);
window.addEventListener('load', showSection);