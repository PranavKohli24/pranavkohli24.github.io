/**
 * Digital Twin Chat Module
 * Talks to the Cloudflare Worker, which streams replies from Workers AI
 * token-by-token for a live typewriter effect.
 */

(function() {
    'use strict';

    const WORKER_URL = 'https://pranav-digital-twin.pranavdigitaltwin.workers.dev';
    const SESSION_KEY = 'digitalTwinSessionId';

    let chatMessages, chatInput, chatSendBtn, chatTyping, chatRemaining;
    let history = [];
    let sessionId = null;
    let isSending = false;
    let rateLimited = false;
    let initialized = false;

    function getOrCreateSessionId() {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    }

    function appendMessage(role, text) {
        const bubble = document.createElement('div');
        bubble.className = role === 'user' ? 'chat-msg chat-msg-user' : (role === 'error' ? 'chat-msg chat-msg-error' : 'chat-msg chat-msg-bot');
        const p = document.createElement('p');
        p.textContent = text;
        bubble.appendChild(p);
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return bubble;
    }

    function appendEmptyBotBubble() {
        const bubble = document.createElement('div');
        bubble.className = 'chat-msg chat-msg-bot';
        const p = document.createElement('p');
        p.textContent = '';
        const cursor = document.createElement('span');
        cursor.className = 'stream-cursor';
        p.appendChild(cursor);
        bubble.appendChild(p);
        chatMessages.appendChild(bubble);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return bubble;
    }

    function setTyping(visible) {
        chatTyping.style.display = visible ? 'flex' : 'none';
        if (visible) chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function setInputEnabled(enabled) {
        chatInput.disabled = !enabled;
        chatSendBtn.disabled = !enabled;
    }

    async function streamReply(res, bubble) {
        const p = bubble.querySelector('p');
        const cursor = bubble.querySelector('.stream-cursor');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // last (possibly incomplete) line stays in buffer

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const jsonStr = trimmed.slice(5).trim();
                if (jsonStr === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.response) {
                        fullText += parsed.response;
                        p.textContent = fullText;
                        if (cursor) p.appendChild(cursor);
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                } catch (e) {
                    // partial/malformed chunk — safe to skip, next chunk completes it
                }
            }
        }

        if (cursor) cursor.remove();
        return fullText;
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isSending || rateLimited) return;

        appendMessage('user', text);
        history.push({ role: 'user', content: text });
        chatInput.value = '';

        isSending = true;
        setInputEnabled(false);
        setTyping(true);

        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, messages: history })
            });

            if (res.status === 429) {
                const data = await res.json();
                setTyping(false);
                appendMessage('error', data.message || "oops, You've reached the message limit for this conversation. contact pranav for this!");
                rateLimited = true;
                setInputEnabled(false);
                return;
            }

            if (!res.ok || !res.body) {
                setTyping(false);
                appendMessage('error', "ouch, Something went wrong on my end - try again in a moment.");
                setInputEnabled(true);
                return;
            }

            setTyping(false);
            const bubble = appendEmptyBotBubble();
            const fullText = await streamReply(res, bubble);
            history.push({ role: 'assistant', content: fullText });

            const remaining = res.headers.get('X-Messages-Remaining');
            if (remaining !== null) {
                const n = parseInt(remaining, 10);
                chatRemaining.textContent = n > 0
                    ? `${n} messages left in this conversation`
                    : "That's the last message for this conversation.";
            }

            setInputEnabled(true);
            chatInput.focus();
        } catch (err) {
            setTyping(false);
            appendMessage('error', "oops, Couldn't reach the server - check your connection or try again.");
            setInputEnabled(true);
        } finally {
            isSending = false;
        }
    }

    function bindElements() {
        chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return false;

        chatInput = document.getElementById('chatInput');
        chatSendBtn = document.getElementById('chatSendBtn');
        chatTyping = document.getElementById('chatTyping');
        chatRemaining = document.getElementById('chatRemaining');

        return true;
    }

    function attachListeners() {
        chatSendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    function init() {
        if (initialized) return;
        if (!bindElements()) return;

        sessionId = getOrCreateSessionId();
        attachListeners();
        initialized = true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();