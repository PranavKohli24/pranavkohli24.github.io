/**
 * Mobile Menu Module
 * Handles hamburger menu functionality
 */

const hamburgerButton = document.querySelector('.hamburger-button');
const navMenu = document.querySelector('nav');
const body = document.body;
const overlay = document.querySelector('.overlay');

const toggleMenu = () => {
    const isActive = hamburgerButton.classList.toggle('is-active');
    navMenu.classList.toggle('is-active');
    body.classList.toggle('no-scroll');
    overlay.classList.toggle('is-active');
    hamburgerButton.setAttribute('aria-expanded', isActive);
};

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