const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Обслуживаем статические файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Хранилище подключенных клиентов
const clients = new Map(); // key: ws, value: { name: string, id: string }

// Генерация простого ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Отправка сообщения всем клиентам
function broadcast(message, sender = null) {
    const messageStr = JSON.stringify(message);
    clients.forEach((_, client) => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(messageStr);
        }
    });
}

// Отправка списка пользователей всем
function broadcastUserList() {
    const users = Array.from(clients.values()).map(client => ({
        name: client.name,
        id: client.id
    }));
    
    const message = JSON.stringify({
        type: 'users',
        users: users
    });
    
    clients.forEach((_, client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('Новое подключение');
    let clientId = generateId();
    
    // Сохраняем клиента с временным ID до получения имени
    clients.set(ws, { id: clientId, name: 'Аноним' });
    
    // Отправляем новому клиенту его ID
    ws.send(JSON.stringify({
        type: 'system',
        message: 'Подключение установлено',
        clientId: clientId
    }));

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            switch(message.type) {
                case 'join':
                    // Пользователь представляется
                    const oldData = clients.get(ws) || { id: clientId };
                    const newName = message.name || 'Аноним';
                    
                    clients.set(ws, {
                        id: oldData.id,
                        name: newName
                    });
                    
                    // Уведомляем всех о новом пользователе
                    broadcast({
                        type: 'notification',
                        text: `${newName} присоединился к чату`
                    }, ws);
                    
                    // Отправляем подтверждение пользователю
                    ws.send(JSON.stringify({
                        type: 'system',
                        message: `Добро пожаловать, ${newName}!`
                    }));
                    
                    // Обновляем список пользователей
                    broadcastUserList();
                    break;
                    
                case 'message':
                    // Обычное сообщение
                    const clientInfo = clients.get(ws);
                    if (clientInfo) {
                        const messageData = {
                            type: 'message',
                            text: message.text,
                            sender: clientInfo.name,
                            senderId: clientInfo.id,
                            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                        };
                        
                        // Отправляем всем
                        broadcast(messageData);
                        
                        // Отправляем подтверждение отправителю
                        ws.send(JSON.stringify({
                            type: 'self_message',
                            ...messageData
                        }));
                    }
                    break;
                    
                case 'typing':
                    // Индикатор печатания
                    const typingUser = clients.get(ws);
                    if (typingUser) {
                        broadcast({
                            type: 'typing',
                            user: typingUser.name,
                            isTyping: message.isTyping
                        }, ws);
                    }
                    break;
            }
        } catch (error) {
            console.error('Ошибка обработки сообщения:', error);
        }
    });

    ws.on('close', () => {
        const client = clients.get(ws);
        if (client) {
            console.log(`Клиент ${client.name} отключился`);
            
            // Уведомляем всех об уходе пользователя
            broadcast({
                type: 'notification',
                text: `${client.name} покинул чат`
            });
            
            clients.delete(ws);
            
            // Обновляем список пользователей
            broadcastUserList();
        }
    });

    ws.on('error', (error) => {
        console.error('Ошибка WebSocket:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
