/**
 * Audio Player Module
 * Handles custom audio players for all blog posts
 * Automatically initializes all audio players on the page
 */

(function() {
    'use strict';

    document.addEventListener('blogsRendered', init);

    function init() {
        initializeAllAudioPlayers();
    }

    /**
     * Finds and initializes all audio players on the page
     */
    function initializeAllAudioPlayers() {
        const audioElements = document.querySelectorAll('audio[id^="blogAudio-"]');
        
        audioElements.forEach(audio => {
            const blogId = audio.id.replace('blogAudio-', '');
            initializeAudioPlayer(blogId);
        });
    }

    /**
     * Initializes a single audio player
     * @param {string} blogId - The unique blog post ID
     */
    function initializeAudioPlayer(blogId) {
        // Get elements for this specific audio player
        const audio = document.getElementById(`blogAudio-${blogId}`);
        const playBtn = document.getElementById(`playBtn-${blogId}`);
        const playIcon = document.getElementById(`playIcon-${blogId}`);
        const pauseIcon = document.getElementById(`pauseIcon-${blogId}`);
        const audioTime = document.getElementById(`audioTime-${blogId}`);
        const seekSlider = document.getElementById(`seekSlider-${blogId}`);
        const playerContainer = document.getElementById(`audioPlayerContainer-${blogId}`);
        const initialTimeLabel = document.getElementById(`initialTimeLabel-${blogId}`);

        // Verify all elements exist
        if (!audio || !playBtn || !playIcon || !pauseIcon || !audioTime || 
            !seekSlider || !playerContainer || !initialTimeLabel) {
            return;
        }

        let isDragging = false;

        // Helper Functions
        function formatTime(seconds) {
            if (isNaN(seconds)) return "0:00";
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        function updatePlayIcons(isPlaying) {
            if (isPlaying) {
                playIcon.style.display = 'none';
                pauseIcon.style.display = 'block';
            } else {
                playIcon.style.display = 'block';
                pauseIcon.style.display = 'none';
            }
        }

        function updateSliderBackground() {
            const percentage = (audio.currentTime / (audio.duration || 1)) * 100;
            seekSlider.style.background = 
                `linear-gradient(to right, #808080 0%, #808080 ${percentage}%, #e5e5e5 ${percentage}%, #e5e5e5 100%)`;
        }

        function updateDisplay() {
            const current = formatTime(audio.currentTime);
            const total = formatTime(audio.duration || 0);
            audioTime.textContent = `${current} / ${total}`;
            
            if (!isDragging) {
                seekSlider.value = audio.currentTime;
            }

            updateSliderBackground();
        }

        // Event Handlers
        function handlePlayPause() {
            if (audio.paused) {
                // Pause all other audio players
                pauseAllOtherPlayers(blogId);
                
                audio.play();
                updatePlayIcons(true);
                playerContainer.classList.add('is-active');
            } else {
                audio.pause();
                updatePlayIcons(false);
            }
        }

        function handleMetadataLoaded() {
            seekSlider.max = Math.floor(audio.duration);
            const totalMins = Math.floor(audio.duration / 60);
            initialTimeLabel.textContent = `listen to this blog (${totalMins} minute listen)`;
            updateDisplay();
        }

        function handleSliderInput() {
            isDragging = true;
            const current = formatTime(seekSlider.value);
            const total = formatTime(audio.duration || 0);
            audioTime.textContent = `${current} / ${total}`;
            updateSliderBackground();
        }

        function handleSliderChange() {
            audio.currentTime = seekSlider.value;
            isDragging = false;
        }

        function handleAudioEnded() {
            updatePlayIcons(false);
            audio.currentTime = 0;
            seekSlider.value = 0;
            updateDisplay();
        }

        // Attach Event Listeners
        audio.addEventListener('loadedmetadata', handleMetadataLoaded);
        audio.addEventListener('timeupdate', updateDisplay);
        audio.addEventListener('ended', handleAudioEnded);
        
        playBtn.addEventListener('click', handlePlayPause);
        
        seekSlider.addEventListener('input', handleSliderInput);
        seekSlider.addEventListener('change', handleSliderChange);

        // Store reference for cross-player communication
        if (!window.audioPlayers) {
            window.audioPlayers = {};
        }
        window.audioPlayers[blogId] = {
            audio: audio,
            pause: () => {
                audio.pause();
                updatePlayIcons(false);
            }
        };
    }

    /**
     * Pauses all audio players except the specified one
     * @param {string} currentBlogId - The blog ID that should keep playing
     */
    function pauseAllOtherPlayers(currentBlogId) {
        if (window.audioPlayers) {
            Object.keys(window.audioPlayers).forEach(blogId => {
                if (blogId !== currentBlogId) {
                    window.audioPlayers[blogId].pause();
                }
            });
        }
    }

    // Make pause all function available globally
    window.pauseAllAudioPlayers = function() {
        if (window.audioPlayers) {
            Object.keys(window.audioPlayers).forEach(blogId => {
                window.audioPlayers[blogId].pause();
            });
        }
    };
})();