import io from 'socket.io-client';

// Use the same API base URL as your backend
const SOCKET_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

let socket = null;

export const connectSocket = (token) => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
    });
  }
  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const on = (event, callback) => {
  if (socket) {
    socket.on(event, callback);
  }
};

export const off = (event, callback) => {
  if (socket) {
    socket.off(event, callback);
  }
};