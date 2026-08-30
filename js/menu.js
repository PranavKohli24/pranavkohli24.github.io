/**
 * Mobile Menu Module
 * Handles hamburger menu functionality
 */

const hamburgerButton = document.querySelector('.hamburger-button');
const navMenu = document.querySelector('nav');
const body = document.body;
const overlay = document.querySelector('.overlay');

let menuHistoryActive = false;
let menuTransitioning = false;

const toggleMenu = () => {
    if (menuTransitioning) return;

    const isActive = hamburgerButton.classList.toggle('is-active');
    navMenu.classList.toggle('is-active');
    body.classList.toggle('no-scroll');
    overlay.classList.toggle('is-active');
    hamburgerButton.setAttribute('aria-expanded', isActive);

    if (isActive) {
        history.pushState({ menuOpen: true }, '');
        menuHistoryActive = true;
    } else {
        menuTransitioning = true;

        setTimeout(() => {
            menuTransitioning = false;
        }, 800);
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
overlay.addEventListener('click', toggleMenu);

// Close menu when nav links are clicked
const allNavLinks = document.querySelectorAll('nav a');
allNavLinks.forEach(link => {
    link.addEventListener('click', () => {
        if (navMenu.classList.contains('is-active')) {
            toggleMenu();
        }
    });
});