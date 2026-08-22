/**
 * Digital Twin Chat Module
 * Talks to the Cloudflare Worker, which proxies DeepSeek securely.
 */

(function() {
    'use strict';

    // Your deployed Worker's URL
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
    }

    function setTyping(visible) {
        chatTyping.style.display = visible ? 'flex' : 'none';
        if (visible) chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function setInputEnabled(enabled) {
        chatInput.disabled = !enabled;
        chatSendBtn.disabled = !enabled;
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

            const data = await res.json();

            setTyping(false);

            if (res.status === 429) {
                appendMessage('error', data.message || "You've reached the message limit for this conversation.");
                rateLimited = true;
                setInputEnabled(false);
                return;
            }

            if (!res.ok) {
                appendMessage('error', "Something went wrong on my end — try again in a moment.");
                setInputEnabled(true);
                return;
            }

            appendMessage('bot', data.reply);
            history.push({ role: 'assistant', content: data.reply });

            if (typeof data.messagesRemaining === 'number') {
                chatRemaining.textContent = data.messagesRemaining > 0
                    ? `${data.messagesRemaining} messages left in this conversation`
                    : "That's the last message for this conversation.";
            }

            setInputEnabled(true);
            chatInput.focus();
        } catch (err) {
            setTyping(false);
            appendMessage('error', "Couldn't reach the server — check your connection and try again.");
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