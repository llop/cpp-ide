var gdbmi = require("gdb-mi");

function attachGdbListeners(socket, gdb) {
  //---------------------------------------------------------------
  // 
  // wire all gdb events
  //
  //---------------------------------------------------------------
  gdb.on('gdbConsoleOut', function(data) {
    console.log("gdbConsoleOut: " + JSON.stringify(data));
    //socket.emit('data', data);
  });
  gdb.on('gdbInternalsOut', function(data) {
    console.log("gdbInternalsOut: " + JSON.stringify(data));
    //socket.emit('data', data);
  });
  gdb.on('gdbTargetOut', function(data) {
    console.log("gdbTargetOut: " + JSON.stringify(data));
    //socket.emit('data', data);
  });
  gdb.on('gdbStateChange', function(data) {
    console.log("gdbStateChange: " + JSON.stringify(data));
    //socket.emit('data', data);
  });
  gdb.on('gdbInfo', function(data) {
    console.log("gdbInfo: " + JSON.stringify(data));
    //socket.emit('data', data);
  });
  gdb.on('gdbCommandResponse', function(data) {
    console.log("gdbCommandResponse: " + JSON.stringify(data));
    //socket.emit('data', data);
  });
  gdb.on('gdbProgress', function(data) {
    console.log("gdbProgress: " + JSON.stringify(data));
    //socket.emit('data', data);
  });
  gdb.on('appOut', function(data) {
    console.log("appOut: " + data);
    socket.emit('appOut', data);
  });
  gdb.on('appErr', function(data) {
    console.log("appErr: " + data);
    socket.emit('appErr', data);
  });
  gdb.on('gdbOut', function(data) {
    console.log("gdbOut: " + data);
    socket.emit('gdbOut', data);
  });
  gdb.on('gdbErr', function(data) {
    console.log("gdbErr: " + data);
    socket.emit('gdbErr', data);
  });
      
}

module.exports = function (app, io) {
  // make stuff accessible
  app.io = io;
   
  // socket setup
  io.on('connection', function (socket) {
    console.log('User '+socket.id+' connected!');
    var gdb = new gdbmi();
    attachGdbListeners(socket, gdb);
    
    //---------------------------------------------------------------
    // 
    // debugger input events:
    //   run
    //   pause
    //   continue
    //   stop
    // 
    //   step over
    //   step in
    //   step out
    //   
    //   insert breakpoint
    //   delete breakpoint
    //   enable breakpoint
    //   disable breakpoint
    //   
    //   eval expression
    //   set var value
    //   set selected frame
    //   
    //   app (debugee) input
    //   
    //---------------------------------------------------------------
    socket.on('gdb-run', function(options) {
      // options must contain run configuration:
      //   - program name and args
      console.log('gdb-run'+JSON.stringify(options));
      var programName = options.programName;
      var programArgs = options.programArgs;
      gdb.run(programName, programArgs, function(data) {
        console.log('debug-started '+JSON.stringify(data));
        socket.emit('debug-started', data);
      });
    });
    socket.on('gdb-pause', function() {
      console.log('gdb-pause');
      gdb.continue(function(data) {
        console.log('gdb-pause '+JSON.stringify(data));
      });
    });
    socket.on('gdb-continue', function() {
      console.log('gdb-continue');
      var options = [];
      gdb.continue(options, function(data) {
        console.log('gdb-continue '+JSON.stringify(data));
      });
    });
    socket.on('gdb-stop', function() {
      console.log('gdb-stop');
      gdb.stop(function(data) {
        console.log('gdb-pause '+JSON.stringify(data));
      });
    });

    socket.on('gdb-step-over', function() {
      console.log('gdb-step-over');
    });
    socket.on('gdb-step-in', function() {
      console.log('gdb-step-in');
    });
    socket.on('gdb-step-out', function() {
      console.log('gdb-step-out');
    });

    socket.on('gdb-break-insert', function(options) {
      console.log('gdb-break-insert'+JSON.stringify(options));
    });
    socket.on('gdb-break-delete', function(options) {
      console.log('gdb-break-delete'+JSON.stringify(options));
    });
    socket.on('gdb-break-enable', function(options) {
      console.log('gdb-break-enable'+JSON.stringify(options));
    });
    socket.on('gdb-break-disable', function(options) {
      console.log('gdb-break-disable'+JSON.stringify(options));
    });

    socket.on('gdb-eval-expression', function(options) {
      console.log('gdb-eval-expression'+JSON.stringify(options));
    });
    socket.on('gdb-set-var-value', function(colIdx, oldValue, newValue) {
      console.log("SET VAR VALUE: "+colIdx+' '+oldValue+' '+newValue);
    });
    socket.on('gdb-set-selected-frame', function(options) {
      console.log('gdb-set-selected-frame'+JSON.stringify(options));
    });

    socket.on('gdb-app-in', function(data) {
      console.log('gdb-app-in '+data);
      gdb.appStdin.write(data);
    });
    
    //---------------------------------------------------------------
    // 
    // more socket events
    // 
    //---------------------------------------------------------------
    
    socket.on('disconnect', function() {
      // cancel debugging session!?
      console.log('User '+socket.id+' disconnected!');
      gdb.destroy();
      // TODO: remove all listeners! (make anonympus functions named, and remove one by one...)
    });
    
    setTimeout(function() {
      var options = {
        programName: "/home/llop/Llop/FIB/TFG/a.out",
        programArgs: []
      };
      console.log('simulated gdb-run'+JSON.stringify(options));
      gdb.run(options.programName, options.programArgs, function(data) {
        console.log('debug-started '+JSON.stringify(data));
        socket.emit('debug-started', data);
        gdb.continue([], function(data) {
          console.log('debug-resumed '+JSON.stringify(data));
        });
      });
    }, 2000);
  });
};






// entxufar joc de proves des d'un fitxer
//var fs = require('fs');
//var jocDeProves = fs.createReadStream('/home/llop/Llop/FIB/TFG/in.txt');

//gdb.load("/home/llop/Llop/FIB/TFG/a.out", [], function(data) {
//  gdb.run([], function(data) {   // --start: break at main
//    gdb.pipeToAppIn(jocDeProves);
//  });
//});

/*
gdb.load("/home/llop/Llop/FIB/TFG/a.out", [], function(data) {
  gdb.run(function(data) {
    gdb.pipeToAppIn(jocDeProves);
    console.log("RUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUN");
    setTimeout(function() {
      gdb.stop(function(data) {
        console.log("DUUUUUUUUUUUUMMMMMM: "+JSON.stringify(data));
        setTimeout(function() {
          gdb.run(function(data) {
            gdb.appInWrite("1 2 3\n");
            setTimeout(function() {
              gdb.stop(function(data) {
                console.log("DOMMMMMM: "+JSON.stringify(data));
              });
            }, 500);
          });
        }, 2000);
      });
    }, 500);
  });
});
*/
