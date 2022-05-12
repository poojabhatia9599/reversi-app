/********************/
/*SET UP STATIC FILE SERVER*/
let static = require('node-static');
let http = require('http');

let port = process.env.PORT;
let directory = __dirname + '/public';

if ((typeof port == 'undefined') || (port === null)) {
    port = 8080;
    directory = './public';
}

let file = new static.Server(directory);

let app = http.createServer(
    function (request, response) {
        request.addListener('end',
            function () {
                file.serve(request, response);
            }
        ).resume();
    }
).listen(port);

console.log('Pooja\'s server is running');



/********************/
/*SET UP WEB SOCKET SERVER*/

const { Server } = require("socket.io");
const io = new Server(app);

io.on('connection', (socket) => {
    function serverLog(...messages) {
        io.emit('log', ['**** Message from the server:\n']);
        messages.forEach((item) => {
            io.emit('log', ['****\t' + item]);
            console.log(item);
        });
    }

    serverLog('a page connected to the server: ' + socket.id);

    socket.on('disconnect', () => {
        serverLog('a page disconnected from the server: ' + socket.id);
    });

    /* join_room command handler */
    /* expected payload:
     {
         'room' : the room 
     }
     */
    socket.on('join_room', (payload) => {
        serverLog('Server received a command', '\'join_room\'', JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || payload === null) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        if ((typeof room == 'undefined') || room === null) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to join';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || username === null) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room username to join the chat room';
            socket.emit('join_room_response', response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
        }

        /* Handle the command */
        socket.join(room);

        /* Make sure the client was put in the room */
        io.in(room).fetchSockets().then((sockets) => {
            serverLog('There are ' + sockets.length + ' clients in the room, ' + room);
            /* Socket didn't join the room */
            if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.includes(socket)) {
                response = {};
                response.result = 'fail';
                response.message = 'Server internal error joing chat room';
                socket.emit('join_room_response', response);
                serverLog('join_room command failed', JSON.stringify(response));
                return;
            }
            else {
                response = {};
                response.result = 'success';
                response.room = room;
                response.username = username;
                response.count = sockets.length;
                /* Tell everyone that a new user has joined the chat room*/
                io.of('/').to(room).emit('join_room_response', response);
                serverLog('join_room succeeded', JSON.stringify(response));
            }

        });
    });

    /* send_chat_message command handler */
    /* expected payload:
     {
       
     }
     */
    socket.on('send_chat_message', (payload) => {
        serverLog('Server received a command', '\'send_chat_message\'', JSON.stringify(payload));
        /* Check that the data coming from the client is good */
        if ((typeof payload == 'undefined') || payload === null) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a payload';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        let room = payload.room;
        let username = payload.username;
        let message = payload.message;
        if ((typeof room == 'undefined') || room === null) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room to message';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof username == 'undefined') || username === null) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid room username as a message source';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }
        if ((typeof message == 'undefined') || message === null) {
            response = {};
            response.result = 'fail';
            response.message = 'client did not send a valid message';
            socket.emit('send_chat_message_response', response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
        }

        /* Handle the command */
        let response = {};
        response.result = 'success';
        response.username = username;
        response.room = room;
        response.message = message;
        /* Tell everyone in the room what the message is*/
        io.of('/').to(room).emit('send_chat_message_response', response);
        serverLog('send_chat_message command succeeded', JSON.stringify(response));
    });
});