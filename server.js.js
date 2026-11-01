// server.js - Murder Mystery Server (Node.js + Express + Socket.io)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Rooms State Store
const rooms = {};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // 1. Create Room (Narrator)
  socket.on('createRoom', ({ roomCode, narratorName, story, characters, clues }) => {
    rooms[roomCode] = {
      code: roomCode,
      narratorId: socket.id,
      narratorName: narratorName || 'Narratore',
      story: story || '',
      characters: characters || [],
      clues: clues || [],
      revealedClues: [],
      players: [], // { id, socketId, name, character: null, accusation: null }
      phase: 'SETUP', // SETUP, LOBBY, IN_GAME, CONCLUSION, FINISHED
      winner: null
    };
    socket.join(roomCode);
    socket.emit('roomStateUpdate', rooms[roomCode]);
    console.log(`Room created: ${roomCode}`);
  });

  // 2. Join Room (Player)
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('errorMsg', 'Stanza non trovata! Controlla il codice.');
      return;
    }

    // Check if player already connected
    let player = room.players.find(p => p.socketId === socket.id);
    if (!player) {
      player = {
        id: 'p_' + Math.random().toString(36).substr(2, 9),
        socketId: socket.id,
        name: playerName,
        character: null,
        accusation: null
      };
      room.players.push(player);
    }
    socket.join(roomCode);
    io.to(roomCode).emit('roomStateUpdate', room);
  });

  // 3. Start Game & Assign Characters Randomly
  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    // Shuffle characters
    const shuffledChars = [...room.characters].sort(() => Math.random() - 0.5);
    
    room.players.forEach((player, index) => {
      if (shuffledChars[index]) {
        player.character = shuffledChars[index];
      }
    });

    room.phase = 'IN_GAME';
    io.to(roomCode).emit('roomStateUpdate', room);
  });

  // 4. Reveal Clue to All Players
  socket.on('revealClue', ({ roomCode, clueId }) => {
    const room = rooms[roomCode];
    if (!room) return;

    if (!room.revealedClues.includes(clueId)) {
      room.revealedClues.push(clueId);
      io.to(roomCode).emit('roomStateUpdate', room);
    }
  });

  // 5. Trigger Conclusion Phase
  socket.on('startConclusion', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.phase = 'CONCLUSION';
    io.to(roomCode).emit('roomStateUpdate', room);
  });

  // 6. Submit Accusation (Player)
  socket.on('submitAccusation', ({ roomCode, suspect, weapon, motive }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.accusation = { suspect, weapon, motive, timestamp: new Date().toISOString() };
      io.to(roomCode).emit('roomStateUpdate', room);
    }
  });

  // 7. Declare Winner (Narrator)
  socket.on('declareWinner', ({ roomCode, winnerPlayerId, finalNotes }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.winner = { winnerPlayerId, finalNotes };
    room.phase = 'FINISHED';
    io.to(roomCode).emit('roomStateUpdate', room);
  });

  // 8. Disconnection handler
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
  });
});

// Avvio del server sulla porta corretta (richiesto da Render)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server avviato con successo sulla porta ${PORT}`);
});