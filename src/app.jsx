import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';

const appSyncEndpoint = import.meta.env.VITE_APPSYNC_ENDPOINT;
const appSyncRegion = import.meta.env.VITE_APPSYNC_REGION;
const appSyncApiKey = import.meta.env.VITE_APPSYNC_API_KEY;
const hasAppSyncConfig = Boolean(appSyncEndpoint && appSyncRegion && appSyncApiKey);

if (hasAppSyncConfig) {
  // 1. CẤU HÌNH KẾT NỐI AWS AMPLIFY
  Amplify.configure({
    API: {
      GraphQL: {
        endpoint: appSyncEndpoint,
        region: appSyncRegion,
        defaultAuthMode: 'apiKey',
        apiKey: appSyncApiKey
      }
    }
  });
}

const client = generateClient();

// 2. ĐỊNH NGHĨA CÁC CÂU LỆNH GRAPHQL
const listMessagesQuery = /* GraphQL */ `
  query ListMessages {
    listMessages {
      id
      content
      sender
      createdAt
    }
  }
`;

const sendMessageMutation = /* GraphQL */ `
  mutation SendMessage($content: String!, $sender: String!) {
    sendMessage(content: $content, sender: $sender) {
      id
      content
      sender
      createdAt
    }
  }
`;

const onSendMessageSubscription = /* GraphQL */ `
  subscription OnSendMessage {
    onSendMessage {
      id
      content
      sender
      createdAt
    }
  }
`;

export default function App() {
  const [messages, setMessages] = useState([]);
  const [messageBody, setMessageBody] = useState('');
  const [senderName, setSenderName] = useState('User1');

  useEffect(() => {
    if (!hasAppSyncConfig) {
      return;
    }

    // Tải danh sách tin nhắn cũ khi vừa mở app
    fetchMessages();

    // Thiết lập kết nối WebSocket để lắng nghe tin nhắn mới (Real-time)
    const subscription = client
      .graphql({ query: onSendMessageSubscription })
      .subscribe({
        next: ({ data }) => {
          const newMessage = data.onSendMessage;
          setMessages((prevMessages) => {
            // Kiểm tra tránh trùng lặp tin nhắn
            if (prevMessages.some((msg) => msg.id === newMessage.id)) {
              return prevMessages;
            }
            // Thêm tin nhắn mới và sắp xếp lại theo thời gian
            const updatedMessages = [...prevMessages, newMessage];
            return updatedMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          });
        },
        error: (err) => console.error('Subscription error:', err)
      });

    // Đóng kết nối khi component bị unmount
    return () => subscription.unsubscribe();
  }, []);

  if (!hasAppSyncConfig) {
    return (
      <div className="chat-app setup-warning">
        <header className="chat-header">
          <h2>AWS AppSync Real-Time Chat</h2>
          <div className="header-sub">Missing environment variables</div>
        </header>

        <main className="chat-main">
          <div className="setup-card">
            <p>AppSync config is not set yet.</p>
            <p>Create a <code>.env.local</code> file with <code>VITE_APPSYNC_ENDPOINT</code>, <code>VITE_APPSYNC_REGION</code>, and <code>VITE_APPSYNC_API_KEY</code>.</p>
          </div>
        </main>
      </div>
    );
  }

  // Hàm gọi API lấy lịch sử tin nhắn
  const fetchMessages = async () => {
    try {
      const response = await client.graphql({ query: listMessagesQuery });
      const fetchedMessages = response.data.listMessages || [];
      
      // Sắp xếp tin nhắn cũ nhất lên trên
      const sortedMessages = fetchedMessages.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      setMessages(sortedMessages);
    } catch (error) {
      console.error('Lỗi khi tải tin nhắn:', error);
    }
  };

  // Hàm gọi API gửi tin nhắn
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageBody.trim() || !senderName.trim()) return;

    try {
      await client.graphql({
        query: sendMessageMutation,
        variables: {
          content: messageBody,
          sender: senderName
        }
      });
      setMessageBody(''); // Xóa khung nhập sau khi gửi
    } catch (error) {
      console.error('Lỗi khi gửi tin nhắn:', error);
    }
  };

  return (
    <div className="chat-app">
      <header className="chat-header">
        <h2>AWS AppSync Real-Time Chat</h2>
        <div className="header-sub">Real-time messaging powered by AppSync</div>
      </header>

      <main className="chat-main">
        <div className="messages" aria-live="polite">
          {messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.sender === senderName ? 'own' : ''}`}>
              <div className="avatar" aria-hidden>{msg.sender.slice(0,1).toUpperCase()}</div>
              <div className="message-body">
                <div className="message-head">
                  <span className="message-sender">{msg.sender}</span>
                  <span className="message-time">{new Date(msg.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div className="message-content">{msg.content}</div>
              </div>
            </div>
          ))}
        </div>

        <form className="composer" onSubmit={handleSendMessage}>
          <input
            className="input sender"
            type="text"
            placeholder="Tên của bạn"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            aria-label="Sender name"
          />
          <input
            className="input body"
            type="text"
            placeholder="Nhập tin nhắn..."
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            aria-label="Message body"
          />
          <button className="send-button" type="submit">Gửi</button>
        </form>
      </main>
    </div>
  );
}