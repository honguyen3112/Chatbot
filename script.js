let currentChatId = null;
let activeChats = new Map();

function saveToLocalStorage() {
    localStorage.setItem('chatHistory', JSON.stringify([...activeChats]));
}

function loadFromLocalStorage() {
    const storedChats = JSON.parse(localStorage.getItem('chatHistory'));
    if (storedChats) {
        storedChats.forEach(([id, messages]) => activeChats.set(id, messages));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    activeChats.forEach((messages, chatId) => {
        const chatList = document.getElementById('chat-list');
        const chatItem = document.createElement('li');
        chatItem.id = chatId;
        chatItem.className = 'cursor-pointer p-2 bg-gray-300 dark:bg-gray-600 rounded hover:bg-gray-400 dark:hover:bg-gray-700';
        chatItem.textContent = `Chat ${chatId.split('-')[1]}`;
        chatItem.addEventListener('click', () => switchChat(chatId));
        chatList.appendChild(chatItem);
    });

    if (activeChats.size > 0) {
        const firstChatId = activeChats.keys().next().value;
        switchChat(firstChatId);
    } else {
        document.getElementById('new-chat-btn').click();
    }
});

function switchChat(chatId) {
    if (currentChatId && activeChats.has(currentChatId)) {
        const chatBox = document.getElementById('chat-box');
        const messages = Array.from(chatBox.querySelectorAll('.chat-bubble')).map(bubble => ({
            role: bubble.classList.contains('user') ? 'user' :
                  bubble.classList.contains('bot') ? 'assistant' : 'system',
            content: bubble.textContent
        }));
        activeChats.set(currentChatId, messages);
        saveToLocalStorage();
    }

    currentChatId = chatId;
    renderChatHistory(activeChats.get(chatId) || []);
}

function renderChatHistory(history) {
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';
    history.forEach(msg => appendMessage(msg.role, msg.content));
}

function clearChatBox() {
    document.getElementById('chat-box').innerHTML =
        '<div class="chat-bubble bot bg-blue-100 dark:bg-blue-800 p-4 rounded-md max-w-lg self-start">Chat cleared. Start a new conversation!</div>';
}

document.getElementById('new-chat-btn').addEventListener('click', async () => {
    try {
        if (currentChatId && activeChats.has(currentChatId)) {
            const chatBox = document.getElementById('chat-box');
            const messages = Array.from(chatBox.querySelectorAll('.chat-bubble')).map(bubble => ({
                role: bubble.classList.contains('user') ? 'user' :
                      bubble.classList.contains('bot') ? 'assistant' : 'system',
                content: bubble.textContent
            }));
            activeChats.set(currentChatId, messages);
            saveToLocalStorage();
        }

        const response = await fetch('/new_chat', { method: 'POST' });
        const data = await response.json();
        currentChatId = data.chat_id;

        const chatList = document.getElementById('chat-list');
        const chatItem = document.createElement('li');
        chatItem.id = currentChatId;
        chatItem.className = 'cursor-pointer p-2 bg-gray-300 dark:bg-gray-600 rounded hover:bg-gray-400 dark:hover:bg-gray-700';
        chatItem.textContent = `Chat ${currentChatId.split('-')[1]}`;
        chatItem.addEventListener('click', () => switchChat(currentChatId));
        chatList.appendChild(chatItem);

        activeChats.set(currentChatId, []);
        clearChatBox();
        saveToLocalStorage();
    } catch (error) {
        console.error('Error creating new chat:', error);
        alert('Failed to create a new chat');
    }
});

document.getElementById('ask-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentChatId) {
        return alert('Please start a new chat first');
    }

    const questionInput = document.getElementById('question');
    const question = questionInput.value.trim();
    if (!question) return;

    const formData = new FormData();
    formData.append('chat_id', currentChatId);
    formData.append('question', question);

    try {
        const response = await fetch('/ask', { method: 'POST', body: formData });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
            return;
        }

        const chatHistory = activeChats.get(currentChatId) || [];
        chatHistory.push({ role: 'user', content: question });
        chatHistory.push({ role: 'assistant', content: result.response });
        activeChats.set(currentChatId, chatHistory);

        appendMessage('user', question);
        appendMessage('bot', result.response);

        questionInput.value = '';
        saveToLocalStorage();
    } catch (error) {
        console.error('Ask error:', error);
        alert('Failed to send message');
    }
});

document.getElementById('question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('ask-form').dispatchEvent(new Event('submit'));
    }
});

document.getElementById('clear-history-btn').addEventListener('click', () => {
    if (!currentChatId) return alert('No active chat to clear.');

    activeChats.clear();
    localStorage.removeItem('chatHistory');
    clearChatBox();

    document.getElementById('chat-list').innerHTML = '';
    currentChatId = null;
    alert('Chat history cleared successfully');
});

document.getElementById('file-upload').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file || !currentChatId) {
        return alert('Please start a new chat first');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('chat_id', currentChatId);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const data = await response.json();

        appendMessage('system', `Uploaded file: ${file.name}`);
        appendMessage('system', data.preview || 'File uploaded successfully');
        saveToLocalStorage();
    } catch (error) {
        console.error('File upload error:', error);
        alert('Failed to upload file');
    }
});

function appendMessage(role, message) {
    const chatBox = document.getElementById('chat-box');

    const messageContainer = document.createElement('div');
    messageContainer.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role} p-4 rounded-md max-w-lg ${
        role === 'user' ? 'bg-green-100 dark:bg-green-800' : 
        role === 'bot' ? 'bg-blue-100 dark:bg-blue-800' : 
        'bg-gray-300 dark:bg-gray-600'
    }`;
    bubble.textContent = message;
    messageContainer.appendChild(bubble);
    chatBox.appendChild(messageContainer);
    chatBox.scrollTop = chatBox.scrollHeight;
}
