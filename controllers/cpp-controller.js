var gdbMI = require('gdb-mi');


function cppController(io) {
  
  var me = this;
  
  me.gdb = undefined;
  
  
  io.on('connection', function (socket) {
    console.log('User '+socket.id+' connected! GDB');
    
    //----------------------------------------------------------------------------
    // 
    // socket event handling
    // 
    //----------------------------------------------------------------------------
    function _gdbStopHandler() {
      console.log('gdb-stop ');
      me.gdb.stop(function(data) {
        console.log("GDB stopped "+JSON.stringify(data));
      });
    }
    function _gdbPauseHandler() {
      console.log('gdb-pause ');
      me.gdb.pause(function(data) {
        console.log("GDB paused "+JSON.stringify(data));
      });
    }
    function _gdbContinueHandler() {
      console.log('gdb-continue ');
      me.gdb.continue(function(data) {
        console.log("GDB continuing "+JSON.stringify(data));
      });
    }
    function _gdbStepOverHandler() {
      console.log('gdb-step-over ');
    }
    function _gdbStepInHandler() {
      console.log('gdb-step-in ');
    }
    function _gdbStepOutHandler() {
      console.log('gdb-step-out ');
    }
    function _gdbSetVarValueHandler(varName, varValue) {
      console.log('gdb-set-var-value '+varName+' '+varValue);
      me.gdb.setVariableValue(varName, varValue, function(data) {
        console.log("VAR SET RESULT "+JSON.stringify(data));
        // send var list down the socket anyway?
      });
    }
    function _gdbSetSelectedFrameHandler() {
      console.log('gdb-set-selected-frame ');
    }
    function _gdbEvalExpressionHandler() {
      console.log('gdb-eval-expression ');
    }
    function _gdbInsertBreakHandler() {
      console.log('gdb-insert-break ');
    }
    function _gdbDeleteBreakHandler() {
      console.log('gdb-delete-break ');
    }
    function _gdbEnableBreakHandler() {
      console.log('gdb-enable-break ');
    }
    function _gdbDisableBreakHandler() {
      console.log('gdb-disable-break ');
    }
    function _gdbAppInHandler(data) {
      console.log('gdb-app-in '+data);
      me.gdb.appStdin.write(data);
    }

    function _addSocketListeners() {
      socket.on('gdb-stop', _gdbStopHandler);
      socket.on('gdb-pause', _gdbPauseHandler);
      socket.on('gdb-continue', _gdbContinueHandler);
      socket.on('gdb-step-over', _gdbStepOverHandler);
      socket.on('gdb-step-in', _gdbStepInHandler);
      socket.on('gdb-step-out', _gdbStepOutHandler);
      socket.on('gdb-set-var-value', _gdbSetVarValueHandler);
      socket.on('gdb-set-selected-frame', _gdbSetSelectedFrameHandler);
      socket.on('gdb-eval-expression', _gdbEvalExpressionHandler);
      socket.on('gdb-insert-break', _gdbInsertBreakHandler);
      socket.on('gdb-delete-break', _gdbDeleteBreakHandler);
      socket.on('gdb-enable-break', _gdbEnableBreakHandler);
      socket.on('gdb-disable-break', _gdbDisableBreakHandler);
      socket.on('gdb-app-in', _gdbAppInHandler);
    }
    function _removeSocketListeners() {
      socket.removeListener('gdb-stop', _gdbStopHandler);
      socket.removeListener('gdb-pause', _gdbPauseHandler);
      socket.removeListener('gdb-continue', _gdbContinueHandler);
      socket.removeListener('gdb-step-over', _gdbStepOverHandler);
      socket.removeListener('gdb-step-in', _gdbStepInHandler);
      socket.removeListener('gdb-step-out', _gdbStepOutHandler);
      socket.removeListener('gdb-set-var-value', _gdbSetVarValueHandler);
      socket.removeListener('gdb-set-selected-frame', _gdbSetSelectedFrameHandler);
      socket.removeListener('gdb-eval-expression', _gdbEvalExpressionHandler);
      socket.removeListener('gdb-insert-break', _gdbInsertBreakHandler);
      socket.removeListener('gdb-delete-break', _gdbDeleteBreakHandler);
      socket.removeListener('gdb-enable-break', _gdbEnableBreakHandler);
      socket.removeListener('gdb-disable-break', _gdbDisableBreakHandler);
      socket.removeListener('gdb-app-in', _gdbAppInHandler);
    }

    //----------------------------------------------------------------------------
    // 
    // gdb event handling
    // 
    //----------------------------------------------------------------------------
    function _gdbAppOutHandler(data) {
      console.log('app-out '+data);
      socket.emit('gdb-app-out', data);
    }
    function _gdbOutHandler(data) {
      console.log('gdb-out '+data);
    }
    function _gdbErrHandler(data) {
      console.log('gdb-err '+data);
    }
    function _gdbExecStateChangeHandler(data) {
      console.log('gdb-exec-state-change '+data);
      socket.emit('gdb-exec-state-change', data);
      if (data=='stopped') {
        me.gdb.listVariables(['--simple-values'], function(data) {
          console.log("list variables "+JSON.stringify(data));
          socket.emit('gdb-list-variables', data);
        });
      }
    }
    function _gdbDebugStateChangeHandler(data) {
      console.log('gdb-debug-state-change '+data);
      socket.emit('gdb-debug-state-change', data);
      if (data=='idle') {
        _removeGdbListeners();
      }
    }

    function _addGdbListeners() {
      me.gdb.on('app-out', _gdbAppOutHandler);
      me.gdb.on('gdb-out', _gdbOutHandler);
      me.gdb.on('gdb-err', _gdbErrHandler);
      me.gdb.on('gdb-exec-state-change', _gdbExecStateChangeHandler);
      me.gdb.on('gdb-debug-state-change', _gdbDebugStateChangeHandler);
    }
    function _removeGdbListeners() {
      me.gdb.removeListener('app-out', _gdbAppOutHandler);
      me.gdb.removeListener('gdb-out', _gdbOutHandler);
      me.gdb.removeListener('gdb-err', _gdbErrHandler);
      me.gdb.removeListener('gdb-exec-state-change', _gdbExecStateChangeHandler);
      me.gdb.removeListener('gdb-debug-state-change', _gdbDebugStateChangeHandler);
    }
    
    me.gdb = new gdbMI();
    me.breaks = [];
    
    socket.on('gdb-run', function(config, breakpoints) {
      console.log('gdb-run ');
      
      //config = {
      //  name: 'main.cc',
      //  sourceFiles: ['/home/llop/Llop/FIB/TFG/main.cc', '/home/llop/Llop/FIB/TFG/main2.cc'],
      //  programName: '/home/llop/Llop/FIB/TFG/main', 
      //  programArgs: ['a', 'beef']
      //};
      var programName = config.programName;
      var programArgs = config.programArgs;
      
      //------------------------------------------------------------------------
      // 1 - load debug session
      //------------------------------------------------------------------------
      me.gdb.load(programName, programArgs, function(data) {
        console.log('gdb loaded '+JSON.stringify(data));
        _addGdbListeners();
        
        //----------------------------------------------------------------------
        // 2 - set breakpoints
        //----------------------------------------------------------------------
        me.breaks = [];
        for (var i=0; i<breakpoints.length; ++i) {
          var bp = breakpoints[i];
          var breakFilename = bp.filename;
          var breakLine = bp.line;
          var breakArgs = breakFilename+':'+breakLine;
          console.log("BREAK "+breakArgs);
          me.gdb.insertBreakpoint([breakArgs], function(data) {
            // if successful, insert breakpoint mapping into our list
            // if we fail, we do so silently. Assume bad breakpoints are for another program
            if (data.class=='done') {
              var newBreakpoint = {id:data.result.bkpt.number, breakpoint:bp};
              me.breaks.push(newBreakpoint);
              // disable if need be
              if (bp.disabled) {
                me.gdb.disableBreakpoints([newBreakpoint.id], function(data) {
                  // do nothing, should always succeed
                });
              }
            }
          });
        }
        
        //----------------------------------------------------------------------
        // 3 - start program execution
        //----------------------------------------------------------------------
        me.gdb.run(function(data) {
          console.log("GDB started "+JSON.stringify(data));
        });
        
      });
    });
    _addSocketListeners();
    socket.on('disconnect', function() {
      console.log('User '+socket.id+' disconnected! GDB');
      _removeSocketListeners();
      me.gdb.reset();
    });
    
  });
  
};


module.exports = cppController;

