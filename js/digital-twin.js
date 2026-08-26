/**
 * Digital Twin Chat Module
 * Talks to the Cloudflare Worker, which streams replies from Workers AI
 * token-by-token for a live typewriter effect.
 *
 * Voice input added on top of the original chat logic.
 * Input auto-grows up to 2 lines, then scrolls internally.
 */

(function() {
    'use strict';

    const WORKER_URL = 'https://pranav-digital-twin.pranavdigitaltwin.workers.dev';
    const SESSION_KEY = 'digitalTwinSessionId';

    let chatMessages, chatInput, chatSendBtn, chatTyping, chatRemaining, chatScrollBottomBtn;
    let chatMicIcon, chatSendIcon;
    let chatRecording, chatVoiceControls, chatVoiceSendBtn, chatVoiceStopBtn;

    let history = [];
    let sessionId = null;
    let isSending = false;
    let rateLimited = false;
    let initialized = false;

    // Voice state
    let recognition = null;
    let isListening = false;
    let userRequestedStop = false;
    let interimVoiceText = '';

    const NEAR_BOTTOM_PX = 40;

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
        let id = sessionStorage.getItem(SESSION_KEY);

        if (!id) {
            id = (crypto.randomUUID
                ? crypto.randomUUID()
                : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

            sessionStorage.setItem(SESSION_KEY, id);
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


    function appendMessage(role, text) {
        const wasFollowing = role === 'user' ? true : wasFollowingBottom();

        const bubble = document.createElement('div');

        bubble.className =
            role === 'user'
                ? 'chat-msg chat-msg-user'
                : role === 'error'
                    ? 'chat-msg chat-msg-error'
                    : 'chat-msg chat-msg-bot';

        const p = document.createElement('p');
        p.textContent = text;

        bubble.appendChild(p);
        chatMessages.appendChild(bubble);

        applyScrollFollow(wasFollowing);

        return bubble;
    }


    function appendEmptyBotBubble() {
        const wasFollowing = wasFollowingBottom();

        const bubble = document.createElement('div');
        bubble.className = 'chat-msg chat-msg-bot';

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


    function setRecordingUI(recording) {
        chatRecording.classList.toggle('active', recording);
        chatVoiceControls.classList.toggle('active', recording);

        chatInput.parentElement.classList.toggle(
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
            interimVoiceText = '';

            chatSendBtn.classList.add('listening');
            setRecordingUI(true);
        };


        recognition.onresult = (event) => {
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
            chatInput.value = currentText;
            autoResizeInput();
        };


        recognition.onerror = (event) => {
            console.warn(
                'Speech recognition error:',
                event.error
            );

            if (
                event.error === 'not-allowed' ||
                event.error === 'service-not-allowed' ||
                event.error === 'audio-capture'
            ) {
                isListening = false;
                userRequestedStop = true;

                chatSendBtn.classList.remove('listening');
                setRecordingUI(false);
                updateActionButton();
            }
        };


        recognition.onend = () => {
            /*
             * User explicitly stopped.
             */
            if (userRequestedStop) {
                isListening = false;
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


    function startVoiceRecording() {
        if (!recognition || isListening) return;

        userRequestedStop = false;
        interimVoiceText = '';

        try {
            recognition.start();
        } catch (error) {
            console.warn(
                'Could not start speech recognition:',
                error
            );
        }
    }


    function stopVoiceRecording() {
        if (!recognition || !isListening) return;

        userRequestedStop = true;
        isListening = false;
        interimVoiceText = '';

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

        if (!text || isSending || rateLimited) return;

        userRequestedStop = true;
        isListening = false;
        interimVoiceText = '';

        try {
            if (recognition) {
                recognition.stop();
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


    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }


    async function streamReply(res, bubble) {
        const p = bubble.querySelector('p');
        const cursor = bubble.querySelector('.stream-cursor');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        const TYPE_SPEED_MS = 32; // ms per character revealed — raise for slower, lower for faster

        let sseBuffer = '';
        let fullText = '';
        let networkDone = false;

        // Background task: pulls data off the network as fast as it arrives,
        // just accumulating it — doesn't touch the DOM directly.
        const networkTask = (async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

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
                        }
                    } catch (e) {
                        // Ignore incomplete SSE chunks.
                    }
                }
            }

            networkDone = true;
        })();

        // Foreground task: reveals one character at a steady pace, regardless
        // of how much text has already arrived from the network.
        let displayed = '';

        while (!(networkDone && displayed.length >= fullText.length)) {
            if (displayed.length < fullText.length) {
                const wasFollowing = wasFollowingBottom();

                displayed = fullText.slice(0, displayed.length + 1);
                p.textContent = displayed;

                if (cursor) {
                    p.appendChild(cursor);
                }

                applyScrollFollow(wasFollowing);
            }

            await delay(TYPE_SPEED_MS);
        }

        await networkTask;

        if (cursor) {
            cursor.remove();
        }

        return fullText;
    }


    async function sendMessage() {
        const text = chatInput.value.trim();

        if (!text || isSending || rateLimited) return;

        /*
         * Make sure voice state is closed.
         */
        if (isListening) {
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
        }

        setRecordingUI(false);
        chatSendBtn.classList.remove('listening');

        appendMessage('user', text);

        history.push({
            role: 'user',
            content: text
        });

        chatInput.value = '';
        updateActionButton();
        autoResizeInput();

        isSending = true;

        chatInput.disabled = true;
        chatSendBtn.disabled = true;

        setTyping(true);

        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId,
                    messages: history
                })
            });

            if (res.status === 429) {
                const data = await res.json();

                setTyping(false);

                appendMessage(
                    'error',
                    data.message ||
                    "oops, You've reached the message limit for this conversation. contact pranav for this!"
                );

                rateLimited = true;

                return;
            }

            if (!res.ok || !res.body) {
                setTyping(false);

                appendMessage(
                    'error',
                    "ouch, Something went wrong on my end - try again in a moment."
                );

                chatInput.disabled = false;
                chatSendBtn.disabled = false;

                updateActionButton();

                return;
            }

            setTyping(false);

            const bubble = appendEmptyBotBubble();

            const fullText =
                await streamReply(res, bubble);

            history.push({
                role: 'assistant',
                content: fullText
            });

            const remaining =
                res.headers.get(
                    'X-Messages-Remaining'
                );

            if (remaining !== null) {
                const n = parseInt(remaining, 10);

                chatRemaining.textContent =
                    n > 0
                        ? `${n} messages left in this conversation`
                        : "That's the last message for this conversation.";
            }

            chatInput.disabled = false;
            chatSendBtn.disabled = false;

            updateActionButton();

            chatInput.focus();

        } catch (err) {
            setTyping(false);

            appendMessage(
                'error',
                "oops, Couldn't reach the server - check your connection or try again."
            );

            chatInput.disabled = false;
            chatSendBtn.disabled = false;

            updateActionButton();

        } finally {
            isSending = false;
        }
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

        return true;
    }


    function attachListeners() {

        chatSendBtn.addEventListener(
            'click',
            () => {
                if (isSending || rateLimited) return;

                if (
                    chatInput.value.trim()
                ) {
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

        sessionId = getOrCreateSessionId();

        setupSpeechRecognition();
        attachListeners();

        updateActionButton();

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