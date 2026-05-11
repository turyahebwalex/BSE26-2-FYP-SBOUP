import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_PORT = 5000;

// Auto-detect the backend host from Metro's dev-server address.
// Set EXPO_PUBLIC_API_URL in .env to override (tunnels, deployed backend, etc).
function resolveApiUrl() {
  // 1. Use explicit env variable if provided (from .env file)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 2. Auto-detect from Metro's dev-server address (LAN development)
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;

  const host = hostUri?.split(':')[0];
  if (host && !host.endsWith('.exp.direct')) {
    return `http://${host}:${API_PORT}/api`;
  }

  // 3. Fallback to localhost (emulator or same machine)
  return `http://localhost:${API_PORT}/api`;
}

const API_URL = resolveApiUrl();
const SOCKET_URL = API_URL.replace('/api', '');  // e.g. http://10.87.64.94:5000

console.log('🔌 [Socket] Connecting to:', SOCKET_URL);

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.isConnected = false;
  }

  async connect() {
    if (this.socket && this.isConnected) {
      console.log('Socket already connected');
      return this.socket;
    }

    const token = await AsyncStorage.getItem('accessToken');
    if (!token) {
      console.log('No token found, cannot connect socket');
      return null;
    }

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.log('Socket connection error:', error.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
    }
  }

  // Add method to get raw socket (for emit outside this wrapper)
  getSocket() {
    return this.socket;
  }

  on(event, callback) {
    if (!this.socket) return;
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    this.socket.on(event, callback);
  }

  off(event, callback) {
    if (!this.socket) return;
    if (callback) {
      this.socket.off(event, callback);
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
    } else {
      this.socket.off(event);
      this.listeners.delete(event);
    }
  }

  emit(event, data) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    } else {
      console.warn(`Socket not connected, cannot emit ${event}`);
    }
  }

  // Typing indicator
  sendTyping(receiverId, isTyping) {
    this.emit('typing', { receiverId, isTyping });
  }

  // Mark message as delivered (optional, backend may handle automatically)
  markDelivered(messageIds) {
    this.emit('message_delivered', { messageIds });
  }

  getConnectionStatus() {
    return this.isConnected;
  }
}

export default new SocketService();