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

    let history = [];
    let sessionId = null;
    let isSending = false;       // true while a request to the API is actively in flight
    let rateLimited = false;
    let initialized = false;

    // Messages the user sent while a previous reply was still streaming.
    // Processed strictly one at a time, in order.
    let pendingQueue = [];

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

            const image = document.createElement('img');

            image.src = '/src/images/error_image_twin.png';
            image.alt = '';
            image.className = 'chat-error-image';


            const message = document.createElement('p');

            message.textContent = text;


            bubble.appendChild(image);
            bubble.appendChild(message);

        } else {

            const p = document.createElement('p');

            p.textContent = text;

            bubble.appendChild(p);
        }


        chatMessages.appendChild(bubble);

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

        if (!text || rateLimited) return;

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

    element.innerHTML = visibleText.replace(
        /(https?:\/\/[^\s]+|linkedin\.com\/in\/pranavkohli24|github\.com\/PranavKohli24|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|(?:\+91)?8860271737)/g,
        (match) => {
            if (match.includes('@')) {
                return `<a href="mailto:${match}?subject=${encodeURIComponent('Hello Pranav Kohli')}">✉ ${match}</a>`;
            }

            if (
                match === '+918860271737' ||
                match === '8860271737'
            ) {
                return `<a href="tel:+918860271737" style="font-weight: 600;">${match}</a>`;
            }

            const href = match.startsWith('http')
                ? match
                : `https://${match}`;

            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
        }
    );

    if (cursor) {
        element.appendChild(cursor);
    }
}

function addPhotoPreview(bubble, text) {
    const match = text.match(
        /\[SHOW_PHOTO\]\s*id\s*=\s*([a-z0-9-]+)\s*\[\/SHOW_PHOTO\]/i
    );

    if (!match) return;

    const photoId = match[1].toLowerCase();
    const photo = digitalTwinPhotos[photoId];

    if (!photo) return;

    const card = document.createElement('div');
    card.className = 'digital-twin-photo';

    card.innerHTML = `
        <img
            src="${photo.image}"
            alt="${photo.title}"
            class="digital-twin-photo-image"
        >

        <div class="digital-twin-photo-info">
            <div class="digital-twin-photo-title">
                ${photo.title}
            </div>

            <div class="digital-twin-photo-caption">
                ${photo.caption}
            </div>
        </div>
    `;

    bubble.appendChild(card);

    const image = card.querySelector('.digital-twin-photo-image');

    if (image.complete) {
        requestAnimationFrame(() => {
            image.classList.add('loaded');
        });
    } else {
        image.addEventListener('load', () => {
            requestAnimationFrame(() => {
                image.classList.add('loaded');
            });
        });
    }
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
    "How can I contact Pranav?",
    "How is pranav as a person?",
    "Tell me about Pranav's projects",
    "Show me a picture of pranav with his dog"
];

function renderSuggestions() {
    const container = document.getElementById('chatSuggestions');
    if (!container) return;

    const shuffled = [...suggestionQuestions]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

    container.innerHTML = shuffled.map(question => `
        <button class="chat-suggestion" type="button">
            ✧ ${question}
        </button>
    `).join('');

    container.querySelectorAll('.chat-suggestion').forEach(button => {
    button.addEventListener('click', () => {
        const question = button.textContent.replace('✧ ', '').trim();

        const start = button.getBoundingClientRect();
        const end = chatMessages.getBoundingClientRect();

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
                'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)';

            flyingBubble.style.left =
                `${end.right - start.width}px`;

            flyingBubble.style.top =
                `${end.bottom - 55}px`;

            flyingBubble.style.transform = 'scale(0.92)';
        });

        setTimeout(() => {
            flyingBubble.remove();
            button.style.visibility = '';

            chatInput.value = question;
            updateActionButton();
            autoResizeInput();
            sendMessage();
        }, 550);
    });
});
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

    const date =
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

    const calendarUrl =
        createCalendarUrl(date, time, duration);

    if (!calendarUrl) return;

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

    const previewImage = card.querySelector('.link-preview-image');

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
        }
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

    // If a complete internal command has started but has no closing tag yet,
    // hide everything from that command onward.
    const openCommandIndex = visible.search(
        /\[(?:SHOW_[A-Z_]+|CALENDAR_EVENT)\]/i
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
        '[CALENDAR_EVENT]'
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

    return visible.trimEnd();
}




    async function streamReply(res, bubble) {
        const p = bubble.querySelector('p');
        const cursor = bubble.querySelector('.stream-cursor');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        const TYPE_SPEED_MS = 30; // ms per character revealed — raise for slower, lower for faster

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

while (
    !(
        networkDone &&
        displayed.length >=
        getVisibleResponseText(fullText).length
    )
) {

    const visibleTarget =
        getVisibleResponseText(fullText);
            if (displayed.length < visibleTarget.length) {
                const wasFollowing = wasFollowingBottom();

                displayed = visibleTarget.slice(
                    0,
                    displayed.length + 1
                );

                renderLinkedText(p, displayed, cursor);

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

        chatInput.value = '';
        updateActionButton();
        autoResizeInput();

        pendingQueue.push({
            text,
            // Only show a WhatsApp-style quote when this message was typed
            // ahead of a reply already in progress — keeps normal one-at-a-time
            // conversations clean, and only adds context when it's actually needed.
            showQuote: isSending || pendingQueue.length > 0
        });
        processQueue();
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
        const { text, showQuote } = item;

        // Only add to the API-context history right before it's actually
        // used, so a still-queued later message never confuses the model
        // about what it's replying to.
        history.push({
            role: 'user',
            content: text
        });

        isSending = true;
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
                    "Oops, you've reached the message limit for this conversation. Feel free to reach out to Pranav at +918860271737"

                );

                rateLimited = true;
                chatInput.disabled = true;
                chatSendBtn.disabled = true;
                pendingQueue = [];

                return;
            }

            if (!res.ok || !res.body) {
                setTyping(false);

                appendMessage(
                    'error',
                    "ouch, Something went wrong on my end :( - try again in a moment."
                );

                return;
            }

            setTyping(false);

            const bubble = appendEmptyBotBubble(showQuote ? text : null);

            const fullText =
                await streamReply(res, bubble);

            addLinkPreviews(bubble, fullText);
            addPhotoPreview(bubble, fullText);

            history.push({
                role: 'assistant',
                content: fullText
                .replace(
                    /\[SHOW_[A-Z_]+\][\s\S]*?\[\/SHOW_[A-Z_]+\]/gi,
                    ''
                )
                .replace(
                    /\[CALENDAR_EVENT\][\s\S]*?\[\/CALENDAR_EVENT\]/gi,
                    ''
                )
                .trim()
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

        } catch (err) {
            setTyping(false);

            appendMessage(
                'error',
                "Oops, looks like I couldn't reach Pranav! My bad :( In the meantime, please check your internet connection and try again."
            );

        } finally {
            isSending = false;

            // Automatically continue with whatever the user typed
            // while this reply was streaming.
            if (pendingQueue.length > 0 && !rateLimited) {
                processQueue();
            }
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

        document.querySelectorAll('.chat-suggestion').forEach((button) => {
            button.addEventListener('click', () => {
                chatInput.value = button.textContent.replace('✧ ', '').trim();
                updateActionButton();
                autoResizeInput();
                sendMessage();
            });
        });

        chatSendBtn.addEventListener(
            'click',
            () => {
                if (rateLimited) return;

                if (
                    chatInput.value.trim()
                ) {
                    sendMessage();
                } else if (!isSending) {
                    // Don't start a fresh recording while the AI is
                    // actively replying — keep that part serialized.
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

        renderSuggestions();
        updateActionButton();

        setInterval(() => {
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