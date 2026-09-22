/**
 * Digital Twin Chat Module
 * Talks to the Cloudflare Worker, which streams replies from Workers AI
 * token-by-token for a live typewriter effect.
 *
 * - Voice input on top of the original chat logic.
 * - Input auto-grows up to 2 lines, then scrolls internally.
 * - Scroll position is respected while a reply streams (no forced yanking).
 * - Typing is never blocked: messages sent while the AI is still replying
 *   are queued and sent automatically, in order, once it's free.
 */

(function() {
    'use strict';

    const WORKER_URL = 'https://pranav-digital-twin.pranavdigitaltwin.workers.dev';
const SESSION_KEY = 'digitalTwinSessionId';

let chatMessages, chatInput, chatSendBtn, chatTyping, chatRemaining, chatScrollBottomBtn;
let chatMicIcon, chatSendIcon;
let chatRecording, chatVoiceControls, chatVoiceSendBtn, chatVoiceStopBtn;
let chatInputRow;

// Digital Twin interactive eyes
let digitalTwinAvatar;
let digitalTwinLeftEye;
let digitalTwinRightEye;
let digitalTwinLeftHighlight;
let digitalTwinRightHighlight;
let digitalTwinLeftPupilCore;
let digitalTwinRightPupilCore;

const DIGITAL_TWIN_IMAGE_WIDTH = 1150;
const DIGITAL_TWIN_IMAGE_HEIGHT = 1367;

const DIGITAL_TWIN_EYES = {
    left: {
        x: 477,
        y: 590
    },
    right: {
        x: 680,
        y: 568
    }
};

const DIGITAL_TWIN_MAX_EYE_MOVE_X = 15;   // left-right range
const DIGITAL_TWIN_MAX_EYE_MOVE_Y = 9;    // up-down range (smaller = more natural)
const DIGITAL_TWIN_TYPING_LOOK_DOWN = 0.9; // how far down he looks while replying (0 to 1 of Y range)
const DIGITAL_TWIN_IDLE_AFTER_MS = 4000;  // start wandering after this much quiet

let digitalTwinLids = [];
let digitalTwinBlinkTimer = null;
let digitalTwinIdleTimer = null;
let digitalTwinLastInteraction = 0;
let digitalTwinLastGaze = { x: 0, y: 0 };
let digitalTwinReadLineTop = null;   // remembers which text line the cursor is on
let digitalTwinReadLastUpdate = 0;   // throttle

let history = [];
    let sessionId = null;
    let isSending = false;       // true while a request to the API is actively in flight
    let rateLimited = false;
    let initialized = false;

    // Messages the user sent while a previous reply was still streaming.
    // Processed strictly one at a time, in order.
    let pendingQueue = [];
    let activeVoiceNote = null;
    let activeChatAbortController = null;

    // Voice state
    let recognition = null;
    let micPermissionStatus = null;
    let micWasBlocked = false;
    let isListening = false;
    let userRequestedStop = false;
    let interimVoiceText = '';
    let micBlockedNoticeEl = null;
    let discardSpeechResults = false;

    let cachedVoices = [];
    let fastForwardStream = false;

    const NEAR_BOTTOM_PX = 40;
    const STREAM_IDLE_TIMEOUT_MS = 30000;

    function isNearBottom() {
        return (
            chatMessages.scrollHeight -
            chatMessages.scrollTop -
            chatMessages.clientHeight
        ) <= NEAR_BOTTOM_PX;
    }

    function updateScrollButtonVisibility() {
        if (!chatScrollBottomBtn) return;
        chatScrollBottomBtn.classList.toggle('visible', !isNearBottom());
    }

    // Call before appending/growing content to snapshot whether the user
    // was following along near the bottom.
    function wasFollowingBottom() {
        return isNearBottom();
    }

    // Call after appending/growing content. Only snaps to bottom if they
    // were already following along — otherwise leaves their scroll position
    // alone so reading older messages isn't interrupted by a streaming reply.
    function applyScrollFollow(wasFollowing) {
        if (wasFollowing) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        updateScrollButtonVisibility();
    }


    function getOrCreateSessionId() {
    let id = null;

    try { id = sessionStorage.getItem(SESSION_KEY); } catch {}

    if (!id) {
        id = (crypto.randomUUID
            ? crypto.randomUUID()
            : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

        try { sessionStorage.setItem(SESSION_KEY, id); } catch {}
    }

    return id;
}


    /* =========================================================
       Auto-growing input (caps at 2 lines, then scrolls)
       ========================================================= */

    function autoResizeInput() {
        chatInput.style.height = 'auto';
        void chatInput.offsetHeight; // force reflow so scrollHeight reads correctly

        const style = window.getComputedStyle(chatInput);
        const lineHeight = parseFloat(style.lineHeight) || 20;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        const maxHeight = lineHeight * 2 + paddingTop + paddingBottom; // hard cap: 2 lines

        const newHeight = Math.min(chatInput.scrollHeight, maxHeight);
        chatInput.style.height = newHeight + 'px';
        chatInput.style.overflowY = chatInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }

    const MAX_VOICE_CHARS = 220; // ~10s spoken at a natural pace

    function parseVoice(text) {
        const match = text.match(
            /\[voice\]([\s\S]*?)\[\/voice\]/i
        );

        if (!match) return null;

        let voiceText = match[1]
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
            .replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, '')
            .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
            .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!voiceText) return null;

        if (voiceText.length > MAX_VOICE_CHARS) {
            // Cut at the last full sentence within the cap, falling back
            // to a hard slice if no sentence boundary is found.
            const truncated = voiceText.slice(0, MAX_VOICE_CHARS);
            const lastBoundary = Math.max(
                truncated.lastIndexOf('. '),
                truncated.lastIndexOf('! '),
                truncated.lastIndexOf('? ')
            );

            voiceText = lastBoundary > 40
                ? truncated.slice(0, lastBoundary + 1)
                : truncated.trim();
        }

        return voiceText;
    }




    function primeVoiceCache() {
        if (!('speechSynthesis' in window)) return;

        const load = () => {
            const list = window.speechSynthesis.getVoices();
            if (list.length) cachedVoices = list;
        };

        load();
        window.speechSynthesis.addEventListener('voiceschanged', load);
    }

    function makeTtsFriendly(text) {
        const digitWords = {
            '0': 'zero',
            '1': 'one',
            '2': 'two',
            '3': 'three',
            '4': 'four',
            '5': 'five',
            '6': 'six',
            '7': 'seven',
            '8': 'eight',
            '9': 'nine'
        };

        return text.replace(/\+91\s*(\d{10})\b/g, (_, number) => {
            return number
                .split('')
                .map(digit => digitWords[digit])
                .join(' ');
        });
    }

    function addVoiceNoteToBubble(bubble, voiceText) {
        if (!bubble || !voiceText) return null;

        if (!('speechSynthesis' in window)) {
            console.warn('Browser speech synthesis is not supported.');
            return null;
        }

        const voiceWrap = document.createElement('div');
        voiceWrap.className = 'chat-voice-note';

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'chat-voice-play';
        playBtn.setAttribute('aria-label', 'Play voice note');
        playBtn.textContent = '▶';

        const progress = document.createElement('input');
        progress.type = 'range';
        progress.className = 'chat-voice-progress';
        progress.min = '0';
        progress.max = '100';
        progress.value = '0';
        progress.setAttribute('aria-label', 'Voice note progress');

        const updateProgressVisual = (percent) => {
            const clamped = Math.max(0, Math.min(100, percent));
            progress.value = String(clamped);
            progress.style.setProperty('--voice-progress', `${clamped}%`);
        };

        updateProgressVisual(0);

        const speechText = makeTtsFriendly(
            voiceText
            // Strip emoji and all their attaching modifiers — presentation
            // selectors, ZWJ, skin-tone modifiers, keycap combining marks,
            // and flag pairs — so TTS never reads a leftover code point's
            // Unicode name aloud.
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
            .replace(/[\u{FE0F}\u{200D}\u{20E3}]/gu, '')
            .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
            .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
        )

        if (!speechText) return null;

        const voices = cachedVoices.length
            ? cachedVoices
            : window.speechSynthesis.getVoices();

        const maleVoice = voices.find(
            voice =>
                /^en-/i.test(voice.lang) &&
                !/female|woman|zira|samantha|susan|hazel/i.test(voice.name) &&
                /\b(male|david|mark|alex|daniel|james|george|guy)\b/i.test(voice.name)
        );

        const englishVoice = voices.find(voice => /^en-/i.test(voice.lang));
        const selectedVoice = maleVoice || englishVoice;

        // ---------------------------------------------------------------
        // Playback state. speechPosition is the single source of truth for
        // "where we are" — both pausing and resuming just read/write it.
        // ---------------------------------------------------------------
        let speechPosition = 0;
        let voiceState = 'idle'; // 'idle' | 'playing' | 'paused'
        let utteranceId = 0;
        let currentUtterance = null;

        // Smooth, self-correcting progress: interpolate with rAF using an
        // estimated speaking rate, then recalibrate that estimate every time
        // a real onboundary event arrives (browsers fire these inconsistently
        // — some per word, some per sentence, some almost never).
        let estimatedCharsPerSec = 14;
        let anchorPosition = 0;
        let anchorTime = 0;
        let lastBoundaryTime = 0;
        let lastBoundaryPosition = 0;
        let rafHandle = null;

        function stopVisualLoop() {
            if (rafHandle !== null) {
                cancelAnimationFrame(rafHandle);
                rafHandle = null;
            }
        }

        function visualTick() {
            if (voiceState !== 'playing') {
                rafHandle = null;
                return;
            }

            const elapsedSec = (performance.now() - anchorTime) / 1000;
            const estimate = anchorPosition + elapsedSec * estimatedCharsPerSec;

            speechPosition = Math.min(estimate, speechText.length);
            updateProgressVisual((speechPosition / speechText.length) * 100);

            rafHandle = requestAnimationFrame(visualTick);
        }

        function startVisualLoop(fromPosition) {
            stopVisualLoop();
            anchorPosition = fromPosition;
            anchorTime = performance.now();
            lastBoundaryTime = anchorTime;
            lastBoundaryPosition = fromPosition;
            rafHandle = requestAnimationFrame(visualTick);
        }

        function setPlayingUI() {
            playBtn.textContent = '❚❚';
            playBtn.setAttribute('aria-label', 'Pause voice note');
        }

        function setPausedUI() {
            playBtn.textContent = '▶';
            playBtn.setAttribute(
                'aria-label',
                voiceState === 'idle' ? 'Play voice note' : 'Resume voice note'
            );
        }

        function createUtterance(text) {
            const utterance = new SpeechSynthesisUtterance(text);

            if (selectedVoice) {
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
            } else {
                utterance.lang = 'en-US';
            }

            utterance.rate = 1;
            utterance.pitch = 1;

            return utterance;
        }

        // Every "play" and every "resume" goes through here. We never call
        // speechSynthesis.pause()/resume() — instead we always cancel and
        // re-speak from the remembered offset. This is what makes play/pause
        // reliable: we're not depending on browser pause/resume behavior,
        // which is flaky across Chrome/Firefox/Safari.
        function playFrom(startChar) {
            const id = ++utteranceId;

            currentUtterance = null;
            window.speechSynthesis.cancel();

            const clampedStart = Math.max(0, Math.min(startChar, speechText.length));
            const remainingText = speechText.slice(clampedStart);

            if (!remainingText.trim()) {
                speechPosition = speechText.length;
                updateProgressVisual(100);
                voiceState = 'idle';
                setPausedUI();
                return;
            }

            voiceState = 'playing';
            setPlayingUI();
            startVisualLoop(clampedStart);

            // Chrome has a known race where speak() right after cancel() can
            // silently drop the utterance. A short delay lets cancel() settle.
            setTimeout(() => {
                if (id !== utteranceId) return;

                const utterance = createUtterance(remainingText);
                currentUtterance = utterance;

                utterance.onboundary = (event) => {
                    if (utterance !== currentUtterance || voiceState !== 'playing') return;
                    if (typeof event.charIndex !== 'number') return;

                    const now = performance.now();
                    const newPosition = clampedStart + event.charIndex;

                    const dt = (now - lastBoundaryTime) / 1000;
                    const dPos = newPosition - lastBoundaryPosition;

                    if (dt > 0.05 && dPos > 0) {
                        const observedRate = dPos / dt;
                        estimatedCharsPerSec = Math.max(6, Math.min(30, observedRate));
                    }

                    lastBoundaryTime = now;
                    lastBoundaryPosition = newPosition;
                    anchorPosition = newPosition;
                    anchorTime = now;
                    speechPosition = newPosition;
                };

                utterance.onend = () => {
                    if (utterance !== currentUtterance) return;

                    stopVisualLoop();

                    // Only treat this as "finished" if we're still the active
                    // playing utterance — if we got here because pausePlayback()
                    // cancelled us, voiceState is already 'paused' and we leave
                    // the position alone.
                    if (voiceState === 'playing') {
                        speechPosition = speechText.length;
                        updateProgressVisual(100);
                        voiceState = 'idle';
                        setPausedUI();
                    }

                    if (activeVoiceNote === voiceWrap) {
                        activeVoiceNote = null;
                    }
                };

                utterance.onerror = (error) => {
                    if (utterance !== currentUtterance) return;

                    console.warn('Speech synthesis error:', error);

                    stopVisualLoop();
                    voiceState = 'idle';
                    setPausedUI();

                    if (activeVoiceNote === voiceWrap) {
                        activeVoiceNote = null;
                    }
                };

                window.speechSynthesis.speak(utterance);
            }, 60);
        }

        function pausePlayback() {
            utteranceId++; // invalidate any in-flight callbacks from the old utterance
            currentUtterance = null;
            window.speechSynthesis.cancel();
            stopVisualLoop();

            voiceState = 'paused';
            setPausedUI();
        }

        playBtn.addEventListener('click', () => {
            try {
                if (activeVoiceNote && activeVoiceNote !== voiceWrap) {
                    activeVoiceNote._pauseForOtherNote();
                }

                activeVoiceNote = voiceWrap;

                if (voiceState === 'playing') {
                    pausePlayback();
                    return;
                }

                if (speechPosition >= speechText.length) {
                    speechPosition = 0;
                    updateProgressVisual(0);
                }

                playFrom(speechPosition);
            } catch (error) {
                console.warn('Voice playback failed:', error);
            }
        });

        voiceWrap._pauseForOtherNote = () => {
            if (voiceState === 'playing') {
                pausePlayback();
            }
        };

        // ---- Slider ----
        // pointerdown covers mouse + touch drag start; the same "arm" check
        // also runs on the first 'input' event so keyboard arrow-key scrubbing
        // (which never fires pointerdown) is handled the same way.
        let isDragging = false;
        let resumeAfterDrag = false;

        function beginScrubIfNeeded() {
            if (isDragging) return;

            isDragging = true;
            resumeAfterDrag = (voiceState === 'playing');

            if (resumeAfterDrag) {
                pausePlayback();
            }
        }

        progress.addEventListener('pointerdown', beginScrubIfNeeded);

        progress.addEventListener('input', () => {
            beginScrubIfNeeded();

            const targetPosition = Math.round(
                (Number(progress.value) / 100) * speechText.length
            );

            speechPosition = targetPosition;
            updateProgressVisual(Number(progress.value));
        });

        const commitDrag = () => {
            if (!isDragging) return;

            isDragging = false;

            if (resumeAfterDrag) {
                playFrom(speechPosition);
            }

            resumeAfterDrag = false;
        };

        progress.addEventListener('change', commitDrag);
        progress.addEventListener('pointerup', commitDrag);
        progress.addEventListener('pointercancel', commitDrag);

        voiceWrap.appendChild(playBtn);
        voiceWrap.appendChild(progress);

        bubble.appendChild(voiceWrap);

        applyScrollFollow(wasFollowingBottom());

        return {
            utterance: currentUtterance,
            playBtn,
            progress
        };
    }

    function generateVoiceNoteAudio(voiceText) {
        return Promise.resolve(voiceText);
    }


    function isDigitalTwinSectionActive() {
        const section = document.getElementById('digital-twin');

        return section &&
            section.classList.contains('active');
    }


    function observeDigitalTwinSection() {
        const section = document.getElementById('digital-twin');

        if (!section) return;

        const observer = new MutationObserver(() => {

            // Focus the chat input whenever the Digital Twin section becomes active.
            if (isDigitalTwinSectionActive() && chatInput) {
                requestAnimationFrame(() => {
                    focusInputWithoutKeyboard();
                });
            }

            if (
                isListening &&
                !isDigitalTwinSectionActive()
            ) {
                userRequestedStop = true;
                isListening = false;
                interimVoiceText = '';

                try {
                    recognition.abort();
                } catch (error) {
                    console.warn(
                        'Could not abort speech recognition:',
                        error
                    );
                }

                chatSendBtn.classList.remove('listening');
                setRecordingUI(false);
                updateActionButton();
            }

            // Pause any currently-playing voice note when the section
            // becomes inactive, so it doesn't keep talking in the background.
            if (
                activeVoiceNote &&
                !isDigitalTwinSectionActive()
            ) {
                try {
                    activeVoiceNote._pauseForOtherNote();
                } catch (error) {
                    console.warn(
                        'Could not pause voice note:',
                        error
                    );
                }
            }

            // Close the reaction picker too — it's a fixed-position overlay on
            // document.body, so it survives section changes unless removed explicitly.
            if (!isDigitalTwinSectionActive()) {
                closeReactionPicker();
                closeMicBlockedNotice();
            }
        });

        observer.observe(
            section,
            {
                attributes: true,
                attributeFilter: ['class']
            }
        );
    }

    function parseReaction(text) {
        const match = text.match(
            /\[REACTION\]\s*([^\[\]\r\n]+?)\s*\[\/REACTION\]/u
        );

        if (!match) return null;

        return match[1].trim();
    }

    const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];
    let reactionPickerEl = null;
    let longPressTimer = null;
    let longPressStartPos = null;
    let longPressTriggered = false;
    const LONG_PRESS_MS = 450;
    const LONG_PRESS_MOVE_TOLERANCE = 10;
    const DOUBLE_TAP_MS = 300;
    let lastTapTime = 0;
    let lastTapBubble = null;

    function closeReactionPicker() {
        if (reactionPickerEl) {
            reactionPickerEl.remove();
            reactionPickerEl = null;
        }
        document.removeEventListener('pointerdown', handleOutsidePickerClick, true);
    }

    function handleOutsidePickerClick(e) {
        if (reactionPickerEl && !reactionPickerEl.contains(e.target)) {
            closeReactionPicker();
        }
    }

    function showReactionPicker(bubble, clientX, clientY) {
        closeReactionPicker();

        const currentReaction = bubble.dataset.selectedReaction || '';

        const picker = document.createElement('div');
        picker.className = 'chat-reaction-picker';

        REACTION_EMOJIS.forEach(emoji => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chat-reaction-picker-btn';
            btn.textContent = emoji;

            if (emoji === currentReaction) {
                btn.classList.add('selected');
            }

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                addReactionToBubble(bubble, emoji);
                closeReactionPicker();
            });

            picker.appendChild(btn);
        });

        // Start invisible but laid out, so offsetWidth/Height are correct
        // before we do any positioning math.
        picker.style.visibility = 'hidden';
        document.body.appendChild(picker);
        reactionPickerEl = picker;

        const pickerWidth = picker.offsetWidth;
        const pickerHeight = picker.offsetHeight;
        const margin = 10;
        const viewportWidth = window.innerWidth;

        // Which half of the screen was pressed decides which edge we anchor to.
        const pressedLeftHalf = clientX < viewportWidth / 2;

        let left;
        if (pressedLeftHalf) {
            // Anchor picker's LEFT edge near the press point, growing rightward.
            left = clientX - 20;
        } else {
            // Anchor picker's RIGHT edge near the press point, growing leftward.
            left = clientX - pickerWidth + 20;
        }

        // Final safety clamp so it never touches the screen edges.
        left = Math.max(margin, Math.min(left, viewportWidth - pickerWidth - margin));

        let top = clientY - pickerHeight - 14;
        if (top < margin) top = clientY + 14; // flip below if no room above

        // Same safety clamp as `left` — don't let it run past the bottom edge either.
        const viewportHeight = window.innerHeight;
        top = Math.max(margin, Math.min(top, viewportHeight - pickerHeight - margin));

        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;
        picker.style.visibility = '';

        requestAnimationFrame(() => picker.classList.add('visible'));

        setTimeout(() => {
            document.addEventListener('pointerdown', handleOutsidePickerClick, true);
        }, 0);
    }

    function attachReactionLongPress() {
        chatMessages.addEventListener('pointerdown', (e) => {
            const bubble = e.target.closest('.chat-msg-bot');
            if (!bubble) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            if (e.target.closest('.link-preview, .chat-voice-note, .inline-copy-btn, a')) {
                return;
            }

            // Don't allow reacting while this bubble is still streaming in
            // (has an active blinking cursor or "speaking..." indicator).
            if (bubble.querySelector('.stream-cursor, .voice-preparing')) {
                return;
            }

            longPressStartPos = { x: e.clientX, y: e.clientY };

            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                navigator.vibrate?.(12);
                showReactionPicker(bubble, e.clientX, e.clientY);
            }, LONG_PRESS_MS);
        });

        const cancelLongPress = () => {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        };

        chatMessages.addEventListener('pointermove', (e) => {
            if (!longPressTimer || !longPressStartPos) return;

            const dx = e.clientX - longPressStartPos.x;
            const dy = e.clientY - longPressStartPos.y;

            if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) {
                cancelLongPress();
            }
        });

        chatMessages.addEventListener('pointerup', cancelLongPress);
        chatMessages.addEventListener('pointercancel', cancelLongPress);
        chatMessages.addEventListener('scroll', cancelLongPress);

        // Double-tap (Instagram-style) also opens the picker
        chatMessages.addEventListener('pointerup', (e) => {
            if (longPressTriggered) {
                longPressTriggered = false;
                return;
            }

            const bubble = e.target.closest('.chat-msg-bot');
            if (!bubble) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            if (e.target.closest('.link-preview, .chat-voice-note, .inline-copy-btn, a')) {
                return;
            }

            if (bubble.querySelector('.stream-cursor, .voice-preparing')) {
                return;
            }

            const now = Date.now();
            const isSameBubble = bubble === lastTapBubble;
            const isQuickEnough = now - lastTapTime < DOUBLE_TAP_MS;

            if (isSameBubble && isQuickEnough) {
                navigator.vibrate?.(12);
                showReactionPicker(bubble, e.clientX, e.clientY);
                lastTapTime = 0;
                lastTapBubble = null;
            } else {
                lastTapTime = now;
                lastTapBubble = bubble;
            }
        });

        // Desktop convenience: right-click also opens the picker
        chatMessages.addEventListener('contextmenu', (e) => {
            const bubble = e.target.closest('.chat-msg-bot');
            if (!bubble) return;
            if (e.target.closest('.link-preview, .chat-voice-note, .inline-copy-btn, a')) return;
            if (bubble.querySelector('.stream-cursor, .voice-preparing')) return;

            e.preventDefault();
            showReactionPicker(bubble, e.clientX, e.clientY);
        });
    }

    function addReactionToBubble(bubble, emoji) {
        if (!bubble || !emoji) return;

        const existing = bubble.querySelector('.chat-reaction');
        const alreadySelected = existing && existing.dataset.emoji === emoji;

        existing?.remove();

        // Clicking the same emoji again just removes it (unselect).
        if (alreadySelected) {
            bubble.dataset.selectedReaction = '';
            return;
        }

        const reaction = document.createElement('span');
        reaction.className = 'chat-reaction';
        reaction.textContent = emoji;
        reaction.dataset.emoji = emoji;

        bubble.appendChild(reaction);
        bubble.dataset.selectedReaction = emoji;
    }


    function appendMessage(role, text, hideErrorImage = false, invisible = false) {
        const wasFollowing =
            role === 'user'
                ? true
                : wasFollowingBottom();

        const bubble = document.createElement('div');

        bubble.className =
            role === 'user'
                ? 'chat-msg chat-msg-user'
                : role === 'error'
                    ? 'chat-msg chat-msg-error'
                    : 'chat-msg chat-msg-bot';


        // Error message with Pranav image
        if (role === 'error') {
            if (!hideErrorImage) {
                const image = document.createElement('img');
                image.alt = '';
                image.className = 'chat-error-image chat-error-image-pending';

                image.addEventListener('load', () => {
                    image.classList.remove('chat-error-image-pending');
                }, { once: true });

                image.addEventListener('error', () => {
                    image.remove();
                }, { once: true });

                image.src = '/src/images/error_image_twin.png';

                bubble.appendChild(image);
            }

            const message = document.createElement('p');
            message.appendChild(buildLinkedFragment(text));

            bubble.appendChild(message);
        } else {
            const p = document.createElement('p');
            p.textContent = text;
            bubble.appendChild(p);
        }


        chatMessages.appendChild(bubble);

        if (invisible) {
            bubble.style.opacity = '0';
            bubble.style.pointerEvents = 'none';
        }

        applyScrollFollow(wasFollowing);

        return bubble;
    }

    function appendEmptyBotBubble(replyQuoteText) {
        const wasFollowing = wasFollowingBottom();

        const bubble = document.createElement('div');
        bubble.className = 'chat-msg chat-msg-bot';

        if (replyQuoteText) {
            const quote = document.createElement('div');
            quote.className = 'chat-reply-quote';
            quote.textContent = replyQuoteText;
            bubble.appendChild(quote);
        }

        const p = document.createElement('p');
        p.textContent = '';

        const cursor = document.createElement('span');
        cursor.className = 'stream-cursor';

        p.appendChild(cursor);
        bubble.appendChild(p);

        chatMessages.appendChild(bubble);
        applyScrollFollow(wasFollowing);

        return bubble;
    }


    function setTyping(visible) {
        const wasFollowing = visible ? wasFollowingBottom() : false;

        chatTyping.style.display = visible ? 'flex' : 'none';

        if (visible) {
            const y = DIGITAL_TWIN_MAX_EYE_MOVE_Y * DIGITAL_TWIN_TYPING_LOOK_DOWN;
            setDigitalTwinEyeOffset(digitalTwinLeftEye, 0, y);
            setDigitalTwinEyeOffset(digitalTwinRightEye, 0, y);
            digitalTwinLastGaze = { x: 0, y };
            digitalTwinLastInteraction = Date.now();

            applyScrollFollow(wasFollowing);
        }
    }


    /* =========================================================
       Voice UI
       ========================================================= */

    function updateActionButton() {
        const hasText = chatInput.value.trim().length > 0;

        chatSendBtn.classList.toggle('mic-mode', !hasText);
        chatSendBtn.classList.toggle('send-mode', hasText);

        chatSendBtn.setAttribute(
            'aria-label',
            hasText ? 'Send message' : 'Start voice recording'
        );
    }

    function closeMicBlockedNotice() {
        if (!micBlockedNoticeEl) return;

        micBlockedNoticeEl.classList.remove('visible');
        document.removeEventListener('pointerdown', handleOutsideMicNoticeClick, true);

        const el = micBlockedNoticeEl;
        micBlockedNoticeEl = null;

        setTimeout(() => el.remove(), 200);
    }

    function handleOutsideMicNoticeClick(e) {
        if (micBlockedNoticeEl && !micBlockedNoticeEl.contains(e.target)) {
            closeMicBlockedNotice();
        }
    }

    function showMicBlockedNotice() {
        if (micBlockedNoticeEl) return; // already showing

        const notice = document.createElement('div');
        notice.className = 'chat-mic-blocked-notice';

        notice.innerHTML = `
            <div class="chat-mic-blocked-title">Microphone access is blocked</div>
            <div class="chat-mic-blocked-desc">To use dictation, select the site settings icon in your browser's address bar and allow the microphone.</div>
            <button type="button" class="chat-mic-blocked-btn">Got it</button>
        `;

        // Start invisible but laid out, so offsetWidth/Height are correct
        // before we position it relative to the mic button.
        notice.style.visibility = 'hidden';
        document.body.appendChild(notice);
        micBlockedNoticeEl = notice;

                const btnRect = chatSendBtn.getBoundingClientRect();
        const noticeWidth = notice.offsetWidth;
        const noticeHeight = notice.offsetHeight;
        const margin = 10;

        // Target the exact same point the "Speak" tooltip's arrow points to:
        // that tooltip's arrow sits at right:18px from the button, with a
        // 12px-wide triangle (6px border), so its tip center is 24px in
        // from the button's right edge.
        const arrowTargetX = btnRect.right - 18;

        // Anchor the notice's RIGHT edge above the mic button.
        let left = btnRect.right - noticeWidth;
        left = Math.max(margin, Math.min(left, window.innerWidth - noticeWidth - margin));

        const top = btnRect.top - noticeHeight - 10;

        // Distance from the notice's right edge to the arrow tip, used to
        // keep the arrow pointing at that exact spot even if `left` got clamped.
        const arrowOffsetFromRight = Math.max(
            20,
            Math.min(noticeWidth - 20, (left + noticeWidth) - arrowTargetX)
        );

        notice.style.left = `${left}px`;
        notice.style.top = `${top}px`;
        notice.style.setProperty('--arrow-right', `${arrowOffsetFromRight}px`);
        notice.style.visibility = '';

        requestAnimationFrame(() => notice.classList.add('visible'));

        notice.querySelector('.chat-mic-blocked-btn')
            .addEventListener('click', closeMicBlockedNotice);

        setTimeout(() => {
            document.addEventListener('pointerdown', handleOutsideMicNoticeClick, true);
        }, 0);
    }

    async function showMicBlockedNoticeIfDenied() {
        // A dismissed prompt raises the same 'not-allowed' error as a real
        // block, but leaves the permission at 'prompt' — the next mic click
        // can still ask. Only warn when we're actually blocked.
        if (!navigator.permissions?.query) {
            // No Permissions API (Firefox/Safari): can't tell the two apart,
            // so fall back to warning — better than a mic that silently does nothing.
            showMicBlockedNotice();
            return;
        }

        try {
            // Re-query instead of reading micPermissionStatus — the cached
            // object's state can lag a tick behind the recognition error.
            const status = await navigator.permissions.query({ name: 'microphone' });

            if (status.state === 'denied') {
                micWasBlocked = true;
                showMicBlockedNotice();
            }
        } catch (error) {
            showMicBlockedNotice();
        }
    }

    function setRecordingUI(recording) {
        chatRecording.classList.toggle('active', recording);
        chatVoiceControls.classList.toggle('active', recording);

        chatInputRow.classList.toggle(
            'voice-active',
            recording
        );

        chatSendBtn.style.display =
            recording ? 'none' : 'flex';
    }


    /* =========================================================
       Speech recognition
       ========================================================= */

    function setupSpeechRecognition() {
        const SpeechRecognition =
            window.SpeechRecognition ||
            window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            return;
        }

        recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = 'en-US';


        recognition.onstart = () => {
            isListening = true;
            userRequestedStop = false;
            discardSpeechResults = false;
            interimVoiceText = '';

            chatSendBtn.classList.add('listening');
            setRecordingUI(true);
        };


        recognition.onresult = (event) => {
            if (discardSpeechResults) return;
            let finalText = '';
            let interimText = '';

            for (
                let i = event.resultIndex;
                i < event.results.length;
                i++
            ) {
                const transcript =
                    event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    finalText += transcript;
                } else {
                    interimText += transcript;
                }
            }

            /*
             * The input is the source of truth.
             * No hidden permanent transcript.
             */
            let currentText = chatInput.value.trim();

            /*
             * Remove the previous interim result
             * before adding the new one.
             */
            if (interimVoiceText) {
                const oldInterim = interimVoiceText.trim();

                if (
                    oldInterim &&
                    currentText.endsWith(oldInterim)
                ) {
                    currentText = currentText
                        .slice(0, currentText.length - oldInterim.length)
                        .trim();
                }
            }

            if (finalText) {
                currentText =
                    `${currentText} ${finalText}`
                        .replace(/\s+/g, ' ')
                        .trim();
            }

            if (interimText) {
                currentText =
                    `${currentText} ${interimText}`
                        .replace(/\s+/g, ' ')
                        .trim();
            }

            interimVoiceText = interimText;
            chatInput.value = currentText.slice(0, 200);
            autoResizeInput();
        };


        recognition.onerror = (event) => {
            console.warn(
                'Speech recognition error:',
                event.error
            );

            // Always reset the mic state after any recognition error.
            // This is especially important when the permission popup is dismissed.
            isListening = false;
            userRequestedStop = true;
            interimVoiceText = '';

            chatSendBtn.classList.remove('listening');
            setRecordingUI(false);
            updateActionButton();

            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                // Chrome keeps this instance poisoned after a denial — start()
                // on the same object errors again even once the user allows the
                // mic. Throw it away so the next click gets a clean recognizer.
                rebuildRecognition();
                showMicBlockedNoticeIfDenied();
            }
        };


        recognition.onend = () => {
            /*
             * User explicitly stopped.
             */
            if (userRequestedStop) {
                isListening = false;
                interimVoiceText = '';

                chatSendBtn.classList.remove('listening');
                setRecordingUI(false);
                updateActionButton();
                return;
            }

            /*
             * Browser sometimes ends continuous recognition
             * during silence. Keep the session alive.
             */
            if (isListening) {
                try {
                    recognition.start();
                } catch (error) {
                    console.warn(
                        'Could not restart speech recognition:',
                        error
                    );
                }
            }
        };
    }


    function rebuildRecognition() {
        if (recognition) {
            // Detach first so abort() can't re-enter onend and restart us.
            recognition.onstart = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;

            try {
                recognition.abort();
            } catch (error) {
                console.warn('Could not abort stale recognition:', error);
            }
        }

        recognition = null;
        isListening = false;
        userRequestedStop = false;
        interimVoiceText = '';

        setupSpeechRecognition();
    }

    async function watchMicPermission() {
        if (!navigator.permissions?.query) return;

        try {
            micPermissionStatus = await navigator.permissions.query({ name: 'microphone' });
        } catch (error) {
            // Firefox/Safari don't support the 'microphone' descriptor —
            // startVoiceRecording() falls back to a getUserMedia probe.
            return;
        }

        micPermissionStatus.addEventListener('change', () => {
            if (micPermissionStatus.state === 'denied') {
                micWasBlocked = true;
                return;
            }

            if (micPermissionStatus.state !== 'granted') return;

            closeMicBlockedNotice();

            // This event fires for the in-page prompt too, where recognition
            // is already starting — rebuilding there would abort the session
            // the user just allowed. Only swap in a fresh recognizer when
            // recovering from an actual block (address-bar re-allow).
            if (micWasBlocked && !isListening) {
                micWasBlocked = false;
                rebuildRecognition();
            } else {
                micWasBlocked = false;
            }
        });
    }

    async function startVoiceRecording() {
        if (isListening) return;

        // Live state, not a cached one — reflects address-bar changes instantly.
        if (micPermissionStatus?.state === 'denied') {
            showMicBlockedNotice();
            return;
        }

        // No Permissions API for the mic (Safari): probe with getUserMedia,
        // which always re-reads the current permission. Chrome skips this.
        if (!micPermissionStatus && navigator.mediaDevices?.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
            } catch (error) {
                showMicBlockedNotice();
                return;
            }
        }

        if (!recognition) setupSpeechRecognition();
        if (!recognition) return;

        closeMicBlockedNotice();
        userRequestedStop = false;
        interimVoiceText = '';

        try {
            recognition.start();
        } catch (error) {
            console.warn(
                'Could not start speech recognition:',
                error
            );

            rebuildRecognition();
            showMicBlockedNoticeIfDenied();
        }
    }


    function stopVoiceRecording() {
        if (!recognition || !isListening) return;

        userRequestedStop = true;
        isListening = false;

        try {
            recognition.stop();
        } catch (error) {
            console.warn(
                'Could not stop speech recognition:',
                error
            );
        }

        chatSendBtn.classList.remove('listening');

        /*
         * Recording UI disappears.
         * Transcript stays in the input.
         */
        setRecordingUI(false);
        updateActionButton();

        chatInput.focus();
    }


    function sendVoiceMessage() {
        const text = chatInput.value.trim();

        if (!text || rateLimited) return;

        userRequestedStop = true;
        isListening = false;
        discardSpeechResults = true;   

        try {
            if (recognition) {
                recognition.abort();
            }
        } catch (error) {
            console.warn(
                'Could not stop speech recognition:',
                error
            );
        }

        chatSendBtn.classList.remove('listening');
        setRecordingUI(false);

        sendMessage();
    }

    function focusInputWithoutKeyboard() {
        if (!chatInput) return;

        // Focusing normally pops the mobile keyboard. Briefly marking the
        // input readonly lets us focus (and place the cursor) without
        // triggering it, then we hand control back immediately after.
        chatInput.setAttribute('readonly', 'readonly');
        chatInput.focus();

        setTimeout(() => {
            chatInput.removeAttribute('readonly');
        }, 50);
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    const digitalTwinPhotos = {
        childhood: {
            image: '/src/images/memories/pranav_kid.jpeg',
            title: 'Pranav as a kid',
            caption: 'A little throwback to younger Pranav.'
        },

        'first-hackathon': {
            image: '/src/images/memories/pranav_hackathon.jpeg',
            title: 'First hackathon win',
            caption: 'Pranav winning his first hackathon.'
        },

        spain: {
            image: '/src/images/memories/pranav_spain.jpeg',
            title: 'Spain',
            caption: 'A memory from my trip to spain.'
        },

        'first-cricket-match': {
            image: '/src/images/memories/pranav_cricket.jpeg',
            title: 'First cricket match',
            caption: 'The first time Pranav watched a cricket match in a stadium.'
        },

        'poshmark-move': {
            image: '/src/images/memories/pranav_poshmark.jpeg',
            title: 'Moving out for Poshmark',
            caption: 'Pranav moving out of state to chennai for his job at Poshmark.'
        },

        dog: {
            image: '/src/images/memories/pranav_dog.jpeg',
            title: "Pranav's dog",
            caption: 'Pranav with his dog.'
        }
    };


    const LINK_PATTERN = /(https?:\/\/[^\s]+|linkedin\.com\/in\/pranavkohli24|github\.com\/PranavKohli24|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|(?:\+91)?8860271737)/gi;

    function createInlineCopyButton(textToCopy) {
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'inline-copy-btn';
        copyBtn.setAttribute('aria-label', 'Copy');
        copyBtn.textContent = '⧉';

        copyBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                await navigator.clipboard.writeText(textToCopy);
                copyBtn.textContent = '✓';
                copyBtn.classList.add('copied');

                setTimeout(() => {
                    copyBtn.textContent = '⧉';
                    copyBtn.classList.remove('copied');
                }, 1200);
            } catch (error) {
                console.warn('Copy failed:', error);
            }
        });

        return copyBtn;
    }

    function buildLinkedFragment(text, includeCopyButtons = true) {
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;

        LINK_PATTERN.lastIndex = 0;

        while ((match = LINK_PATTERN.exec(text)) !== null) {
            // Plain text before this match
            if (match.index > lastIndex) {
                fragment.appendChild(
                    document.createTextNode(
                        text.slice(lastIndex, match.index)
                    )
                );
            }

            const value = match[0];
            const anchor = document.createElement('a');
            let copyValue = value;

            if (value.includes('@')) {
                anchor.href = `mailto:${value}?subject=${encodeURIComponent(
                    'Hello Pranav Kohli'
                )}`;

                anchor.textContent = `✉ ${value}`;
                copyValue = value;

            } else if (
                value === '+918860271737' ||
                value === '8860271737'
            ) {
                anchor.href = 'tel:+918860271737';
                anchor.style.fontWeight = '600';
                anchor.textContent = value;
                copyValue = value;

            } else {
                anchor.href = value.startsWith('http')
                    ? value
                    : `https://${value}`;

                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
                anchor.textContent = value;
                copyValue = anchor.href;
            }

            fragment.appendChild(anchor);

            // Only attach the copy button once this link is fully streamed in —
            // otherwise it visibly shifts position as characters keep arriving.
            if (includeCopyButtons) {
                fragment.appendChild(createInlineCopyButton(copyValue));
            }

            lastIndex = LINK_PATTERN.lastIndex;
        }

        // Remaining plain text after the last match
        if (lastIndex < text.length) {
            fragment.appendChild(
                document.createTextNode(
                    text.slice(lastIndex)
                )
            );
        }

        return fragment;
    }

    function renderLinkedText(element, text, cursor) {

        const marker = '[CALENDAR_EVENT]';
        const photoMarker = '[SHOW_PHOTO]';

        let markerIndex = text.search(/\[CALENDAR_EVENT\]/i);
        let photoMarkerIndex = text.search(/\[SHOW_PHOTO\]/i);

        if (
            photoMarkerIndex !== -1 &&
            (markerIndex === -1 || photoMarkerIndex < markerIndex)
        ) {
            markerIndex = photoMarkerIndex;
        }

        // The response streams character-by-character, so hide even a
        // partially typed CALENDAR_EVENT marker before it becomes visible.
        if (markerIndex === -1) {
            for (let i = 1; i < marker.length; i++) {
                const suffix = text.slice(-i);

                if (
                    suffix.toLowerCase() ===
                    marker.slice(0, i).toLowerCase()
                ) {
                    markerIndex = text.length - i;
                    break;
                }
            }

            // Also hide a partially streamed [SHOW_PHOTO] marker
            if (markerIndex === -1) {
                for (let i = 1; i < photoMarker.length; i++) {
                    const suffix = text.slice(-i);

                    if (
                        suffix.toLowerCase() ===
                        photoMarker.slice(0, i).toLowerCase()
                    ) {
                        markerIndex = text.length - i;
                        break;
                    }
                }
            }
        }

        const visibleText = (
            markerIndex === -1
                ? text
                : text.slice(0, markerIndex)
        ).trim();

        element.textContent = '';

        // While a cursor is attached, this bubble/segment is still actively
        // streaming — suppress copy buttons until it's finalized (cursor null).
        const includeCopyButtons = !cursor;

        element.appendChild(
            buildLinkedFragment(visibleText, includeCopyButtons)
        );

        if (cursor) {
            element.appendChild(cursor);
        }
    }

    function addPhotoPreview(bubble, text) {
        // Only accept the exact internal photo command.
        // The ID itself must also exist in our local registry.
        const match = text.match(
            /\[SHOW_PHOTO\]\s*id\s*=\s*([a-z0-9-]+)\s*\[\/SHOW_PHOTO\]/i
        );

        if (!match) return;

        const photoId = match[1].trim().toLowerCase();
        const photo = digitalTwinPhotos[photoId];

        // Never render an unknown photo ID.
        if (!photo) return;

        // Only one photo can be rendered per AI response.
        if (bubble.querySelector('.digital-twin-photo')) return;

        const card = document.createElement('div');
        card.className = 'digital-twin-photo';

        const image = document.createElement('img');
        image.src = photo.image;
        image.alt = photo.title;
        image.className = 'digital-twin-photo-image';

        const info = document.createElement('div');
        info.className = 'digital-twin-photo-info';

        const title = document.createElement('div');
        title.className = 'digital-twin-photo-title';
        title.textContent = photo.title;

        const caption = document.createElement('div');
        caption.className = 'digital-twin-photo-caption';
        caption.textContent = photo.caption;

        info.appendChild(title);
        info.appendChild(caption);

        card.appendChild(image);
        card.appendChild(info);
        bubble.appendChild(card);

        const revealImage = () => {
            requestAnimationFrame(() => {
                image.classList.add('loaded');
            });
        };

        if (image.complete) {
            revealImage();
        } else {
            image.addEventListener('load', revealImage, { once: true });
        }

        // If the file does not exist, remove the empty card.
        image.addEventListener('error', () => {
            card.remove();
        }, { once: true });
    }



    const suggestionQuestions = [
        "mention some of pranav's skills",
        "schedule a meet with pranav",
        "Tell me about Pranav",
        "Tell me pranav hobbies",
        "What technologies does Pranav use?",
        "say hello",
        "What is Pranav working on?",
        "Can you show me Pranav's resume?",
        "How can I reach to Pranav?",
        "How is pranav as a person?",
        "Tell me about Pranav's projects",
        "Show me a picture of pranav with his dog"
    ];

    let recentlyUsedSuggestions = [];
    const MAX_RECENT_SUGGESTIONS = 3;

    // Total messages allowed per session (mirrors the backend's
    // MAX_MESSAGES_PER_SESSION) and the point after which pills stop
    // showing — by then the visitor already knows what the twin can do.
    const MAX_MESSAGES_PER_SESSION = 20;
    const SUGGESTIONS_HIDE_AFTER_MESSAGES = 10;
    let suggestionsRotationInterval = null;

    function hideSuggestionPills() {
        const wrap = document.querySelector('.chat-suggestions-wrap');
        if (wrap) wrap.style.display = 'none';

        if (suggestionsRotationInterval !== null) {
            clearInterval(suggestionsRotationInterval);
            suggestionsRotationInterval = null;
        }
    }


    function updateSuggestionScrollHint() {
        const container = document.getElementById('chatSuggestions');
        if (!container) return;

        const reachedEnd =
            container.scrollLeft + container.clientWidth >=
            container.scrollWidth - 2;

        const reachedStart = container.scrollLeft <= 2;

        container.parentElement.classList.toggle('scrolled-end', reachedEnd);
        container.parentElement.classList.toggle('scrolled-start', !reachedStart);
    }

    function renderSuggestions() {
        const container = document.getElementById('chatSuggestions');
        if (!container) return;

        const shuffled = suggestionQuestions
            .filter(question => !recentlyUsedSuggestions.includes(question))
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

        container.innerHTML = shuffled.map(question => `
            <button class="chat-suggestion" type="button">
                ✧ ${question}
            </button>
        `).join('');

        container.querySelectorAll('.chat-suggestion').forEach(button => {
            button.addEventListener('click', () => {
                if (rateLimited) return;

                const question = button.textContent.replace('✧ ', '').trim();
                const start = button.getBoundingClientRect();

                // Create the REAL bubble now, invisibly, so it takes its actual
                // place in the layout (pushing other messages up, wrapping text,
                // etc.) — then we measure exactly where it landed.
                const userBubble = appendMessage('user', question, false, true);
                const end = userBubble.getBoundingClientRect();

                const flyingBubble = button.cloneNode(true);

                flyingBubble.style.position = 'fixed';
                flyingBubble.style.left = `${start.left}px`;
                flyingBubble.style.top = `${start.top}px`;
                flyingBubble.style.width = `${start.width}px`;
                flyingBubble.style.zIndex = '9999';
                flyingBubble.style.margin = '0';
                flyingBubble.style.pointerEvents = 'none';
                flyingBubble.style.animation = 'none';

                document.body.appendChild(flyingBubble);
                button.style.visibility = 'hidden';

                requestAnimationFrame(() => {
                    flyingBubble.style.transition =
                        'left 0.55s cubic-bezier(0.4, 0, 0.2, 1), ' +
                        'top 0.55s cubic-bezier(0.4, 0, 0.2, 1), ' +
                        'width 0.55s cubic-bezier(0.4, 0, 0.2, 1), ' +
                        'border-radius 0.55s cubic-bezier(0.4, 0, 0.2, 1), ' +
                        'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)';

                    // Fly to the REAL bubble's exact rect, matching its final size too.
                    flyingBubble.style.left = `${end.left}px`;
                    flyingBubble.style.top = `${end.top}px`;
                    flyingBubble.style.width = `${end.width}px`;
                    flyingBubble.style.transform = 'scale(1)';
                });

                setTimeout(() => {
                    flyingBubble.remove();

                    // Reveal the real bubble now that the clone has "become" it.
                    userBubble.style.opacity = '';
                    userBubble.style.pointerEvents = '';

                    lookAtElement(userBubble);

                    recentlyUsedSuggestions.push(question);

                    if (recentlyUsedSuggestions.length > MAX_RECENT_SUGGESTIONS) {
                        recentlyUsedSuggestions.shift();
                    }

                    const existingQuestions = Array.from(
                        container.querySelectorAll('.chat-suggestion')
                    )
                        .filter(existingButton => existingButton !== button)
                        .map(existingButton =>
                            existingButton.textContent.replace('✧ ', '').trim()
                        );

                    const availableQuestions = suggestionQuestions.filter(
                        suggestion =>
                            suggestion !== question &&
                            !existingQuestions.includes(suggestion)
                    );

                    const newQuestion =
                        availableQuestions[
                            Math.floor(Math.random() * availableQuestions.length)
                        ];

                    button.textContent = `✧ ${newQuestion}`;
                    button.style.visibility = '';

                    // Enqueue the already-created bubble directly, instead of
                    // going through sendMessage() (which would create a second one).
                    pendingQueue.push({
                        text: question,
                        userBubble,
                        showQuote: isSending || pendingQueue.length > 0
                    });

                    processQueue();
                }, 550);
            });
        });
        requestAnimationFrame(updateSuggestionScrollHint);

    }


    function createCalendarUrl(
        date,
        time,
        duration = 30,
        title = 'Meeting with Pranav Kohli'
    ) {
        const start = new Date(`${date}T${time}:00`);
        if (Number.isNaN(start.getTime())) return null;

        const end = new Date(
            start.getTime() + duration * 60 * 1000
        );

        const formatCalendarDate = (d) => {
            const pad = (n) => String(n).padStart(2, '0');

            return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
        };

        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: title,
            dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
            details: 'Meeting with Pranav Kohli',
            add: 'hey@pranavkohli.me'
        });

        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    function addCalendarPreview(bubble, text) {
        const match = text.match(
            /\[CALENDAR_EVENT\]([\s\S]*?)\[\/CALENDAR_EVENT\]/i
        );

        if (!match) return;

        const block = match[1];

        let date =
            block.match(
                /\bdate\s*=\s*(\d{4}-\d{2}-\d{2})/i
            )?.[1];

        const time =
            block.match(
                /\btime\s*=\s*(\d{2}:\d{2})/i
            )?.[1];

        const duration = parseInt(
            block.match(/\bduration\s*=\s*(\d+)/i)?.[1] || '30',
            10
        );

        if (!date || !time) return;


        // ---------------------------------------------
        // FRONTEND DATE SAFETY
        // Ignore the year generated by the AI.
        // Always use the current year in Asia/Kolkata.
        // ---------------------------------------------

        const [, month, day] = date.split('-').map(Number);

        const currentYear = Number(
            new Intl.DateTimeFormat('en-IN', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric'
            }).format(new Date())
        );

        // Rebuild the date using the actual current year.
        date =
            `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;


        const calendarUrl = createCalendarUrl(date, time, duration);

        if (!calendarUrl) return;

        // Safety net: never render an invite for a time that's already
        // passed, even if something upstream slips through.
        const meetingStart = new Date(`${date}T${time}:00`);
        if (!Number.isNaN(meetingStart.getTime()) && meetingStart.getTime() < Date.now()) {
            console.warn('Refused to render a past-dated calendar invite:', date, time);
            return;
        }

        const card = document.createElement('a');

        card.href = calendarUrl;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.className = 'link-preview';

        card.innerHTML = `
            <img
                src="/src/images/calendar_preview.png"
                alt=""
                class="link-preview-image"
            >

            <div class="link-preview-content">

                <div class="link-preview-title">
                    Schedule a meet with Pranav
                </div>

                <div class="link-preview-description">
                    Add meeting to calendar
                </div>

                <div class="link-preview-domain">
                    calendar.google.com
                </div>

            </div>
        `;

        bubble.appendChild(card);

        const previewImage =
            card.querySelector('.link-preview-image');

        if (previewImage) {

            if (previewImage.complete) {

                previewImage.classList.add('loaded');

            } else {

                previewImage.addEventListener('load', () => {
                    previewImage.classList.add('loaded');
                });

            }

        }
    }

    function addLinkPreviews(bubble, text) {
        addCalendarPreview(bubble, text);

        const urls = text.match(
            /https?:\/\/[^\s]+|linkedin\.com\/in\/pranavkohli24|github\.com\/pranavkohli24|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/gi
        ) || [];

        const normalizedUrls = urls.map(url => {
            url = url.replace(/[),.!?]+$/, '');

            if (url.includes('@')) {
                return url;
            }

            return url.startsWith('http')
                ? url
                : `https://${url}`;
        });

        const previews = [
            {
                match: 'https://github.com/PranavKohli24',
                title: 'GitHub',
                description: 'PranavKohli24',
                image: '/src/images/github_preview.png',
                domain: 'github.com'
            },
            {
                match: 'https://linkedin.com/in/pranavkohli24',
                title: 'LinkedIn',
                description: 'Pranav Kohli',
                image: '/src/images/linkedin_preview.png',
                domain: 'linkedin.com'
            },
            {
                match: 'https://drive.google.com/file/d/1sRL-trbYmkjwWxeYPqwt3ZFYAyQ6vScG/view?usp=drive_link',
                title: 'Pranav Kohli - Resume',
                description: 'View my resume',
                image: '/src/images/resume_preview.png',
                domain: 'drive.google.com'
            },
            {
                match: 'hey@pranavkohli.me',
                title: 'Email Pranav',
                description: 'Tap to send mail',
                image: `/src/images/mail_preview${Math.floor(Math.random() * 2) + 1}.png`,
                domain: 'hey@pranavkohli.me'
            },
            {
                match: 'https://www.geeksforgeeks.org/profile/pranavkohli',
                title: 'GeeksforGeeks',
                description: 'Tap to view my DSA profile',
                image: '/src/images/geeksforgeeks.png',
                domain: 'geeksforgeeks.org'
            },
            {
                match: 'https://codeforces.com/profile/pranavkohli',
                title: 'Codeforces',
                description: 'Tap to view my Competitive Programming profile',
                image: '/src/images/codeforces.jpeg',
                domain: 'codeforces.com'
            },
            {
                match: 'https://sipbypranav.vercel.app/',
                title: 'Sip with Pranav',
                description: 'Tap to view my mocktail shop app',
                image: '/src/images/velvetpour.png',
                domain: ''
            },
            {
                match: 'https://rasoi-bazaar.vercel.app/',
                title: 'Rasoi Bazaar',
                description: 'Tap to cook a new dish today',
                image: '/src/images/rasoibazaar.png',
                domain: ''
            },
            {
                match: 'https://www.facebook.com/codingcompetitions/hacker-cup/2025/certificate/2967516210101538',
                title: 'Meta HackerCup',
                description: 'AIR - 331, Global Rank - 1457',
                image: '/src/images/meta_hackercup.png',
                domain: ''
            },
            
        ];

        previews.forEach(preview => {
            if (!normalizedUrls.some(
                url => url.toLowerCase() === preview.match.toLowerCase()
            )) return;

            const card = document.createElement('a');

            if (preview.match.includes('@')) {
                card.href = `mailto:${preview.match}?subject=${encodeURIComponent('Hello Pranav Kohli')}`;
            } else {
                card.href = preview.match;
                card.target = '_blank';
                card.rel = 'noopener noreferrer';
            }

            card.className = 'link-preview';

            card.innerHTML = `
                <img
                    src="${preview.image}"
                    alt=""
                    class="link-preview-image"
                >
                <div class="link-preview-content">
                    <div class="link-preview-title">${preview.title}</div>
                    <div class="link-preview-description">${preview.description}</div>
                    <div class="link-preview-domain">${preview.domain}</div>
                </div>
            `;

            bubble.appendChild(card);

            const previewImage = card.querySelector('.link-preview-image');

            previewImage.addEventListener('load', () => {
                previewImage.classList.add('loaded');
            });
        });
    }

    function cleanAIFormatting(text) {
        return text
            .replace(/\*\*/g, '')
            .replace(/--/g, '-')
            .replace(/—/g, '-')
            .replace(/–/g, '-');
    }

    function getVisibleResponseText(text) {
        // Remove complete SHOW_* command blocks.
        let visible = text.replace(
            /\[SHOW_[A-Z_]+\][\s\S]*?\[\/SHOW_[A-Z_]+\]/gi,
            ''
        );

        // Remove complete calendar command blocks.
        visible = visible.replace(
            /\[CALENDAR_EVENT\][\s\S]*?\[\/CALENDAR_EVENT\]/gi,
            ''
        );
        visible = visible.replace(
            /\[REACTION\][\s\S]*?\[\/REACTION\]/gi,
            ''
        );
        visible = visible.replace(
            /\[voice\][\s\S]*?\[\/voice\]/gi,
            ''
        );

        // If a complete internal command has started but has no closing tag yet,
        // hide everything from that command onward.
        const openCommandIndex = visible.search(
            /\[(?:SHOW_[A-Z_]+|CALENDAR_EVENT|REACTION|voice)\]/i
        );

        if (openCommandIndex !== -1) {
            visible = visible.slice(0, openCommandIndex);
        }

        // Hide partially streamed commands such as:
        // [S
        // [SH
        // [SHOW_
        // [CAL
        // [CALENDAR_E
        const internalStarts = [
            '[SHOW_',
            '[CALENDAR_EVENT]',
            '[REACTION]',
            '[voice]'
        ];

        for (const marker of internalStarts) {
            for (let i = marker.length - 1; i >= 1; i--) {
                const suffix = visible.slice(-i);

                if (
                    suffix.toLowerCase() ===
                    marker.slice(0, i).toLowerCase()
                ) {
                    visible = visible.slice(0, -i);
                    break;
                }
            }
        }

        return cleanAIFormatting(visible).trimEnd();
    }


    const MAX_BUBBLES = 3;
    const BUBBLE_PAUSE_MS = 450; // pause between bubbles — mimics sending separate texts
    const SPLIT_LENGTH_CEILING = 280;

    async function streamMultiBubbleReply(res, replyQuoteText) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const TYPE_SPEED_MS = 30;

        let sseBuffer = '';
        let fullText = '';
        let networkDone = false;
        let networkError = null;
        let reactionResponse = false;
        let voiceDetected = false;

        // Memoization cache for getVisibleResponseText — fullText only ever
        // grows during a stream, so "same length" reliably means "same content".
        // Reset per call since these are local to this function invocation.
        let visibleTextCacheLen = -1;
        let visibleTextCacheValue = '';

        function getVisibleResponseTextCached(text) {
            if (visibleTextCacheLen === text.length) {
                return visibleTextCacheValue;
            }
            const value = getVisibleResponseText(text);
            visibleTextCacheLen = text.length;
            visibleTextCacheValue = value;
            return value;
        }

        let idleTimer;

        function resetIdleTimer() {
            clearTimeout(idleTimer);

            idleTimer = setTimeout(() => {
                networkError = new Error('STREAM_IDLE_TIMEOUT');

                try {
                    activeChatAbortController?.abort();
                } catch {}

                try {
                    reader.cancel('stream idle timeout');
                } catch {}
            }, STREAM_IDLE_TIMEOUT_MS);
        }

        resetIdleTimer();

        const networkTask = (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    // Any actual network data means the stream is alive.
                    resetIdleTimer();

                    sseBuffer += decoder.decode(value, { stream: true });
                    const lines = sseBuffer.split('\n');
                    sseBuffer = lines.pop();

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) continue;

                        const jsonStr = trimmed.slice(5).trim();
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(jsonStr);
                            if (parsed.response) {
                                fullText += parsed.response;

                                if (!reactionResponse && /^\s*\[REACTION\]/i.test(fullText)) {
                                    reactionResponse = true;
                                }

                                if (!voiceDetected && /\[voice\]/i.test(fullText)) {
                                    voiceDetected = true;
                                }
                            }
                        } catch (e) {
                            // Ignore incomplete SSE chunks.
                        }
                    }
                }
            } catch (err) {

                if (!networkError) {
                    networkError = err;
                }
            } finally {
                clearTimeout(idleTimer);
                networkDone = true;   // NEW — always flips, success or failure
            }
        })();

        let bubbles = [];
        let consumedRaw = 0;
        let revealedInSeg = 0;

        function newBubble(withQuote) {
            const bubble = appendEmptyBotBubble(withQuote ? replyQuoteText : null);
            bubble.classList.add('chat-msg-pending');

            digitalTwinReadLineTop = null;   // new bubble = fresh start on the left

            const entry = {
                bubble,
                p: bubble.querySelector('p'),
                cursor: bubble.querySelector('.stream-cursor')
            };
            bubbles.push(entry);
            return entry;
        }

        let current = newBubble(true);

        while (true) {
            if (voiceDetected && current.cursor) {
                const indicator = document.createElement('span');
                indicator.className = 'voice-preparing';
                indicator.textContent = 'speaking...';
                current.cursor.replaceWith(indicator);
                current.cursor = null;
            }

            const visibleTarget = getVisibleResponseTextCached(fullText);
            const remaining = visibleTarget.slice(consumedRaw);

            if (networkDone && revealedInSeg >= remaining.length) break;

            if (revealedInSeg < remaining.length) {
                if (fastForwardStream || reactionResponse) {
                    revealedInSeg = remaining.length;
                    fastForwardStream = false;
                } else {
                    revealedInSeg++;
                }
                const segment = remaining.slice(0, revealedInSeg);
                const boundary = segment.match(/^([\s\S]*?)\n\n+([\s\S]*)$/);

                if (
                    boundary &&
                    bubbles.length < MAX_BUBBLES &&
                    boundary[1].trim().length > 0 &&
                    visibleTarget.length < SPLIT_LENGTH_CEILING
                ) {
                    const wasFollowing = wasFollowingBottom();
                    renderLinkedText(current.p, boundary[1].trim(), null);
                    if (current.cursor) current.cursor.remove();
                    applyScrollFollow(wasFollowing);

                    consumedRaw += boundary[1].length + (segment.length - boundary[1].length - boundary[2].length);
                    revealedInSeg = 0;

                    await delay(BUBBLE_PAUSE_MS);
                    setTyping(true);
                    await delay(300);
                    setTyping(false);

                    current = newBubble(false);
                    continue;
                }

                const wasFollowing = wasFollowingBottom();
                renderLinkedText(current.p, segment, current.cursor);
                applyScrollFollow(wasFollowing);

                followReadingGaze(current.bubble, current.cursor);
            }

            await delay(TYPE_SPEED_MS);
        }

        await networkTask;

        if (networkError) {
            const hasContent = current.p && current.p.textContent.trim().length > 0;
            if (!hasContent) {
                current.bubble.remove();
            } else if (current.cursor) {
                current.cursor.remove();
            }
            throw networkError;
        }

        // Fallback only: normally the loop above already swapped the
        // cursor the instant [voice] was detected. This only fires if
        // the entire response streamed in within a single tick, before
        // the loop got a chance to check voiceDetected.
        if (current.cursor) {
            if (voiceDetected) {
                const indicator = document.createElement('span');
                indicator.className = 'voice-preparing';
                indicator.textContent = 'speaking...';
                current.cursor.replaceWith(indicator);
                current.cursor = null;
            } else {
                current.cursor.remove();
                current.cursor = null;
            }
        }

        // Final render pass: now that streaming is fully done, re-render this
        // bubble's text with cursor=null so any links get their copy buttons.
        if (current.p && !voiceDetected) {
            const visibleTarget = getVisibleResponseTextCached(fullText);
            const finalRemaining = visibleTarget.slice(consumedRaw);
            renderLinkedText(current.p, finalRemaining, null);
        }

        bubbles.forEach(entry => entry.bubble.classList.remove('chat-msg-pending'));

        return {
            fullText,
            lastBubble: current.bubble,
            cursor: current.cursor
        };
    }

    let sharedAudioCtx = null;

    function playMessageSentSound() {
        try {
            if (!sharedAudioCtx) {
                sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Browsers auto-suspend contexts sometimes (tab backgrounded, etc.)
            if (sharedAudioCtx.state === 'suspended') {
                sharedAudioCtx.resume();
            }

            const ctx = sharedAudioCtx;
            const now = ctx.currentTime;

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(600, now);
            oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.12);

            // tiny attack ramp (0 → 0.6) avoids the "click" pop at start
            gainNode.gain.setValueAtTime(0.0001, now);
            gainNode.gain.exponentialRampToValueAtTime(0.6, now + 0.008);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

            oscillator.start(now);
            oscillator.stop(now + 0.15);

            // cleanup — don't let dead oscillators pile up
            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
            };

        } catch (e) {
            // silence if audio ctx fails
        }
    }

    /* =========================================================
       Sending: enqueue immediately, process one at a time
       ========================================================= */

    // Entry point — called on Enter / send click / voice send.
    // Always shows the user's message right away and never blocks typing.
    // If the AI is mid-reply, this just adds to the queue and returns.
    function sendMessage() {
        const text = chatInput.value.trim();

        if (!text || rateLimited) return;

        // Close out any active voice recording state.
        if (isListening) {
            userRequestedStop = true;
            isListening = false;
            discardSpeechResults = true;

            try {
                recognition.abort();
            } catch (error) {
                console.warn(
                    'Could not stop speech recognition:',
                    error
                );
            }
        }

        setRecordingUI(false);
        chatSendBtn.classList.remove('listening');

        const inputRect = chatInput.getBoundingClientRect();

        // Create the REAL bubble now, invisibly, so it takes its actual
        // place in the layout — then measure exactly where it landed.
        const userBubble = appendMessage('user', text, false, true);
        const end = userBubble.getBoundingClientRect();

        chatInput.value = '';
        updateActionButton();
        autoResizeInput();

        // Clone the REAL bubble — same size, same shape, same text, right
        // from the start. No resizing or morphing, just a straight move.
        const flyingBubble = userBubble.cloneNode(true);

        // The clone inherited the invisible bubble's opacity:0 — make it
        // fully visible, since THIS is the element that should be seen
        // flying, not the real (still-hidden) bubble underneath.
        flyingBubble.style.opacity = '1';
        flyingBubble.style.pointerEvents = 'none';
        flyingBubble.style.position = 'fixed';
        flyingBubble.style.margin = '0';
        flyingBubble.style.zIndex = '9999';

        // Place it at its FINAL position/size right away...
        flyingBubble.style.left = `${end.left}px`;
        flyingBubble.style.top = `${end.top}px`;
        flyingBubble.style.width = `${end.width}px`;

        document.body.appendChild(flyingBubble);
        playMessageSentSound();

        // ...then visually pull it back to the input field's center using
        // a transform. Transforms always animate reliably (GPU-composited),
        // unlike left/top which can silently skip the transition.
        const endCenterX = end.left + end.width / 2;
        const endCenterY = end.top + end.height / 2;
        const startCenterX = inputRect.left + inputRect.width / 2;
        const startCenterY = inputRect.top + inputRect.height / 2;

        const dx = startCenterX - endCenterX;
        const dy = startCenterY - endCenterY;

        flyingBubble.style.transform = `translate(${dx}px, ${dy}px)`;

        // Force the browser to commit that starting transform as its own
        // paint before we animate away from it.
        void flyingBubble.getBoundingClientRect();

        requestAnimationFrame(() => {
            flyingBubble.style.transition =
                'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)';
            flyingBubble.style.transform = 'translate(0, 0)';
        });

        setTimeout(() => {
            flyingBubble.remove();

            userBubble.style.opacity = '';
            userBubble.style.pointerEvents = '';

            // Glance at your message once it lands, like he just read it
            lookAtElement(userBubble);
        }, 550);

        pendingQueue.push({
            text,
            userBubble,
            showQuote: isSending || pendingQueue.length > 0
        });

        processQueue();
    }

    function showShareChatCard() {
        if (chatMessages.querySelector('.chat-share-card')) return;
        const card = document.createElement('div');
        card.className = 'chat-share-card';

        card.innerHTML = `
            <img
                src="/src/images/twin_bye_image.png"
                alt=""
                class="chat-share-image"
            >

            <div class="chat-share-content">
                <div class="chat-share-title">
                    Share this conversation
                </div>

                <div class="chat-share-description">
                    Keep or share this chat with someone.
                </div>

                <button
                    type="button"
                    class="chat-share-btn"
                    id="chatShareBtn"
                >
                    <span>↗</span>
                    Share Chat
                </button>

                <a
                    href="mailto:hey@pranavkohli.me"
                    class="chat-email-btn"
                >
                    Email Pranav
                </a>
            </div>
        `;

        chatMessages.appendChild(card);

        card.querySelector('#chatShareBtn').addEventListener('click', async () => {
            const text = history
                .map(message =>
                    `${message.role === 'user' ? 'You' : 'Pranav'}: ${message.content}`
                )
                .join('\n\n');

            try {
                if (navigator.share) {
                    await navigator.share({
                        title: "Conversation with Pranav's Digital Twin",
                        text
                    });
                } else {
                    await navigator.clipboard.writeText(text);
                    card.querySelector('.chat-share-btn').innerHTML =
                        '<span>✓</span> Copied';
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.warn('Could not share chat:', error);
                }
            }
        });

        requestAnimationFrame(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }


    // Works through pendingQueue strictly one message at a time.
    // Safe to call repeatedly — it's a no-op if already processing
    // or if the queue is empty.
    async function processQueue() {
        if (isSending) return;
        if (pendingQueue.length === 0) return;
        if (rateLimited) {
            pendingQueue = [];
            return;
        }

        const item = pendingQueue.shift();
        const { text, userBubble, showQuote } = item;

        // NOTE: user's message is no longer pushed into `history` here.
        // It only gets committed once we know a real response is coming back —
        // see the push right after we confirm res.ok && res.body below.

        isSending = true;
        setTyping(true);

        try {
            activeChatAbortController = new AbortController();

            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId,
                    // Send history + this new turn WITHOUT mutating `history` yet.
                    messages: [...history, { role: 'user', content: text }]
                }),
                signal: activeChatAbortController.signal
            });

            if (res.status === 429) {
                const data = await res.json();

                setTyping(false);

                chatRemaining.textContent = '';

                const limitBubble = appendMessage(
                    'error',
                    data.message ||
                    "Oops, you've reached the message limit for this conversation! But hey, you can talk to the real Pranav instead of his AI version 😄 Reach him at hey@pranavkohli.me or give him a call at +918860271737",
                    true
                );

                limitBubble.classList.add('chat-limit-bubble');

                rateLimited = true;
                chatInput.disabled = true;
                chatSendBtn.disabled = true;
                pendingQueue = [];

                document.querySelector('.chat-suggestions-wrap')?.style.setProperty('display', 'none');

                showShareChatCard();

                return;
            }

            if (!res.ok || !res.body) {
                setTyping(false);

                appendMessage(
                    'error',
                    "Ouch, something went wrong on my end :( Pranav is looking into it and fixing it. Grab a coffee and try again in a moment!"
                );

                return;
            }

            setTyping(false);

            const { fullText, lastBubble, cursor } =
                await streamMultiBubbleReply(res, showQuote ? text : null);

            // Done reading: eyes come back to center

            setDigitalTwinEyeOffset(digitalTwinLeftEye, 0, 0);
            setDigitalTwinEyeOffset(digitalTwinRightEye, 0, 0);
            setDigitalTwinEyeOffset(digitalTwinLeftPupilCore, 0, 0);
            setDigitalTwinEyeOffset(digitalTwinRightPupilCore, 0, 0);
            setDigitalTwinEyeOffset(digitalTwinLeftHighlight, 0, 0);
            setDigitalTwinEyeOffset(digitalTwinRightHighlight, 0, 0);
            digitalTwinLastGaze = { x: 0, y: 0 };

            const remaining =
                res.headers.get('X-Messages-Remaining');

            if (remaining !== null) {
                const n = parseInt(remaining, 10);
                const messagesUsed = MAX_MESSAGES_PER_SESSION - n;

                // Stay silent for most of the conversation — a live
                // countdown from message 1 reads as scarcity pressure.
                // Only surface it once the pills also disappear, so the
                // UI shifts from "onboarding mode" to "normal chat mode"
                // as a single, coherent change instead of two.
                chatRemaining.textContent =
                    messagesUsed >= SUGGESTIONS_HIDE_AFTER_MESSAGES
                        ? (
                            n > 0
                                ? `${n} messages left in this conversation`
                                : "That's the last message for this conversation."
                        )
                        : '';

                if (messagesUsed >= SUGGESTIONS_HIDE_AFTER_MESSAGES) {
                    hideSuggestionPills();
                }
            }

            const reaction = parseReaction(fullText);
            const visibleText = getVisibleResponseText(fullText);

            const voiceText = parseVoice(fullText);

            if (voiceText) {
                const speakingIndicator = lastBubble.querySelector('.voice-preparing');

                try {
                    const resolvedVoiceText = await generateVoiceNoteAudio(voiceText);
                    const voiceNote = addVoiceNoteToBubble(lastBubble, resolvedVoiceText);

                    if (speakingIndicator) {
                        speakingIndicator.remove();
                    }

                    if (!voiceNote) {
                        const p = lastBubble.querySelector('p');
                        if (p) {
                            p.textContent = resolvedVoiceText;
                        } else {
                            const fallbackP = document.createElement('p');
                            fallbackP.textContent = resolvedVoiceText;
                            lastBubble.appendChild(fallbackP);
                        }
                    }
                } catch (error) {
                    console.error('Voice note generation failed:', error);

                    if (speakingIndicator) {
                        speakingIndicator.remove();
                    }

                    const p = lastBubble.querySelector('p');
                    if (p) {
                        p.textContent = voiceText;
                    } else {
                        const fallbackP = document.createElement('p');
                        fallbackP.textContent = voiceText;
                        lastBubble.appendChild(fallbackP);
                    }
                }
            }

            const photoIdMatch = fullText.match(/\[SHOW_PHOTO\]\s*id\s*=\s*([a-z0-9-]+)\s*\[\/SHOW_PHOTO\]/i);
            const requestedInvalidPhoto = !!(photoIdMatch && !digitalTwinPhotos[photoIdMatch[1].toLowerCase()]);
            const hasPhotoCommand = !!(photoIdMatch && digitalTwinPhotos[photoIdMatch[1].toLowerCase()]);
            const hasCalendarCommand = /\[CALENDAR_EVENT\][\s\S]*?\[\/CALENDAR_EVENT\]/i.test(fullText);

            
            if (reaction) {
                // Always stick the reaction onto the user's own message.
                addReactionToBubble(userBubble, reaction);

                // If there's real content beyond the reaction (text, a
                // photo, a calendar invite, or a voice note), keep the bot
                // bubble too — reaction + reply together, like a person
                // reacting AND texting back. Only drop the bubble if the
                // reaction really was the entire response.
                const hasOtherContent =
                    visibleText.trim() ||
                    hasPhotoCommand ||
                    hasCalendarCommand ||
                    voiceText;

                if (hasOtherContent) {
                    if (!voiceText) {
                        addLinkPreviews(lastBubble, fullText);
                        addPhotoPreview(lastBubble, fullText);
                    }
                } else {
                    lastBubble.remove();
                }
            }  else if (requestedInvalidPhoto && !visibleText.trim()) {
                const p = lastBubble.querySelector('p');
                if (p) p.textContent = "hmm, don't think I have that one saved, ask for something else 🙂";
            } else if (
                !visibleText.trim() &&
                !hasPhotoCommand &&
                !hasCalendarCommand &&
                !voiceText
            ) {
                lastBubble.remove();
                addReactionToBubble(userBubble, '👀');
            } else {
                if (!voiceText) {
                    addLinkPreviews(lastBubble, fullText);
                    addPhotoPreview(lastBubble, fullText);
                }
            }

            history.push({
                role: 'user',
                content: text
            });

            history.push({
                role: 'assistant',
                content: fullText
                    .replace(/\[SHOW_PHOTO\]\s*id\s*=\s*([a-z0-9-]+)\s*\[\/SHOW_PHOTO\]/gi, (match, id) => {
                        const photo = digitalTwinPhotos[id.toLowerCase()];
                        return photo ? `i shared a photo of: ${photo.title}` : '';
                    })
                    .replace(/\[voice\]([\s\S]*?)\[\/voice\]/gi, (match, spoken) => {
                        return spoken.replace(/\s+/g, ' ').trim();
                        // return cleaned ? `i said in a voice note: "${cleaned}"` : '';
                    })
                    .replace(/\[CALENDAR_EVENT\][\s\S]*?\[\/CALENDAR_EVENT\]/gi, '')
                    .replace(/\[REACTION\]([\s\S]*?)\[\/REACTION\]/gi, (match, emoji) => {
                        return emoji.trim();
                        // return cleaned ? `i reacted with ${cleaned}` : '';
                    })
                    .trim()
            });

        } catch (err) {
            setTyping(false);

            document
            .querySelectorAll('.chat-msg-bot.chat-msg-pending')
            .forEach(bubble => bubble.remove());

            if (err?.message === 'STREAM_IDLE_TIMEOUT') {
                appendMessage(
                    'error',
                    "Looks like Pranav is sleeping right now !  please try again in a bit or mail him at: hey@pranavkohli.me"
                );
            } else if (err?.name === 'AbortError') {
                // Ignore intentional aborts.
            } else {
                appendMessage(
                    'error',
                    "Oops, looks like I couldn't reach Pranav! My bad :( In the meantime, please check your internet connection and try again or reach him at mail: hey@pranavkohli.me"
                );
            }
            // No history.push happened for this turn in any failure case,
            // so there's nothing to clean up — the failed message never
            // entered the conversation record.

        } finally {
            isSending = false;
            activeChatAbortController = null;

            if (!rateLimited && document.activeElement !== chatInput) {
                focusInputWithoutKeyboard();
            }

            if (pendingQueue.length > 0 && !rateLimited) {
                processQueue();
            }
        }
    }

    // Distance (in screen pixels) at which the pupil reaches full movement.
// Closer taps = smaller movement. Farther taps = bigger movement.
const DIGITAL_TWIN_EYE_FALLOFF_PX = 260;

// The highlight reaches its max movement MUCH sooner than the iris does.
// A near tap already pushes it to the edge; only a far tap pushes the iris that far.
const DIGITAL_TWIN_HIGHLIGHT_FALLOFF_PX = 25;   // saturates fast, even for close taps
const DIGITAL_TWIN_HIGHLIGHT_MAX_MOVE_X = 12;   // now a real, visible swing
const DIGITAL_TWIN_HIGHLIGHT_MAX_MOVE_Y = 8;

// Pupil (the black circle): moves a bit on its own, between the iris group's
// full movement and the highlight's fast, big swing.
const DIGITAL_TWIN_PUPIL_FALLOFF_PX = 90;
const DIGITAL_TWIN_PUPIL_MAX_MOVE_X = 6;
const DIGITAL_TWIN_PUPIL_MAX_MOVE_Y = 4;

function setDigitalTwinEyeOffset(eyeElement, x, y) {
    if (!eyeElement) return;
    eyeElement.style.transform = `translate(${x}px, ${y}px)`;
}

function updateDigitalTwinEyes(clientX, clientY) {
    if (
        !digitalTwinAvatar ||
        !digitalTwinLeftEye ||
        !digitalTwinRightEye
    ) {
        return;
    }

    const rect = digitalTwinAvatar.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Remember when the user last interacted, so idle wandering waits.
    digitalTwinLastInteraction = Date.now();


    const gaze = moveDigitalTwinEye(digitalTwinLeftEye, DIGITAL_TWIN_EYES.left, clientX, clientY, rect, digitalTwinLeftHighlight, digitalTwinLeftPupilCore);
    moveDigitalTwinEye(digitalTwinRightEye, DIGITAL_TWIN_EYES.right, clientX, clientY, rect, digitalTwinRightHighlight, digitalTwinRightPupilCore);

    // Big look = sometimes blink, like a real person shifting their gaze.
    const shift = Math.hypot(
        gaze.x - digitalTwinLastGaze.x,
        gaze.y - digitalTwinLastGaze.y
    );

    if (shift > DIGITAL_TWIN_MAX_EYE_MOVE_X * 0.8 && Math.random() < 0.4) {
        blinkDigitalTwin(false);
    }

    digitalTwinLastGaze = gaze;
}

function moveDigitalTwinEye(eyeElement, eyeCenter, clientX, clientY, rect, highlightElement, pupilElement) {
    const eyeScreenX = rect.left + eyeCenter.x * (rect.width / DIGITAL_TWIN_IMAGE_WIDTH);
    const eyeScreenY = rect.top + eyeCenter.y * (rect.height / DIGITAL_TWIN_IMAGE_HEIGHT);

    const dx = clientX - eyeScreenX;
    const dy = clientY - eyeScreenY;
    const distance = Math.hypot(dx, dy);

    if (distance === 0) {
        setDigitalTwinEyeOffset(eyeElement, 0, 0);
        if (highlightElement) setDigitalTwinEyeOffset(highlightElement, 0, 0);
        if (pupilElement) setDigitalTwinEyeOffset(pupilElement, 0, 0);
        return { x: 0, y: 0 };
    }

    // IRIS: needs a FAR tap to reach its max movement (unchanged from before).
    const strength = Math.min(distance / DIGITAL_TWIN_EYE_FALLOFF_PX, 1);
    const x = (dx / distance) * strength * DIGITAL_TWIN_MAX_EYE_MOVE_X;
    const y = (dy / distance) * strength * DIGITAL_TWIN_MAX_EYE_MOVE_Y;
    setDigitalTwinEyeOffset(eyeElement, x, y);

    // PUPIL (black circle): moves a bit extra on its own, reaching its max
    // sooner than the iris but not as fast as the highlight.
    if (pupilElement) {
        const pupilStrength = Math.min(distance / DIGITAL_TWIN_PUPIL_FALLOFF_PX, 1);
        const px = (dx / distance) * pupilStrength * DIGITAL_TWIN_PUPIL_MAX_MOVE_X;
        const py = (dy / distance) * pupilStrength * DIGITAL_TWIN_PUPIL_MAX_MOVE_Y;
        setDigitalTwinEyeOffset(pupilElement, px, py);
    }

    // HIGHLIGHT: reaches its max movement even for a NEAR tap, because its
    // own falloff distance is much smaller.
    if (highlightElement) {
        const highlightStrength = Math.min(distance / DIGITAL_TWIN_HIGHLIGHT_FALLOFF_PX, 1);
        const hx = (dx / distance) * highlightStrength * DIGITAL_TWIN_HIGHLIGHT_MAX_MOVE_X;
        const hy = (dy / distance) * highlightStrength * DIGITAL_TWIN_HIGHLIGHT_MAX_MOVE_Y;
        setDigitalTwinEyeOffset(highlightElement, hx, hy);
    }

    return { x, y };
}

// Make the twin look at a chat bubble, like he is reading it.
function lookAtElement(el) {
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;

    // Look near the start of the bubble, where reading begins.
    // Clamp to the screen so a far-away bubble never gives a wild angle.
    const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 80), 0), window.innerWidth);
    const y = Math.min(Math.max(r.top + 14, 0), window.innerHeight);

    updateDigitalTwinEyes(x, y);
}


// Eyes read along with the typing cursor:
// left edge = look left, right end of line = look right, new line = snap back left.
function followReadingGaze(bubble, cursor) {
    if (!bubble || !cursor || !cursor.isConnected) return;
    if (!digitalTwinAvatar || !digitalTwinLeftEye || !digitalTwinRightEye) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Throttle: no need to update on every 30ms typing tick
    const now = performance.now();
    if (now - digitalTwinReadLastUpdate < 80) return;
    digitalTwinReadLastUpdate = now;

    const avatarRect = digitalTwinAvatar.getBoundingClientRect();
    if (!avatarRect.width) return;   // section hidden

    const b = bubble.getBoundingClientRect();
    const c = cursor.getBoundingClientRect();
    if (!b.width) return;

    // New line? (cursor moved down by more than half a line)
    const lineOffset = c.top - b.top;   // relative to the bubble, so scrolling can't fool it

    const isNewLine =
        digitalTwinReadLineTop !== null &&
        lineOffset - digitalTwinReadLineTop > 8;

    if (digitalTwinReadLineTop === null || isNewLine) {
        digitalTwinReadLineTop = lineOffset;
    }

    // Use the bubble's MAX width as the "full line", not its current width.
    // Otherwise a short reply would always look "fully right".
    const maxLine = chatMessages.clientWidth * (window.innerWidth <= 768 ? 0.88 : 0.78) - 32;
    const progress = Math.min(Math.max((c.left - b.left - 16) / maxLine, 0), 1);

    // -0.8 (left) to +0.8 (right) of the horizontal range, slightly downward
    const x = (-0.8 + 1.6 * progress) * DIGITAL_TWIN_MAX_EYE_MOVE_X;
    const y = DIGITAL_TWIN_MAX_EYE_MOVE_Y * DIGITAL_TWIN_TYPING_LOOK_DOWN;

    setDigitalTwinEyeOffset(digitalTwinLeftEye, x, y);
    setDigitalTwinEyeOffset(digitalTwinRightEye, x, y);
    setDigitalTwinEyeOffset(digitalTwinLeftPupilCore, x * 0.4, y * 0.4);
    setDigitalTwinEyeOffset(digitalTwinRightPupilCore, x * 0.4, y * 0.4);
    setDigitalTwinEyeOffset(digitalTwinLeftHighlight, x * 0.25, y * 0.25);
    setDigitalTwinEyeOffset(digitalTwinRightHighlight, x * 0.25, y * 0.25);
    digitalTwinLastGaze = { x, y };
    digitalTwinLastInteraction = Date.now();

    // Small chance of a blink when the eyes jump back to the next line

    // Small chance of a blink when the eyes jump back to the next line
    if (isNewLine && Math.random() < 0.25) {
        blinkDigitalTwin(false);
    }
}

// ---------- Idle looking around ----------

function idleGlance() {
    if (document.hidden || !isDigitalTwinSectionActive()) return;

    // Stay focused on the reply while it is being written.
    if (isSending) return;

    // User was active recently, so don't wander.
    if (Date.now() - digitalTwinLastInteraction < DIGITAL_TWIN_IDLE_AFTER_MS) return;

    let x = 0;
    let y = 0;

    // 65% look somewhere small, 35% come back to center.
    if (Math.random() > 0.35) {
        x = (Math.random() * 2 - 1) * DIGITAL_TWIN_MAX_EYE_MOVE_X * 0.6;
        y = (Math.random() * 2 - 1) * DIGITAL_TWIN_MAX_EYE_MOVE_Y * 0.6;
    }

    setDigitalTwinEyeOffset(digitalTwinLeftEye, x, y);
    setDigitalTwinEyeOffset(digitalTwinRightEye, x, y);
    setDigitalTwinEyeOffset(digitalTwinLeftPupilCore, x * 0.4, y * 0.4);
    setDigitalTwinEyeOffset(digitalTwinRightPupilCore, x * 0.4, y * 0.4);
    setDigitalTwinEyeOffset(digitalTwinLeftHighlight, x * 0.25, y * 0.25);
    setDigitalTwinEyeOffset(digitalTwinRightHighlight, x * 0.25, y * 0.25);
    digitalTwinLastGaze = { x, y };
}

function scheduleIdleGlance() {
    // Random gap: 1.5 to 4 seconds
    const wait = 1500 + Math.random() * 2500;

    digitalTwinIdleTimer = setTimeout(() => {
        idleGlance();
        scheduleIdleGlance();
    }, wait);
}

function startDigitalTwinIdleLook() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!digitalTwinLeftEye || !digitalTwinRightEye) return;

    clearTimeout(digitalTwinIdleTimer);
    scheduleIdleGlance();
}

function blinkDigitalTwin(allowDoubleBlink = true) {
    if (!digitalTwinLids.length) return;
    if (document.hidden || !isDigitalTwinSectionActive()) return;

    digitalTwinLids.forEach(lid => {
        lid.classList.remove('blinking');
        void lid.getBoundingClientRect();   // restart the animation
        lid.classList.add('blinking');
    });

    // Sometimes blink twice, like a real person
    if (allowDoubleBlink && Math.random() < 0.2) {
        setTimeout(() => blinkDigitalTwin(false), 260);
    }
}

function scheduleNextBlink() {
    // Random gap: 2.5 to 6 seconds
    const wait = 2500 + Math.random() * 3500;

    digitalTwinBlinkTimer = setTimeout(() => {
        blinkDigitalTwin();
        scheduleNextBlink();
    }, wait);
}

function startDigitalTwinBlinking() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!digitalTwinLids.length) return;

    clearTimeout(digitalTwinBlinkTimer);
    scheduleNextBlink();
}

    function bindElements() {
        chatMessages =
            document.getElementById('chatMessages');

        if (!chatMessages) return false;

        chatInput =
            document.getElementById('chatInput');

        chatSendBtn =
            document.getElementById('chatSendBtn');

        chatTyping =
            document.getElementById('chatTyping');

        chatRemaining =
            document.getElementById('chatRemaining');

        chatScrollBottomBtn =
            document.getElementById('chatScrollBottomBtn');

        chatMicIcon =
            document.getElementById('chatMicIcon');

        chatSendIcon =
            document.getElementById('chatSendIcon');

        chatRecording =
            document.getElementById('chatRecording');

        chatVoiceControls =
            document.getElementById('chatVoiceControls');

        chatVoiceSendBtn =
            document.getElementById('chatVoiceSendBtn');

        chatVoiceStopBtn =
    document.getElementById('chatVoiceStopBtn');

chatInputRow =
    chatInput.closest('.chat-input-row');

// Digital Twin eyes
digitalTwinAvatar =
    document.getElementById('digitalTwinAvatar');

digitalTwinLeftEye =
    document.getElementById('digitalTwinLeftEye');

digitalTwinRightEye =
    document.getElementById('digitalTwinRightEye');

digitalTwinLeftHighlight =
    document.getElementById('digitalTwinLeftHighlight');

digitalTwinRightHighlight =
    document.getElementById('digitalTwinRightHighlight');

digitalTwinLeftPupilCore =
    document.getElementById('digitalTwinLeftPupilCore');

digitalTwinRightPupilCore =
    document.getElementById('digitalTwinRightPupilCore');

digitalTwinLids =
    Array.from(document.querySelectorAll('.digital-twin-lid'));


return true;
    }


    function attachListeners() {

        // 👀 Look toward wherever the user taps/clicks
    window.addEventListener(
        'pointerdown',
        (e) => {
            updateDigitalTwinEyes(
                e.clientX,
                e.clientY
            );
        },
        { passive: true }
    );

        chatSendBtn.addEventListener(
            'click',
            () => {
                if (rateLimited) return;

                if (chatInput.value.trim()) {
                    sendMessage();
                } else {
                    startVoiceRecording();
                }
            }
        );


        chatVoiceStopBtn.addEventListener(
            'click',
            () => {
                stopVoiceRecording();
            }
        );


        chatVoiceSendBtn.addEventListener(
            'click',
            () => {
                sendVoiceMessage();
            }
        );


        chatInput.addEventListener(
    'input',
    () => {
        /*
         * If the user deletes the interim transcript,
         * forget it.
         */
        if (
            isListening &&
            interimVoiceText &&
            !chatInput.value
                .trim()
                .endsWith(
                    interimVoiceText.trim()
                )
        ) {
            interimVoiceText = '';
        }

        updateActionButton();
        autoResizeInput();

        // 👀 Make the Digital Twin look toward the input
        if (chatInput.value.trim()) {
            const inputRect =
                chatInput.getBoundingClientRect();

            updateDigitalTwinEyes(
                inputRect.left +
                    inputRect.width / 2,

                inputRect.top +
                    inputRect.height / 2
            );
        }
    }
);


        chatInput.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();

                    if (
                        chatInput.value.trim()
                    ) {
                        sendMessage();
                    }
                }
            }
        );


        if (chatScrollBottomBtn) {
            chatMessages.addEventListener('scroll', () => {
                updateScrollButtonVisibility();
            });

            chatScrollBottomBtn.addEventListener('click', () => {
                chatMessages.scrollTo({
                    top: chatMessages.scrollHeight,
                    behavior: 'smooth'
                });
            });
        }
    }


    function init() {
        if (initialized) return;

        if (!bindElements()) return;

        observeDigitalTwinSection();

        sessionId = getOrCreateSessionId();

        primeVoiceCache();
        setupSpeechRecognition();
        watchMicPermission();
        attachListeners();
        attachReactionLongPress();

        // Close any open reaction picker on back/forward navigation — it's a
        // fixed overlay and won't clean itself up otherwise.
        window.addEventListener('popstate', closeReactionPicker);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                closeReactionPicker();
            } else if (isSending) {
                fastForwardStream = true;
            }
        });
        renderSuggestions();
        updateActionButton();
        startDigitalTwinBlinking();
        startDigitalTwinIdleLook();

        const suggestions = document.getElementById('chatSuggestions');

        if (suggestions) {
            suggestions.addEventListener(
                'scroll',
                updateSuggestionScrollHint,
                { passive: true }
            );

            // Container starts at 0 width while the section is hidden,
            // which makes the initial reachedEnd check wrongly say "true".
            // Recompute whenever its real size becomes available.
            if (window.ResizeObserver) {
                const suggestionsResizeObserver = new ResizeObserver(() => {
                    updateSuggestionScrollHint();
                });

                suggestionsResizeObserver.observe(suggestions);
            }
        }

        suggestionsRotationInterval = setInterval(() => {
            if (document.hidden || !isDigitalTwinSectionActive()) return;
            const suggestions = document.getElementById('chatSuggestions');

            suggestions.classList.add('changing');

            setTimeout(() => {
                renderSuggestions();
                suggestions.classList.remove('changing');
            }, 350);
        }, 15000);

        initialized = true;

    }


    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            init
        );
    } else {
        init();
    }

})();