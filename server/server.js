// Import required modules
const express = require("express"); // Import the Express framework
const server = express(); // Create an instance of the Express server
const cors = require("cors"); // Import the CORS module
// Enable Cross-Origin Resource Sharing (CORS)
server.use(cors()); // Use the CORS middleware to allow cross-origin requests

const httpServer = require("http").createServer(); // Create an HTTP server
const io = require("socket.io")(httpServer, {
  // Create a Socket.IO instance and configure CORS options
  cors: {
    origin: "http://127.0.0.1:8080", // Set the allowed origin for CORS
    methods: ["GET", "POST"], // Set the allowed HTTP methods
    credentials: true, // Enable sending cookies in cross-origin requests
  },
});

const { initGame, gameLoop, getUpdatedVelocity } = require("./game");
const { FRAME_RATE } = require("./constants");
const { makeid } = require("./utils");

const state = {};
const clientRooms = {};

io.on("connection", (client) => {
  client.on("keydown", handleKeydown);
  client.on("newGame", handleNewGame);
  client.on("joinGame", handleJoinGame);

  // Event handler for the "joinGame" event
  function handleJoinGame(roomName) {
    // Get the room object based on the room name
    const room = io.sockets.adapter.rooms[roomName];

    let allUsers;
    // If the room exists, get the sockets in the room
    if (room) {
      allUsers = room.sockets;
    }

    let numClients;
    // If there are users in the room, count the number of clients
    if (allUsers) {
      numClients = Object.keys(allUsers).length;
    }

    // If there are no clients in the room, emit "unknownCode" event to the client and return
    if (numClients === 0) {
      client.emit("unknownCode");
      return;
    }
    // If there are more than one client in the room, emit "tooManyPlayers" event to the client and return
    else if (numClients > 1) {
      client.emit("tooManyPlayers");
      return;
    }

    // Assign the room name to the client's ID in clientRooms object
    clientRooms[client.id] = roomName;

    // Make the client join the room
    client.join(roomName);
    // Assign the number 2 to the client's "number" property
    client.number = 2;
    // Emit the "init" event to the client with the number 2 as the parameter
    client.emit("init", 2);

    // Start the game interval for the room
    startGameInterval(roomName);
  }

  // Event handler for the "newGame" event
  function handleNewGame() {
    // Generate a random room name
    let roomName = makeid(5);
    console.log(roomName);
    // Assign the room name to the client's ID in clientRooms object
    clientRooms[client.id] = roomName;
    // Emit the "gameCode" event to the client with the room name as the parameter
    client.emit("gameCode", roomName);

    // Initialize the game state for the room
    state[roomName] = initGame();

    // Make the client join the room
    client.join(roomName);
    // Assign the number 1 to the client's "number" property
    client.number = 1;
    // Emit the "init" event to the client with the number 1 as the parameter
    client.emit("init", 1);
  }

  function handleKeydown(keyCode) {
    const roomName = clientRooms[client.id];
    if (!roomName) {
      return;
    }
    try {
      keyCode = parseInt(keyCode);
    } catch (e) {
      console.error(e);
      return;
    }

    const vel = getUpdatedVelocity(keyCode);

    if (vel) {
      state[roomName].players[client.number - 1].vel = vel;
    }
  }
});

function startGameInterval(roomName) {
  const intervalId = setInterval(() => {
    const winner = gameLoop(state[roomName]);

    if (!winner) {
      emitGameState(roomName, state[roomName]);
    } else {
      emitGameOver(roomName, winner);
      state[roomName] = null;
      clearInterval(intervalId);
    }
  }, 1000 / FRAME_RATE);
}

function emitGameState(room, gameState) {
  // Send this event to everyone in the room.
  io.sockets.in(room).emit("gameState", JSON.stringify(gameState));
}

function emitGameOver(room, winner) {
  io.sockets.in(room).emit("gameOver", JSON.stringify({ winner }));
}

httpServer.listen(3000); // Start the HTTP server on port 3000
