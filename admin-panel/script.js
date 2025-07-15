document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    let currentUserId = null;
    let chatToDelete = null;

    // Элементы DOM
    const elements = {
        messagesList: document.getElementById('messages-list'),
        usersList: document.getElementById('users-list'),
        messageModal: document.getElementById('messageModal'),
        confirmModal: document.getElementById('confirmModal'),
        modalSendBtn: document.getElementById('modal-send-btn'),
        confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
        cancelDeleteBtn: document.getElementById('cancel-delete-btn')
    };

    // Инициализация
    initTabs();
    loadData();
    setupEventListeners();

    function initTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const tabName = this.dataset.tab;
                showTab(tabName);
            });
        });
    }

    function showTab(tabName) {
        // Скрываем все вкладки
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Убираем активность у всех кнопок
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        // Показываем нужную вкладку
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Активируем нужную кнопку
        event.target.classList.add('active');
        
        // Загружаем данные
        if (tabName === 'messages') {
            loadMessages();
        } else if (tabName === 'users') {
            loadUsers();
        }
    }

    function loadData() {
        loadMessages();
        loadUsers();
    }

    async function loadMessages() {
        try {
            const response = await fetch('/api/messages');
            const messages = await response.json();
            renderMessages(messages);
        } catch (error) {
            console.error('Ошибка загрузки сообщений:', error);
        }
    }

    async function loadUsers() {
        try {
            const response = await fetch('/api/users');
            const users = await response.json();
            renderUsers(users);
        } catch (error) {
            console.error('Ошибка загрузки пользователей:', error);
        }
    }

    function renderMessages(messages) {
        elements.messagesList.innerHTML = '';
        
        if (messages.length === 0) {
            elements.messagesList.innerHTML = `
                <div class="empty-state">
                    <h3>📭 Нет сообщений</h3>
                    <p>Здесь будут отображаться входящие сообщения</p>
                </div>
            `;
            return;
        }
        
        messages.forEach(message => {
            const messageElement = createMessageElement(message);
            elements.messagesList.appendChild(messageElement);
        });
    }

    function renderUsers(users) {
        elements.usersList.innerHTML = '';
        
        if (users.length === 0) {
            elements.usersList.innerHTML = `
                <div class="empty-state">
                    <h3>👥 Нет пользователей</h3>
                    <p>Здесь будут отображаться активные пользователи</p>
                </div>
            `;
            return;
        }
        
        users.forEach(user => {
            const userElement = createUserElement(user);
            elements.usersList.appendChild(userElement);
        });
    }

    function createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message-item ${message.replied ? 'replied' : ''}`;
        
        const userInfo = [message.user.firstName, message.user.lastName].filter(Boolean).join(' ');
        const username = message.user.username ? `@${message.user.username}` : 'без username';
        
        div.innerHTML = `
            <div class="message-header">
                <div class="user-info">
                    ${userInfo} (${username})
                </div>
                <div class="timestamp">${new Date(message.timestamp).toLocaleString('ru-RU')}</div>
            </div>
            <div class="message-text">${message.text}</div>
            <div class="message-actions">
                <button class="delete-btn" data-chat-id="${message.chatId}">🗑️ Удалить чат</button>
            </div>
            <div class="reply-section">
                <textarea class="reply-input" placeholder="Ответить пользователю..."></textarea>
                <button class="reply-btn" data-chat-id="${message.chatId}">Ответить</button>
            </div>
        `;
        
        return div;
    }

    function createUserElement(user) {
        const div = document.createElement('div');
        div.className = 'user-item';
        
        const userInfo = [user.firstName, user.lastName].filter(Boolean).join(' ');
        const username = user.username ? `@${user.username}` : 'без username';
        
        div.innerHTML = `
            <div class="user-item-header">
                <div class="user-details">
                    <div class="user-name">${userInfo} (${username})</div>
                    <div class="user-id">ID: ${user.id}</div>
                </div>
                <div class="user-actions">
                    <button class="message-user-btn" data-user-id="${user.id}">
                        📩 Написать
                    </button>
                    <button class="delete-btn" data-chat-id="${user.id}">
                        🗑️ Удалить
                    </button>
                </div>
            </div>
        `;
        
        return div;
    }

    function setupEventListeners() {
        // Открытие модального окна для отправки сообщения
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('message-user-btn')) {
                const userId = e.target.dataset.userId;
                openMessageModal(userId);
            }
        });

        // Подтверждение удаления чата
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('delete-btn')) {
                const chatId = e.target.dataset.chatId;
                confirmDeleteChat(chatId);
            }
        });

        // Отправка сообщения из модального окна
        elements.modalSendBtn.addEventListener('click', sendModalMessage);

        // Удаление чата
        elements.confirmDeleteBtn.addEventListener('click', function() {
            if (chatToDelete) {
                deleteChat(chatToDelete);
            }
        });

        // Отмена удаления
        elements.cancelDeleteBtn.addEventListener('click', function() {
            closeModal('confirmModal');
            chatToDelete = null;
        });

        // Закрытие модальных окон
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', function() {
                closeModal('messageModal');
            });
        });

        // Закрытие по клику вне модального окна
        window.addEventListener('click', function(event) {
            if (event.target.classList.contains('modal')) {
                closeModal(event.target.id);
            }
        });

        // WebSocket события
        socket.on('newMessage', () => loadMessages());
        socket.on('messageReplied', () => loadMessages());
        socket.on('chatDeleted', () => loadData());
    }

    function openMessageModal(userId) {
        currentUserId = userId;
        elements.messageModal.style.display = 'block';
    }

    function confirmDeleteChat(chatId) {
        chatToDelete = chatId;
        elements.confirmModal.style.display = 'block';
    }

    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    async function sendModalMessage() {
        const message = document.getElementById('modal-message').value.trim();
        
        if (!message) {
            alert('Введите сообщение');
            return;
        }
        
        try {
            const response = await fetch('/api/reply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    chatId: currentUserId, 
                    message 
                }),
            });
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('modal-message').value = '';
                closeModal('messageModal');
                loadData();
            } else {
                alert('Ошибка отправки сообщения');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка отправки сообщения');
        }
    }

    async function deleteChat(chatId) {
        try {
            const response = await fetch('/api/delete-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chatId }),
            });
            
            const data = await response.json();
            
            if (data.success) {
                closeModal('confirmModal');
                loadData();
            } else {
                alert('Ошибка удаления чата');
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка удаления чата');
        }
    }
});