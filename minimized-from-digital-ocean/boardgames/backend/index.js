var express = require('express');
var app = express();
var expressSession = require('express-session');
var bodyParser = require('body-parser')
var sharedsession = require("express-socket.io-session");

var session = expressSession({
    secret: 'boardgames_enge',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
  });

app.set('trust proxy', 1) // trust first proxy
app.use(session);
app.use(bodyParser.json());
// app.use(function (req, res, next) {
//     console.log(req.session);
//     next();
//   });

app.use(function(req, res, next) {
    // res.header("Access-Control-Allow-Origin", "http://localhost:3000"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Origin", "https://boardgames.matvs.dev"); 
    
    // res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Headers", "Origin, Content-Type,Content-Length, Authorization, Accept,X-Requested-With");
    res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    res.header('Access-Control-Allow-Credentials', true);
    next();
  });

app.post('/login', function (req, res) {
    // console.log(req.session);
    console.log(req.sessionID);
    // console.log(req.body);
    // console.log(req.session.views);
    // res.json({ username: 'Flavio' })
    req.session.player = {
            id: server.lastPlayderID++,
            name: req.body.name,
            points: 0,
            x: 0,
            y: 0,
            online: true
        };
    res.send(req.session.player);
  });

  app.post('/welcome', function (req, res) {
    // console.log(req.session);
    console.log(req.sessionID);
    // console.log(req.body);
    // console.log(req.session.views);
    // res.json({ username: 'Flavio' })
    if (req.session && req.session.player) {
        res.send({foundSession: true, player: req.session.player});
        return;
    }
    res.send({foundSession: false});
   
  });

  app.post('/createRoom', function (req, res) {
    let roomId = req.body.roomId;

    if (!roomId) {
        roomId = crypto.randomBytes(20).toString('hex');
        while (server.rooms[roomId]) {
            roomId = crypto.randomBytes(20).toString('hex');
        }
    }
    
    if (!server.rooms[roomId]) {
        server.rooms[roomId] = {
            active: true,
            players: [],
            starting: [],
       }
       res.send({id: roomId});
       return;
    
    } 
    res.send({id:roomId, error: true, errorCode: 'alreadyExists'});
   
  });

  app.post('/joinRoom', function (req, res) {
    let roomId = req.body.roomId;
    const room = server.rooms[roomId]; 

    if (room && room.active) {
        let currentPlayerAlreadyInRoom = false;
        let playerId = null;
        if (req.session && req.session.player) {
            const player = room.players.find(p => p.id === req.session.player.id);
            if (player) {
                playerId = player.id;
                currentPlayerAlreadyInRoom = true;
                player.online = true;
            }
        }
        res.send({id:roomId, players: room.players, playerId});
    } else {
        res.send({id:roomId, error: true, errorCode: 'roomDoesNotExist'});
    }
   
  });




  app.post('/logout', function (req, res) {
    // console.log(req.session);
    console.log(req.sessionID);
    // console.log(req.body);
    // console.log(req.session.views);
    // res.json({ username: 'Flavio' })
    if (req.session) {
        req.session.destroy();
        res.send({});
       
    }
    // res.send({foundSession: false});
   
  });




 

var server = require('http').Server(app);
server.lastPlayderID = 0;
server.rooms = {
    '3#141592' : {
        active: true,
        players: [],
        starting: [],
    },
    'pokoj' : {
        active: true,
        players: [],
        starting: [],
    }
}

var io = require('socket.io').listen(server);
io.use(sharedsession(session))
// io.use((socket, next) => {
//     console.log(socket.request.session);
//       return next();
// });

var crypto = require("crypto");

server.listen(3001, function () {
    console.log('Listening on ' + server.address().port);
});




io.on('connection', function (socket) {
    // socket.use((packet, next) => {
    //     let session =  socket.handshake.session;
    //     if (session) {
    //         console.log('socket mdlw');
    //         console.log(session.id)
    //         socket.session = session;
    //         return next();
    //     }
    //     // next(new Error('No session'));
    //   });
    console.log('connected')
    socket.rooms = [];
   

    socket.on('joinGame', function ({roomId, color}) {
        const room = server.rooms[roomId]; 
        if (room && room.active) {
            socket.join(roomId);
            socket.player = socket.handshake.session.player;
            socket.player.color = color;

            const playerIndex = room.players.findIndex(p => p.id === socket.player.id);
            if (playerIndex > -1) {
                room.players = [...room.players.slice(0, playerIndex), ...[socket.player], ...room.players.slice(playerIndex + 1)];
            } else {
              room.players.push(socket.player);
            }

            if (socket.rooms.indexOf(roomId) == -1) {
                socket.rooms.push(roomId);
            }
           
            
            socket.emit('allPlayers', {players: getAllPlayers(roomId), roomId});
            // socket.to(roomId).emit('newPlayerJoined', socket.player);
            io.to(roomId).emit('newPlayerJoined', socket.player);
    
            socket.on('disconnect', function () {
                if (socket.player) {
                    socket.player.online = false;
                    socket.to(roomId).emit('remove', socket.player);
                    // const id = socket.player.id;
                    // const time = 5000; 
                    // // If still offline after given time
                    // setTimeout(() => {
                    //     const playerIndex = room.players.findIndex(p => p.id === id);
                    //     const player = room.players[playerIndex];
                    //     if (!player || player.offline) {
                    //         room.players.splice(playerIndex, 1);
                    //         socket.to(roomId).emit('removePlayer', id);
                    //     }
                    // }, 5000)
                }
            });

            socket.on('updatePos', function (data) {
                if (socket.player) {
                    const {roomId, x, y} = data;
                    socket.player.x = x;
                    socket.player.y = y;
                    socket.to(roomId).emit('newPos', socket.player);
                }
            });
            
        } else {
            socket.emit('allPlayers', {error: true, roomId});
        }
    });

    socket.on('click', () => {

    });

    socket.on('startGame', ({roomId}) => {
        const room = server.rooms[roomId]; 
        if (room && room.active) {
            room.starting.push(socket.player);
            if (!room.startGameTimeout) {
                const time = 10000;
                io.to(roomId).emit('startGameCounter', {time})
                room.startGameTimeout = setTimeout(() => {
                    if (room.starting.length == 1 || room.starting.length != room.players.length) {
                        io.to(roomId).emit('startGame', {error: true, reason: 'notEveryoneStartedGame'});
                    } 
                    room.starting = [];
                    clearTimeout(room.startGameTimeout);
                    room.startGameTimeout = null;
                }, 10000);
            }

            if (room.starting.length > 1 && room.starting.length === room.players.length) {
                room.gameData = generateRandomGameData();
                io.to(roomId).emit('startGame',   {gameData: room.gameData });
            }
        }
    });

    socket.on('hasFoundSet',  ({roomId, indexes}) => {
        const room = server.rooms[roomId]; 
        if (room && room.active) {
            socket.player.points++;
            io.to(roomId).emit('hasFoundSet', { player: socket.player, indexes});
            io.to(roomId).emit('removeCards', {indexes});
        }
       
    });

    socket.on('madeMistake',  ({roomId}) => {
        const room = server.rooms[roomId]; 
        if (room && room.active) {
            socket.player.points--;
            io.to(roomId).emit('hasFoundSet', {player: socket.player});
        }
       
    });
    

    
});

// setInterval(function () {
//     if (io && io.sockets) {
//         io.emit('currentPos', getAllPlayers(null))
//         Object.keys(io.sockets.connected).forEach(function (socketID) {
//             var player = io.sockets.connected[socketID].player;
//             if (player) {
//                 player.bullets = [];
//             }
//         });
//     }
// }, 10)

function getAllPlayers(roomId) {
    // return Object.values(io.sockets.connected).map(socket => socket.player);
    // return room.sockets.map(socket => socket.player);
    // io.sockets.adapter.rooms[roomId].map(socket => socket.player);
    // io.of('/chat').clients((error, clients) => {
    //     if (error) throw error;
    //     console.log(clients); // => [PZDoMHjiu8PYfRiKAAAF, Anw2LatarvGVVXEIAAAD]
    //   });
    // Object.values(io.sockets.connected).forEach(socket => {
    //     console.log(roomId, socket.player, Object.keys(socket.rooms))
    //     });


    // return Object.values(io.sockets.connected).filter(socket => socket.player &&
    //     Object.keys(socket.rooms).indexOf(roomId) > -1).map(socket =>
    //          socket.player);

    return Object.values(io.sockets.connected).filter(socket => socket.player &&
         (socket.rooms).indexOf(roomId) > -1).map(socket =>
             socket.player);
}

function generateRandomGameData() {
    let indexes = new Array(81).fill(0).map((v,i) => i);
    for (let i = 0; i < 30000; ++i) {
        let j = Math.floor(Math.random() * Math.floor(indexes.length));
        let k = Math.floor(Math.random() * Math.floor(indexes.length));
        const temp = indexes[j];
        indexes[j] = indexes[k];
        indexes[k] = temp;
    }

    return {
        shuffledCards: indexes,
    }
}
function randomInt(low, high) {
    return Math.floor(Math.random() * (high - low) + low);
}
