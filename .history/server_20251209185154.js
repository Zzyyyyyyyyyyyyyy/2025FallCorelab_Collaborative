const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3005;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (data) => {
    const { room, username } = data;
    if (!room || !username) return;

    socket.join(room);
    console.log(`[${room}] ${username} joined`);

    const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
    socket.to(room).emit('user:joined', { username, id: socket.id });
    socket.emit('room:info', { room, userCount: roomSize });
    io.to(room).emit('room:count', { count: roomSize });
  });

  socket.on('sound:stroke', (data) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit('sound:stroke', data);
    });
  });

  socket.on('sound:state', (data) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit('sound:state', data);
    });
  });

  socket.on('canvas:clear', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      socket.to(room).emit('canvas:clear');
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(room => {
      const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
      io.to(room).emit('room:count', { count: roomSize });
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
