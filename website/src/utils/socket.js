import { io } from 'socket.io-client';
import shopConfig from '../config/shop.config';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(shopConfig.api.socketUrl, { autoConnect: false, transports: ['websocket', 'polling'] });
  }
  return socket;
};

export const connectSocket = () => {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
};

export const disconnectSocket = () => socket?.connected && socket.disconnect();
