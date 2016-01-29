//----------------------------------------------
// Express webserver
//----------------------------------------------

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

//----------------------------------------------
// Express app setup
//----------------------------------------------

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


//----------------------------------------------
// node-gdb setup
//----------------------------------------------

var socket;
var buff = [];

var nodegdb = require("./node-gdb/node-gdb.js");
var gdb = new nodegdb();
app.gdb = gdb;

// Listen to all events
gdb.on('gdbConsoleOutput', function(data) {
  console.log("gdbConsoleOutput: " + JSON.stringify(data));
});
gdb.on('gdbInternalsOutput', function(data) {
  console.log("gdbInternalsOutput: " + JSON.stringify(data));
});
gdb.on('gdbStateChange', function(data) {
  console.log("gdbStateChange: " + JSON.stringify(data));
});
gdb.on('gdbInfo', function(data) {
  console.log("gdbInfo: " + JSON.stringify(data));
});
gdb.on('gdbCommandResponse', function(data) {
  console.log("gdbCommandResponse: " + JSON.stringify(data));
});
gdb.on('gdbProgress', function(data) {
  console.log("gdbProgress: " + JSON.stringify(data));
});
gdb.on('appOut', function(data) {
  console.log("appOut: " + data);
});
gdb.on('appErr', function(data) {
  console.log("appErr: " + data);
});
gdb.on('gdbOut', function(data) {
  console.log("gdbOut: " + data);
});
gdb.on('gdbErr', function(data) {
  console.log("gdbErr: " + data);
});


gdb.on('appOut', function(data) {
  return !socket ? buff.push(data) : socket.emit('data', data);
});
gdb.on('appErr', function(data) {
  return !socket ? buff.push(data) : socket.emit('data', data);
});


// entxufar joc de proves des d'un fitxer
//var fs = require('fs');
//var jocDeProves = fs.createReadStream('/home/llop/Llop/FIB/TFG/in.txt');
//jocDeProves.pipe(gdb.appIn);

// hardcodejar input
// gdb.appIn.write("23 45\n");


//----------------------------------------------
// socket.io setup
// http://stackoverflow.com/questions/24609991/using-socket-io-in-express-4-and-express-generators-bin-www
//----------------------------------------------

var socketio = require('socket.io');
var io = socketio();
app.io = io;

io.on('connection', function (s) {
  socket = s;
  socket.on('data', function(data) {
    //console.log(JSON.stringify(data));
    gdb.appIn.write(data);
  });
  socket.on('disconnect', function() {
    socket = null;
  });
  while (buff.length) {
    socket.emit('data', buff.shift());
  }
});


//----------------------------------------------
// Routes
//----------------------------------------------
var routes = require('./routes/index');
var wfile = require('./routes/wfile');
var debug = require('./routes/debug');
//var users = require('./routes/users');

app.use('/', routes);
app.use('/wfile', wfile);
app.use('/debug', debug(app.gdb));
//app.use('/users', users);



// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
