/**
 * Mobile Menu Module
 * Handles hamburger menu functionality
 */

const hamburgerButton = document.querySelector('.hamburger-button');
const navMenu = document.querySelector('nav');
const body = document.body;
const overlay = document.querySelector('.overlay');

let menuHistoryActive = false;

const toggleMenu = () => {
    const isActive = hamburgerButton.classList.toggle('is-active');
    navMenu.classList.toggle('is-active');
    body.classList.toggle('no-scroll');
    overlay.classList.toggle('is-active');
    hamburgerButton.setAttribute('aria-expanded', isActive);

    if (isActive) {
        history.pushState({ menuOpen: true }, '');
        menuHistoryActive = true;
    } else {
        menuHistoryActive = false;
    }
};

window.addEventListener('popstate', () => {
    if (!menuHistoryActive) return;

    menuHistoryActive = false;

    hamburgerButton.classList.remove('is-active');
    navMenu.classList.remove('is-active');
    body.classList.remove('no-scroll');
    overlay.classList.remove('is-active');
    hamburgerButton.setAttribute('aria-expanded', 'false');
});

// Hamburger button click
hamburgerButton.addEventListener('click', toggleMenu);

// Overlay click to close
overlay.addEventListener('click', () => {
    if (!navMenu.classList.contains('is-active')) return;

    hamburgerButton.classList.remove('is-active');
    navMenu.classList.remove('is-active');
    body.classList.remove('no-scroll');
    overlay.classList.remove('is-active');
    hamburgerButton.setAttribute('aria-expanded', 'false');
    menuHistoryActive = false;
});

// Close menu when nav links are clicked
const allNavLinks = document.querySelectorAll('nav a');

allNavLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (!navMenu.classList.contains('is-active')) return;

        const targetHash = link.getAttribute('href');

        // Internal navigation
        if (targetHash && targetHash.startsWith('#')) {
            // Already on this section: remove the temporary menu history entry
            if (window.location.hash === targetHash) {
                history.back();
                return;
            }

            // Different section: close menu, replace the temporary entry
            toggleMenu();
            history.replaceState({}, '', targetHash);

            if (typeof showSection === 'function') {
                showSection();
            }
            return;
        }

        // External link
        toggleMenu();
    });
});