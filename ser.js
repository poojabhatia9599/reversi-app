    
// Set up the static file server
let static = require('node-static');

// Set up the http server library
let http = require('http');

// Assume that we are running on Heroku
let port = process.env.PORT;
let directory = __dirname + '/public';

// If we aren't on Heroku, then we need to adjust our port and directory
if((typeof port == 'undefined') || (port === null)) {
    port = 8080;
    directory = './public';
}

// Setup our static file web server to deliver files from the filesystem
let file = new static.Server(directory);

let app = http.createServer(
    function(request, response) {
        request.addListener('end', 
            function() {
                file.serve(request,response);
            }
        ).resume();
    }
).listen(port);

console.log('The server is running on port:8080');

// Set up the web socket server

// Set up a registry of player information and their socket ids
let players = [];

const { Server } = require('socket.io');
const io = new Server(app);

io.on('connection', (socket) => {
    // Output a log message on the server and send it to the clients
    function serverLog(...messages) {
        io.emit('log', ['**** Message from the server:\n']);
        messages.forEach((item) => {
            io.emit('log', ['****\t' + item]);
            console.log(item);
        });
    }

    serverLog('a page connected to the server: ' + socket.id);

    /* join_room command handler
        expected payload:
        {
            'room': the room to be joined,
            'username': the name of the user joining the room
        }
    */
    /* join_room_response  
        {
            'result': 'success',
            'room': the room that was joined,
            'username': the user that joined the room,
            'count': the number of users in the chat room
            'socket_id': the socket of the user that just joined the room
        }
        or
        {
            'result': 'fail',
            'message': the reason for failure
        } 
    */
 
        socket.on('join_room', (payload) => {
        serverLog('Server received a command', '\'join_room\'', JSON.stringify(payload));
       // Check that the data coming from the client is good
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send payload';
            socket.emit('join_room_response', response);
            serverLog('join_room_command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        if ((typeof room == 'undefined') || (room === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to join';
            socket.emit('join_room_response', response);
            serverLog('join_room_command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || (username === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid username to join the chat room';
            socket.emit('join_room_response', response);
            serverLog('join_room_command failed', JSON.stringify(response));
            return;
        }

        // Handle the command
        socket.join(room);

        // Make sure the client was put in the room
        io.in(room).fetchSockets().then((sockets) => {
            // Sockets didn't join the room
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.includes(socket)) {
                response = {};
                response.result = 'fail';
                response.message = 'Server internal error joining chat room';
                socket.emit('join_room_response', response);
                serverLog('join_room_command failed', JSON.stringify(response));
            }
            // Socket did join room
            else {
                players[socket.id] = {
                    username: username,
                    room: room
                }
                // Announce to everyone that is in the room, who else is in the room
                for (const member of sockets) {
                    response = {
                        result: 'success',
                        socket_id: member.id,
                        room: players[member.id].room,
                        username: players[member.id].username,
                        count: sockets.length
                    }

                    // Tell everyone that a new user has joined the chat room
                    io.of('/').to(room).emit('join_room_response', response);
                    serverLog('join_room_succeeded', JSON.stringify(response));

                    if(room !== "Lobby") {
                        send_game_update(socket, room, 'initial update');
                    }
                }
            };
        });

        socket.on('invite', (payload) => {
            serverLog('Server received a command', '\'invite\'', JSON.stringify(payload));
           // Check that the data coming from the client is good
            if ((typeof payload == 'undefined') || (payload === null)) {
                response = {};
                response.result = 'fail';
                response.message = 'client did not send payload';
                socket.emit('invite_response', response);
                serverLog('invite_command failed', JSON.stringify(response));
                return;
            }

            let requested_user = payload.requested_user;
            let room = players[socket.id].room;
            let username = players[socket.id].username;
            if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
                response = {
                    result: 'fail',
                    message: 'client did not request a valid user to invite to play'
                };
                socket.emit('invite_response', response);
                serverLog('invite_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof room == 'undefined') || (room === null) || (room === "")) {
                response = {
                    result: 'fail',
                    message: 'the user that was invited is not in a room'
                };
                socket.emit('invite_response', response);
                serverLog('invite_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof username == 'undefined') || (username === null) || (username === "")) {
                response = {
                    result: 'fail',
                    message: 'the user that was invited does not have a name registered'
                };
                socket.emit('invite_response', response); 
                serverLog('invite_command failed', JSON.stringify(response));
                return;
            }
    
            // Make sure that the invited player is preseent
            io.in(room).allSockets().then((sockets) => {
                // Invitee isn't in the room
                if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                    response = {
                        result: 'fail',
                        message: 'the user that was invited is no longer in the room'
                    };
                    socket.emit('invite_response', response);
                    serverLog('invite_command failed', JSON.stringify(response));
                }
                // Invitee is in the room
                else {
                    response = {
                        result : 'success',
                        socket_id: requested_user,
                    }
                    socket.emit("invite_response", response);
                    
                    response = {
                        result : 'success',
                        socket_id: socket.id,
                    }
                    socket.to(requested_user).emit("invited", response);
                    serverLog('invite_command succeeded', JSON.stringify(response));
                };
            });
        });
           
        socket.on('uninvite', (payload) => {
            serverLog('Server received a command', '\'uninvite\'', JSON.stringify(payload));
           // Check that the data coming from the client is good
            if ((typeof payload == 'undefined') || (payload === null)) {
                response = {};
                response.result = 'fail';
                response.message = 'client did not send payload';
                socket.emit('uninvited', response);
                serverLog('uninvite_command failed', JSON.stringify(response));
                return;
            }

            let requested_user = payload.requested_user;
            let room = players[socket.id].room;
            let username = players[socket.id].username;
            if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
                response = {
                    result: 'fail',
                    message: 'client did not request a valid user to uninvite to play'
                };
                socket.emit('uninvited', response);
                serverLog('uninvite_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof room == 'undefined') || (room === null) || (room === "")) {
                response = {
                    result: 'fail',
                    message: 'the user that was uninvited is not in a room'
                };
                socket.emit('uninvited', response);
                serverLog('uninvite_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof username == 'undefined') || (username === null) || (username === "")) {
                response = {
                    result: 'fail',
                    message: 'the user that was uninvited does not have a name registered'
                };
                socket.emit('uninvited', response); 
                serverLog('uninvite_command failed', JSON.stringify(response));
                return;
            }
    
            // Make sure that the uninvited player is preseent
            io.in(room).allSockets().then((sockets) => {
                // Uninvitee isn't in the room
                if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                    response = {
                        result: 'fail',
                        message: 'the user that was uninvited is no longer in the room'
                    };
                    socket.emit('uninvited', response);
                    serverLog('uninvite_command failed', JSON.stringify(response));
                }
                // Uninvitee is in the room
                else {
                    response = {
                        result : 'success',
                        socket_id: requested_user,
                    }
                    socket.emit("uninvited", response);
                    
                    response = {
                        result : 'success',
                        socket_id: socket.id,
                    }
                    socket.to(requested_user).emit("uninvited", response);
                    serverLog('uninvite_command succeeded', JSON.stringify(response));
                };
            });
        });

        socket.on('game_start', (payload) => {
            serverLog('Server received a command', '\'game_start\'', JSON.stringify(payload));
           // Check that the data coming from the client is good
            if ((typeof payload == 'undefined') || (payload === null)) {
                response = {};
                response.result = 'fail';
                response.message = 'client did not send payload';
                socket.emit('game_start_response', response);
                serverLog('game_start_command failed', JSON.stringify(response));
                return;
            }

            let requested_user = payload.requested_user;
            let room = players[socket.id].room;
            let username = players[socket.id].username;
            if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
                response = {
                    result: 'fail',
                    message: 'client did not request a valid user to engage in play'
                };
                socket.emit('game_start_response', response);
                serverLog('game_start_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof room == 'undefined') || (room === null) || (room === "")) {
                response = {
                    result: 'fail',
                    message: 'the user that was engaged to play is not in a room'
                };
                socket.emit('game_start_response', response);
                serverLog('game_start_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof username == 'undefined') || (username === null) || (username === "")) {
                response = {
                    result: 'fail',
                    message: 'the user that was engaged to play does not have a name registered'
                };
                socket.emit('game_start_response', response); 
                serverLog('game_start_command failed', JSON.stringify(response));
                return;
            }
    
            // Make sure that the player engaged to play is preseent
            io.in(room).allSockets().then((sockets) => {
                // Engaged player isn't in the room
                if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
                    response = {
                        result: 'fail',
                        message: 'the user that was engaged to play is no longer in the room'
                    };
                    socket.emit('game_start_response', response);
                    serverLog('game_start_command failed', JSON.stringify(response));
                }
                // Engaged plauer is in the room
                else {
                    let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);
                    response = {
                        result : 'success',
                        game_id: game_id,
                        socket_id: requested_user,
                    }
                    socket.emit("game_start_response", response);
                    socket.to(requested_user).emit("game_start_response", response);
                    serverLog('game_start_command succeeded', JSON.stringify(response));
                };
            });
        });

        socket.on('disconnect', () => {
            serverLog('a page disconnected from the server: ' + socket.id);
            if((typeof players[socket.id] != 'undefined') && (players[socket.id] != null)) {
                let payload = {
                    username: players[socket.id].username,
                    room: players[socket.id].room,
                    count: Object.keys(players).length - 1,
                    socket_id: socket.id
                };
                let room = players[socket.id].room;
                delete players[socket.id];
                // Tell everyone who left the room
                io.of("/").to(room).emit('player_disconnected', payload);
                serverLog('player_disconnected_succeeded', JSON.stringify(payload));
            }
        });


    /* send_chat_message command handler
        expected payload:
        {
            'room': the room to which the message should be sent,
            'username': the name of the sender,
            'message': the message to broadcast
        }
    */
    /* send_chat_message response 
        {
            'result': 'success',
            'username': the user that send the message,
            'message': the message that was sent
        }
        or
        {
            'result': 'fail',
            'message': the reason for failure
        }
    */

        socket.on('send_chat_message', (payload) => {
            serverLog('Server received a command', '\'send_chat_message\'', JSON.stringify(payload));
            // Check that the data coming from the client is good
            if ((typeof payload == 'undefined') || (payload === null)) {
                response = {};
                response.result = 'fail';
                response.message = 'client did not send payload';
                socket.emit('send_chat_message_response', response);
                serverLog('send_chat_message_command failed', JSON.stringify(response));
                return;
            }
            let room = payload.room;
            let username = payload.username;
            let message = payload.message;
            if ((typeof room == 'undefined') || (room === null)) {
                response = {};
                response.result = 'fail';
                response.message = 'client did not send a valid room to message';
                socket.emit('send_chat_message_response', response);
                serverLog('send_chat_message_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof username == 'undefined') || (username === null)) {
                response = {};
                response.result = 'fail';
                response.message = 'client did not send a valid username as a message source';
                socket.emit('send_chat_message_response', response);
                serverLog('send_chat_message_command failed', JSON.stringify(response));
                return;
            }
            if ((typeof message == 'undefined') || (message === null)) {
                response = {};
                response.result = 'fail';
                response.message = 'client did not send a valid message';
                socket.emit('send_chat_message_response', response);
                serverLog('send_chat_message_command failed', JSON.stringify(response));
                return;
            }

            // Handle the command
            let response = {};
            response.result = 'success';
            response.username = username;
            response.room = room;
            response.message = message;

            //Tell everyone in the room what the message is
            io.of('/').to(room).emit('send_chat_message_response', response);
            serverLog('send_chat_message command succeeded', JSON.stringify(response));
        });
    });

    socket.on('play_token', (payload) => {
        serverLog('Server received a command', '\'play_token\'', JSON.stringify(payload));
        // Check that the data coming from the client is good
        if ((typeof payload == 'undefined') || (payload === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send payload';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }
        let player = players[socket.id];
        if ((typeof player == 'undefined') || (player === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'play_token came from an unregistered player';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }
        let username = player.username;
        if ((typeof username == 'undefined') || (username === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'play_token command did not come from a registered username';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }
        let game_id = player.room;
        if ((typeof game_id == 'undefined') || (game_id === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'There was no valid game associated with the play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }
        let row = payload.row;
        if ((typeof row == 'undefined') || (row === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'There was no valid row associated with the play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }
        let column = payload.column;
        if ((typeof column == 'undefined') || (column === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'There was no valid column associated with the play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }
        let color = payload.color;
        if ((typeof color == 'undefined') || (color === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'There was no valid color associated with the play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }
        let game = games[game_id];
        if ((typeof game == 'undefined') || (game === null)) {
            response = {};
            response.result = 'fail';
            response.message = 'There was no valid game associated with the play_token command';
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }

        // Make sure the current attempt is by the correct color
        if(color !== game.whose_turn) {
            let response =  {
                result: 'fail',
                message: 'play_token played the wrong color. It\'s not their turn'
            }
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }

        // Make sure the current play is coming from the expected player
        if(
            ((game.whose_turn === 'light') && (game.player_light.socket != socket.id)) ||
            ((game.whose_turn === 'dark') && (game.player_dark.socket != socket.id))
        ){
            let response =  {
                result: 'fail',
                message: 'play_token played the right color, but by the wrong player'
            }
            socket.emit('play_token_response', response);
            serverLog('play_token_command failed', JSON.stringify(response));
            return;
        }

        let response = {
            result: 'success',
        }
        socket.emit('play_token_response', response);

        // Execute the move
        if(color === 'light') {
            game.board[row][column] = 'l';
            flip_tokens('l', row, column, game.board);
            game.whose_turn = 'dark';
            game.legal_moves = calculate_legal_moves('d', game.board);
        } else if(color === 'dark') {
            game.board[row][column] = 'd';
            flip_tokens('d', row, column, game.board);
            game.whose_turn = 'light';
            game.legal_moves = calculate_legal_moves('l', game.board);
        }

        let d = new Date();
        game.last_move_time = d.getTime();

        send_game_update(socket, game_id, 'played a token');
    });
});

/**********************************/
/* Code related to the game state */

let games = [];

function create_new_game() {
    let new_game= {};
    new_game.player_light = {};
    new_game.player_light.socket = "";
    new_game.player_light.username = "";
    new_game.player_dark = {};
    new_game.player_dark.socket = "";
    new_game.player_dark.username = "";


    var d = new Date();
    new_game.last_move_time = d.getTime();

    new_game.whose_turn = 'dark';
    new_game.board = [
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', 'l', 'd', ' ', ' ', ' '],
        [' ', ' ', ' ', 'd', 'l', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
    ];
    
    new_game.legal_moves = calculate_legal_moves ('d', new_game.board);

    return new_game;
}

function check_line_match(color, dr, dc, r, c, board) {
    if(board[r][c] === color) {
        return true;
    }

    if(board[r][c] === ' ') {
        return false;
    }

    // Check to make sure we aren't going playing off the board
    if((r + dr < 0) || (r + dr > 7)) {
        return false;
    }
    if((c + dc < 0) || (c + dc > 7)) {
        return false;
    }

    return(check_line_match(color, dr, dc, r+dr, c+dc, board));
}

// Return true if r + dr supports playing at r and c + dc supports playing at c
function adjacent_support(who, dr, dc, r, c, board) {
    let other;
    if(who === 'd') {
        other = 'l';
    } else if(who === 'l') {
        other = 'd';
    } else {
        log("Houston, we have a probelm:" + who);
        return false;
    }

    // Check to make sure that the adjacent support is on the board
    if((r + dr < 0) || (r + dr > 7)) {
        return false;
    }
    if((c + dc < 0) || (c + dc > 7)) {
        return false;
    }

    // Check that the opposite color is present
    if(board[r+dr][c+dc] !== other){
        return false;
    }

// Check to make sure that there is space for a matching color to capture tokens
    if((r + dr + dr < 0) || (r + dr + dr > 7)) {
        return false;
    }
    if((c + dc + dc < 0) || (c + dc + dc > 7)) {
        return false;
    }

    return check_line_match(who, dr, dc, r+dr+dr, c+dc+dc, board)

}

function calculate_legal_moves(who, board) {
    let legal_moves = [
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
    ];

    for(let row = 0; row < 8; row++) {
        for(let column = 0; column < 8; column++) {
            if(board[row][column] === ' ') {
                nw = adjacent_support(who, -1, -1, row, column, board);
                nn = adjacent_support(who, -1, 0, row, column, board);
                ne = adjacent_support(who, -1, 1, row, column, board);

                ww = adjacent_support(who, 0, -1, row, column, board);
                ee = adjacent_support(who, 0, 1, row, column, board);
                
                sw = adjacent_support(who, 1, -1, row, column, board);
                ss = adjacent_support(who, 1, 0, row, column, board);
                se = adjacent_support(who, 1, 1, row, column, board);

                if(nw || nn || ne || ww || ee || sw || ss || se) {
                    legal_moves[row][column] = who;
                }
            }
        }
    }
    return legal_moves;
}

function flip_line(who, dr, dc, r, c, board) {
        if((r + dr < 0) || (r + dr > 7)) {
            return false;
        }

        if((c + dc < 0) || (c + dc > 7)) {
            return false;
        }
    
        if(board[r+dr][c+dc] === ' '){
            return false;
        }

        if(board[r+dr][c+dc] === who ){
            return true;
        }

        else {
            if(flip_line(who, dr, dc, r+dr, c+dc, board)) {
                board[r+dr][c+dc] = who;
                return true;
            } else {
                return false;
            }
        }
}

function flip_tokens(who, row, column, board) {
    flip_line(who, -1, -1, row, column, board);
    flip_line(who, -1, 0, row, column, board);
    flip_line(who, -1, 1, row, column, board);

    flip_line(who, 0, -1, row, column, board);
    flip_line(who, 0, 1, row, column, board);
    
    flip_line(who, 1, -1, row, column, board);
    flip_line(who, 1, 0, row, column, board);
    flip_line(who, 1, 1, row, column, board);
}

function send_game_update(socket, game_id, message) { 
    // Check to see if a game with game_id exists
    if((typeof games[game_id] == 'undefined') || (games[game_id] === null)) {
        console.log("No game exists with game_id:" + game_id + ". Making a new game for " + socket.id);
        games[game_id] = create_new_game();
    }

    // Assign this socket a color
    // Send game update
    io.of('/').to(game_id).allSockets().then((sockets) => {

        const iterator = sockets[Symbol.iterator]();
        if(sockets.size >= 1) {
            let first = iterator.next().value;
            if((games[game_id].player_light.socket !== first) &&
                (games[game_id].player_dark.socket !== first)) {
                // Player does not have a color
                if(games[game_id].player_light.socket === "") {
                    // This player should be light token
                    console.log("Light is assigned to: " + first);
                    games[game_id].player_light.socket = first;
                    games[game_id].player_light.username = players[first].username;
                } else if (games[game_id].player_dark.socket === "") {
                    // This player should be dark token
                    console.log("Dark is assigned to: " + first);
                    games[game_id].player_dark.socket = first;
                    games[game_id].player_dark.username = players[first].username;
                } else {
                    // This player should not be in the game room
                    console.log("Removing " + first + " from the game: " + game_id);
                    io.in(first).socketsLeave([game_id]);
                }
            };
        }

        if(sockets.size >= 2) {
            let second = iterator.next().value;
            if((games[game_id].player_light.socket !== second) &&
                (games[game_id].player_dark.socket !== second)) {
                // Player does not have a color
                if(games[game_id].player_light.socket === "") {
                    // This player should be light token
                    console.log("Light is assigned to: " + second);
                    games[game_id].player_light.socket = second;
                    games[game_id].player_light.username = players[second].username;
                } else if (games[game_id].player_dark.socket === "") {
                    // This player should be dark token
                    console.log("Dark is assigned to: " + second);
                    games[game_id].player_dark.socket = second;
                    games[game_id].player_dark.username = players[second].username;
                } else {
                    // This player should not be in the game room
                    console.log("Removing " + second + " from the game: " + game_id);
                    io.in(second).socketsLeave([game_id]);
                }
            };
        }
        
        // Send game update
        let payload = {
            result: 'success',
            game_id: game_id,
            game: games[game_id],
            message: message
        };
        io.of("/").to(game_id).emit('game_update', payload);
    });

    // Check if the game is over
    let legal_moves = 0;
    let lightsum = 0;
    let darksum = 0;

    for(let row = 0; row < 8; row++ ){
        for(let column = 0; column < 8; column++ ){
            if(games[game_id].legal_moves[row][column] !== ' ') {
                legal_moves++
            }
            if(games[game_id].board[row][column] === 'l') {
                lightsum++;
            }
            if(games[game_id].board[row][column] === 'd') {
                darksum++;
            }
        }
    }

    if(legal_moves === 0){
        let winner = "Tie Game";
        if(lightsum > darksum) {
            winner = "light token";
        }
        if(darksum > lightsum) {
            winner = "dark token";
        }
        let payload = {
            result: 'success',
            game_id: game_id,
            game: games[game_id],
            who_won: winner
        }
        io.in(game_id).emit('game_over', payload);

        // Delete old games after one hour
        setTimeout(
            ((id) => {
                return (() => {
                    delete games[id];
                });
            })(game_id), 60 * 60 * 1000
        );
    } 
}
