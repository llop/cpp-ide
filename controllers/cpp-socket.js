var exec = require('child_process').exec;
var gdbmi = require("gdb-mi");

module.exports = function (app, io) {
   
  // socket setup
  io.on('connection', function (socket) {
    console.log('User '+socket.id+' connected!');
    var gdb = new gdbmi();
    attachGdbListeners(socket, gdb);
    
    // used to map breakpoint descriptions coming from UI to indices in gdb
    var breaks = [];
    
    var expressions = [];
    
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
    socket.on('gdb-run', function(execConfig, breakpoints) {
      if (gdb.debugStatus=='active') {
        console.log('Already debugging a program');
        return;
      }
      
      //execConfig = {
      //  name: name,
      //  sourceFiles: sourceFiles,
      //  programName: programName, 
      //  programArgs: programArgs
      //};
      //breakpoints = [{filename: filename, line: line, disabled: disabled}, ...];
      
      // compile:
      // g++ -g -o <programName> <sourceFiles>
      var programName = execConfig.programName;
      var sourceFiles = execConfig.sourceFiles;
      var cmd = ['g++', '-std=c++11', '-g', '-o', programName].concat(sourceFiles).join(' ');
      exec(cmd, function(err, stdout, stderr) {
        if (err) throw err;
        // init debug
        // no need to nest gdb calls, they will be queued and called when everything is good and ready :)
        var programArgs = execConfig.programArgs;
        gdb.load(programName, programArgs, function(data) {
          console.log("PROGRAM LOADED "+programName+', '+JSON.stringify(data));
        });
        // set breakpoints
        breaks = [];
        for (var i=0; i<breakpoints.length; ++i) {
          var bp = breakpoints[i];
          var breakFilename = bp.filename;
          var breakLine = bp.line;
          var breakArgs = breakFilename+':'+breakLine;
          gdb.insertBreakpoint([breakArgs], function(data) {
            // if successful, insert breakpoint mapping into our list and disable if need be
            if (data.class=='done') {
              var newBreakpoint = {id:data.result.bkpt.number, breakpoint:bp};
              breaks.push(newBreakpoint);
              if (bp.disabled) {
                gdb.disableBreakpoints([newBreakpoint.id], function(data) {
                  
                });
              }
            }
            // if we fail, we do so silently. Assume bad breakpoints are for another program or something
          });
        }
        // run debug
        gdb.run([], function(data) {
          console.log("PROGRAM RUNNING "+programName+', '+JSON.stringify(data));
        });
      });
    });
    
    socket.on('gdb-pause', function() {
      console.log('gdb-pause');
      gdb.pause(function(data) {
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
        console.log('gdb-stop '+JSON.stringify(data));
      });
    });

    socket.on('gdb-step-over', function() {
      console.log('gdb-step-over');
      gdb.stepOver(function(data) {
        console.log('gdb-step-over '+JSON.stringify(data));
      });
    });
    socket.on('gdb-step-in', function() {
      console.log('gdb-step-in');
      gdb.stepIn(function(data) {
        console.log('gdb-step-in '+JSON.stringify(data));
      });
    });
    socket.on('gdb-step-out', function() {
      console.log('gdb-step-out');
      gdb.stepOut(function(data) {
        console.log('gdb-step-out '+JSON.stringify(data));
      });
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
    socket.on('gdb-set-var-value', function(varName, varValue) {
      console.log("SET VAR VALUE: "+varName+' '+varValue);
      gdb.setVariableValue(varName, varValue, function(data) {
        console.log("VAR SET RESULT "+JSON.stringify(data));
        // send var list down the socket anyway?
      });
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
    
    //var listData = [];
    //setTimeout(function() {
    //  if (listData.length == 0)  listData = [
    //      {id: 1, values: ["x","int","10"]},
    //      {id: 2, values: ["s","string","eo"]}
    //    ];
    //  else listData = [];
    //  console.log(listData);
    //  socket.emit("gdb-var-list", listData);
    //  
    //}, 2000);
    
    socket.on('disconnect', function() {
      // cancel debugging session!?
      console.log('User '+socket.id+' disconnected!');
      gdb.destroy();
      // TODO: remove all listeners! (make anonympus functions named, and remove one by one...)
    });
    
  });
  
  
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
      // return state: running, stopped?
      var dataPack = { stateData: data };
      if (data.class=='stopped') {
        // vars list
        // TODO: expressions
        // TODO: frames
        gdb.listVariables(["--skip-unavailable", "--simple-values"], function(varsData) {
          if (varsData.class=="done") {
            dataPack['varsData'] = varsData;
          }
          socket.emit('gdb-state-change', dataPack);
        });
      } else {
        // emit running right away!
        socket.emit('gdb-state-change', dataPack);
      }
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
      socket.emit('gdb-app-out', data);
    });
    gdb.on('appErr', function(data) {
      console.log("appErr: " + data);
      //socket.emit('gdb-app-err', data);
    });
    gdb.on('gdbOut', function(data) {
      console.log("gdbOut: " + data);
      //socket.emit('gdb-out', data);
    });
    gdb.on('gdbErr', function(data) {
      console.log("gdbErr: " + data);
      //socket.emit('gdb-err', data);
    });

  }
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
