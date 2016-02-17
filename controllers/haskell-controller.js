module.exports = function(io) {
  
  io.on('connection', function (socket) {
    console.log('User '+socket.id+' connected! HASKELL');
    socket.on('disconnect', function() {
      console.log('User '+socket.id+' disconnected! HASKELL');
    });
  });
  
};


