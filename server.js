/*global console*/
var express = require('express'),
    app = express(),
    crypto = require('crypto'),
    config = require('getconfig'),
    cookieParser = require('cookie-parser'),
    session = require('express-session'),
    port = parseInt(process.env.PORT || config.server.port, 10),
    COOKIE_SECRET = 'ola ke ase',
    io;

var db = {
 users: [{
   id: 1,
   name: 'Fran'
  }, {
   id: 2,
   name: 'Eva'
  }, {
   id: 3,
   name: 'Kalea',
   cookie: 'algo'
  }
 ],
 rooms: {
  1: {
   name: 'Core',
   allowed_users: [1,2,3]
  },
  2: {
   name: 'Fran - Eva private channel',
   allowed_users: [1,2]
  },
  3: {
   name: 'Eva - Kalea private channel',
   allowed_users: [2,3]
  }
 }
};


app.use(cookieParser());
app.use(session({secret: COOKIE_SECRET}))
app.use(function(req, res, next) {
  req.session.user = db.users[req.query.user_id];
  next();
});
app.use(express.static(__dirname + '/public'));

io = require('socket.io').listen(app.listen(port));

var httpUrl;
if (config.server.secure) {
  httpUrl = "https://localhost:" + port;
} else {
  httpUrl = "http://localhost:" + port;
}

console.log('signal master is running at: ' + httpUrl);




io.use(function (socket, next) {
  if (!socket.handshake.query || socket.handshake.query.user_id === undefined) {
    next(new Error('Authentication error'));
    return;
  }

  socket.handshake.user = db.users[socket.handshake.query.user_id];
  next();
});

function describeRoom(name) {
  var clients = io.sockets.adapter.rooms[name];
  var numClients = clientsInRoom(name);
  var result = { clients: {} };

  for (var clientId in clients ) {
   var client = io.sockets.connected[clientId];
   result.clients[client.id] = client.resources;
  }

  return result;
}

function clientsInRoom(name) {
  var clients = io.sockets.adapter.rooms[name];
  return (typeof clients !== 'undefined') ? Object.keys(clients).length : 0;
}

function safeCb(cb) {
  if (typeof cb === 'function') {
    return cb;
  } else {
    return function () {};
  }
}

function removeFeed(socket, type) {
  if (!socket) return;

  if (socket.room) {
    io.sockets.in(socket.room).emit('remove', {
      id: socket.id,
      type: type
    });
    if (!type) {
      socket.leave(socket.room);
      socket.room = undefined;
    }
  }
}

io.on('connection', function (socket) {
  socket.resources = {
    video: true,
    audio: true,
    screen: false
  };

  socket.on('join', function (name, cb) {
    // check if maximum number of clients reached
    if (config.rooms && config.rooms.maxClients > 0 &&
     clientsInRoom(name) >= config.rooms.maxClients) {
      safeCb(cb)('full');
      return;
    }

    // sanity check
    if (typeof name !== 'string') return;

    // Check user permissions
    console.log('Joined to', name);

    // leave any existing rooms
    removeFeed(socket);
    safeCb(cb)(null, describeRoom(name));
    socket.join(name);
    socket.room = name;
  });

  // pass a message to another id
  socket.on('message', function (details) {
    if (!details) return;

    var otherClient = io.sockets.sockets[details.to];
    if (!otherClient) return;

    details.from = socket.id;
    otherClient.emit('message', details);
  });

  socket.on('shareScreen', function () {
    socket.resources.screen = true;
  });

  socket.on('unshareScreen', function (type) {
    socket.resources.screen = false;
    removeFeed('screen');
  });

  // we don't want to pass "leave" directly because the
  // event type string of "socket end" gets passed too.
  socket.on('disconnect', function () {
    removeFeed();
  });
  socket.on('leave', function () {
    removeFeed();
  });

  socket.on('create', function (name, cb) {
    console.log('on create');
    if (arguments.length == 2) {
      cb = (typeof cb == 'function') ? cb : function () {};
      name = name || uuid();
    } else {
      cb = name;
      name = uuid();
    }
    // check if exists
    if (io.sockets.clients(name).length) {
      safeCb(cb)('taken');
    } else {
      join(name);
      safeCb(cb)(null, name);
    }
  });

  // support for logging full webrtc traces to stdout
  // useful for large-scale error monitoring
  socket.on('trace', function (data) {
    console.log('trace', JSON.stringify(
      [data.type, data.session, data.prefix, data.peer, data.time, data.value]
    ));
  });


  // tell socket about stun and turn servers and generate nonces
  socket.emit('stunservers', config.stunservers || []);

  // create shared secret nonces for TURN authentication
  // the process is described in draft-uberti-behave-turn-rest
  var credentials = [];
  config.turnservers.forEach(function (server) {
    var hmac = crypto.createHmac('sha1', server.secret);
    // default to 86400 seconds timeout unless specified
    var username = Math.floor(new Date().getTime() / 1000) + (server.expiry || 86400) + "";
    hmac.update(username);
    credentials.push({
      username: username,
      credential: hmac.digest('base64'),
      url: server.url
    });
  });
  socket.emit('turnservers', credentials);
});


if (config.uid) process.setuid(config.uid);
