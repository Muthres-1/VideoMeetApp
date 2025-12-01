const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store active rooms and participants
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Create or join room
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    
    const room = rooms.get(roomId);
    room.set(socket.id, { username, socketId: socket.id });
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      username
    });
    
    // Send existing participants to new user
    const participants = Array.from(room.values()).filter(p => p.socketId !== socket.id);
    socket.emit('existing-participants', participants);
    
    console.log(`${username} joined room ${roomId}`);
  });

  // WebRTC signaling
  socket.on('offer', ({ offer, to }) => {
    socket.to(to).emit('offer', {
      offer,
      from: socket.id
    });
  });

  socket.on('answer', ({ answer, to }) => {
    socket.to(to).emit('answer', {
      answer,
      from: socket.id
    });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    socket.to(to).emit('ice-candidate', {
      candidate,
      from: socket.id
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove user from all rooms
    rooms.forEach((room, roomId) => {
      if (room.has(socket.id)) {
        const user = room.get(socket.id);
        room.delete(socket.id);
        
        // Notify others
        socket.to(roomId).emit('user-left', socket.id);
        
        // Clean up empty rooms
        if (room.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});