/**
 * Blog Renderer Module
 * Dynamically generates blog list and individual blog pages from blog-data.js
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // Preload the noise background first (Keep this, it's small)
        const noiseBg = new Image();
        noiseBg.src = '/src/images/noise_blog.png';

        // --- DELETED IMAGE PRELOADING LOOP HERE FOR PERFORMANCE ---

        renderBlogList();
        renderBlogPosts();
    }

    /**
     * Renders the list of blog posts on the blog page
     */
    function renderBlogList() {
        const blogListContainer = document.getElementById('blogPostsList');
        if (!blogListContainer) return;

        blogListContainer.innerHTML = '';

        blogPosts.slice().reverse().forEach(post => {
            const blogItem = `
                <a href="#${post.id}" class="blog-post-link" onmouseenter="new Image().src='${post.image}'" ontouchstart="new Image().src='${post.image}'">
                    <div class="blog-post-item">
                        <h3 class="blog-post-title">${post.title}</h3>
                        <p class="blog-post-date">${post.date}</p>
                    </div>
                </a>
            `;
            blogListContainer.insertAdjacentHTML('beforeend', blogItem);
        });
    }

    /**
     * Renders individual blog post pages
     */
    function renderBlogPosts() {
        const blogContainer = document.getElementById('blogPostsContainer');
        if (!blogContainer) return;

        blogContainer.innerHTML = '';

        blogPosts.forEach(post => {
            const audioPlayer = post.audioFile ? createAudioPlayer(post.id, post.audioFile) : '';
            
            const blogSection = `
                <section id="${post.id}" class="section">
                    <div class="blog-post-page">
                        <a href="#blog" class="back-link">← Back to all Blogs</a>
                        <h1>${post.title}<span style="color: var(--highlight-color);">.</span></h1>
                        <p class="post-meta">${post.date}</p>

                        ${audioPlayer}

                        <div class="post-content">
                            <div class="noise-background">
                                <img src="${post.image}" alt="${post.imageAlt}" onload="this.classList.add('loaded')">
                                ${post.content}
                            </div>
                            <p style="margin-top: 3rem; color: var(--secondary-text-color);">~ Pranav Kohli</p>
                        </div>
                    </div>
                </section>
            `;
            
            blogContainer.insertAdjacentHTML('beforeend', blogSection);
        });

        // --- NEW LINE ADDED: Tell the rest of the app that blogs are ready ---
        document.dispatchEvent(new Event('blogsRendered')); 
    }

    /**
     * Creates HTML for audio player
     */
    function createAudioPlayer(blogId, audioFile) {
        return `
            <div class="audio-player" id="audioPlayerContainer-${blogId}">
                <button class="play-pause-btn" id="playBtn-${blogId}" aria-label="Play Audio">
                    <svg id="playIcon-${blogId}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    <svg id="pauseIcon-${blogId}" style="display:none;" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                </button>
                <span class="initial-listen-text" id="initialTimeLabel-${blogId}">listen to this blog (... minute listen)</span>
                <div class="audio-info">
                    <div class="audio-label">
                        <span class="audio-duration" id="audioTime-${blogId}">0:00 / 0:00</span>
                    </div>
                    <input type="range" id="seekSlider-${blogId}" class="seek-slider" value="0" step="1">
                </div>
                <audio id="blogAudio-${blogId}" src="${audioFile}" preload="metadata"></audio>
            </div>
        `;
    }
})();