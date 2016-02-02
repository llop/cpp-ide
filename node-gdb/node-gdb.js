//-----------------------------------------------------------
// Modules
//-----------------------------------------------------------

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var events = require('events');
var fs = require('fs');
var mknod = require('mknod');
var os = require('os');
var path = require('path');


//-----------------------------------------------------------
// String helper functions
//-----------------------------------------------------------

function stringStartsWith(str, prefix) {
  return str.slice(0, prefix.length)==prefix;
}
function isEmpty(str) {
  return !str || 0===str.length;
}
function trim(str) {
  if (str) str = str.trim();
  return str;
}
function writeBlanks(str, i, j) {
  var blanks = "";
  while (i <= j) {
    blanks.concat(' ');
    ++i;
  }
  return str.substr(0, i).concat(blanks).concat(str.substr(j+1));
}

function back(arr) {
  if (arr && arr.length>0) return arr[arr.length-1];
  return undefined;
}

//-----------------------------------------------------------
// gdb output helper functions
//-----------------------------------------------------------

/*
 * About GDB MI output
 * https://sourceware.org/gdb/onlinedocs/gdb/GDB_002fMI-Output-Syntax.html
 * Notes:
 *   * All output sequences end in a single line containing a period.
 *   * The token is from the corresponding request. Note that for all async output, while the token is allowed by 
 *     the grammar and may be output by future versions of gdb for select async output messages, it is generally omitted. 
 *     Frontends should treat all async output as reporting general changes in the state of the target 
 *     and there should be no need to associate async output to any prior command.
 *   * status-async-output contains on-going status information about the progress of a slow operation. It can be discarded. 
 *     All status output is prefixed by ‘+’.
 *   * exec-async-output contains asynchronous state change on the target (stopped, started, disappeared). 
 *     All async output is prefixed by ‘*’.
 *   * notify-async-output contains supplementary information that the client should handle (e.g., a new breakpoint information). 
 *     All notify output is prefixed by ‘=’.
 *   * console-stream-output is output that should be displayed as is in the console. It is the textual response to a CLI command. 
 *     All the console output is prefixed by ‘~’.
 *   * target-stream-output is the output produced by the target program. All the target output is prefixed by ‘@’.
 *   * log-stream-output is output text coming from gdb's internals, for instance messages that should be displayed 
 *     as part of an error log. All the log output is prefixed by ‘&’.
 *   * New gdb/mi commands should only output lists containing values.
 */
function resultToJSON(str) {
  if (isEmpty(str)) return {};
  // put quotes around variables, and turn '=' into ':'
  str = str.replace(/=/g, '!:');
	str = str.replace(/([a-zA-Z0-9-]*)!:/g, '\"$1\":');
  // GDB puts labels in arrays: strip them
  var stack = [ -1 ];
  for (var i = 0; i < str.length; ++i) {
    var ch = str[i];
    // stack tells us where we are (inside array or object)
    if (ch == '{') stack.push(0);
    else if (ch == '[') stack.push(1);
    else if (ch == '}' || ch == ']') stack.pop();
    // delete label inside array
    if (stack[stack.length-1]==1 && (str[i]==','||str[i]=='[') && str[i+1]=='\"') {
      var j = i + 1;
      while (j<str.length && str[j]!=':' && str[j]!='=' && str[j]!=']') ++j;
      if (j<str.length && (str[j]==':'||str[j]=='=')) str = writeBlanks(str, i, j);
    }
  }
  // return as JSON
  try {
    return JSON.parse('{'.concat(str).concat('}'));
  } catch (err) {
    console.log('Error parsing result: ' + err);
  }
  return {};
}


var streamRecordClass = {
  '~': 'console-stream-output',
  '&': 'log-stream-output',
  '@': 'target-stream-output'
};
function parseStreamRecordResult(line) {
  // result class
  var prefix = line[0];
  var klass = streamRecordClass[prefix];
  // and result data (in this case, a plain string)
  // console and internals output are plain strings
  line = trim(line.substr(1));
  if (line[0]=='"' && line[line.length-1]=='"') line = trim(line.substr(1, line.length-2));
  line = line.replace(/\\"/g, '\"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  var result = '\"'.concat(line).concat('\"');
  return { class: klass, result: result };
}
function parseExecRecordResult(line) {
  // output class and result
  var i = 1;
  while (i<line.length && line[i]!=',') ++i;
  var klass = trim(line.substring(1, i));
  var result = resultToJSON(trim(line.substr(i+1)));
  return { class: klass, result: result };
}

function isStreamRecord(prefix) {
  return prefix=='~' || prefix=='&' || prefix=='@';
}
function isNotifyOutput(prefix) {
  return prefix=='=' || prefix=='+';
}


// lines' first character tells us what type of gdb output event we have to fire
var prefixToGdbEvent = {
  '~': 'gdbConsoleOut',         // these are the 'stream records'
  '&': 'gdbInternalsOut',       // they are usually junk
  '@': 'gdbTargetOut',
  
  '^': 'gdbCommandResponse',    // these are the 'async record'
  '*': 'gdbStateChange',        // to simplify, let's call these 2 'exec out records'
  
  '=': 'gdbInfo',               // and these 2 'notify out records'
  '+': 'gdbProgress'
};

// This array only allows up to a certain number of elements
function BArray(maxElems) {
  Array.call(this);
  Object.setPrototypeOf(BArray.prototype, Array.prototype);
  BArray.prototype.push = function(value) {
    while (this.length>=maxElems) this.shift();
    Array.prototype.push.call(this, value);
  };
}


function randTempFilePath() {
  var now = new Date();
  var rn = Math.round(Math.random()*1e9);
  var filename = ["gdb-fifo-", now.getYear(), now.getMonth(), now.getDate(), '-', rn].join('');
  return os.tmpdir().concat(path.sep).concat(filename);
}


//-----------------------------------------------------------
// Main gdb instance
// 
// https://sourceware.org/gdb/onlinedocs/gdb/GDB_002fMI-General-Design.html#GDB_002fMI-General-Design
// 
//-----------------------------------------------------------

function nodeGdb(gdbArgs) {
  
  // reference to this instance for callbacks
  var me = this;
  
  //----------------------------------------------------------------------------------
  //
  // ready event handling (nodeGdb needs to do some setup before it can be used)
  //
  //----------------------------------------------------------------------------------

  // we'll emit the ready event when we have:
  //  - created the 3 FIFOs for the debugee's IO
  //  - gdb has signaled it's ready for input
  var fifoCnt = 0;
  var gdbReady = false;
  var readyEmitted = false;
  var readyCalledOnce = false;
  var readyFunc;
  
  function readyCheck() {
    if (!readyEmitted && gdbReady && fifoCnt==3) {
      readyEmitted = true;
      readyFunc();
    }
  }
  
  // sets a callback that gets invoked once after the class is ready to be used
  // if t
  nodeGdb.prototype.ready = function(callback) {
    if (!readyCalledOnce) {
      readyCalledOnce = true;
      if (readyEmitted) callback();
      else readyFunc = callback;
    }
  };
  
  
  //-----------------------------------------------------------
  // private functions
  //-----------------------------------------------------------
  
  // issues the given command if possible (interactive mode), otherwise enqueues it for later execution
  // args is an array containing command arguments
  // callback is a function that will get executed when the debugger goes back to interactive mode
  // return value indicates if the command got through to the debugger
  function enqueueCommand(name, args, callback) {
    function commandFunc() {
      interactive = false;
      gdbInteractiveCallback = callback;
      var cmd = name.concat(' ').concat(args.join(' ')).concat('\n');
      //console.log("CMD: "+cmd);
      gdbIn.write(cmd);
    };
    if (interactive) commandFunc();
    else commadQueue.push(commandFunc);
  };
  
  // run the next command in the queue
  function execNextQueuedCommand() {
    if (interactive && commadQueue.length>0) {
      var nextCommand = commadQueue.shift();
      nextCommand();
    }
  }
  
  // execute the last issued command's callback
  function execCommandCallback() {
    var callback = gdbInteractiveCallback;
    var result = back(execOutRecords);
    gdbInteractiveCallback = undefined;
    callback(result);
  }
  
  function processStreamRecord(prefix, result) {
    // just log
    streamRecords.push(result);
  }
  
  function processNotifyOutput(prefix, result) {
    // store PID and thread group id of the debugee
    if (prefix=='=') {
      if (result.class=='thread-group-started') {
        var programPid = result.result.pid;
        var threadGroupId = result.result.id;
        processes.push({ pid: programPid, id: threadGroupId });
        //console.log("ID: " + programPid + ' ' + threadGroupId);
      } else if (result.class=='thread-group-exited') {
        // we can to catch when the debugger has stopped here, and update 'debugStatus'
        debugStatus = 'idle';
      }
    }
    // log
    notifyOutRecords.push(result);
  }
  
  // some things need special handling, such as process PIDs, and status updates
  // based on output type
  function processAsyncOutput(prefix, result) {
    // handle state changes if prefix is line was exec-async-output ('stopped' or 'running')
    if (prefix=='*') execStatus = result.class;
    // log
    execOutRecords.push(result);
  }
  
  function enteredInteractiveMode() {
    interactive = true;
    gdbReady = true;
    readyCheck();
  }
  
  // parse a line of gdb output. the content of that line determines what we do:
  // "(gdb)" -> tells us the debugger is back in interactive mode
  //            run the originating command's callback
  // otherwise it's a regular output line we'll parse into JSON
  function processGdbMiLine(line) {
    if (isEmpty(line)) return;      // last line is always empty (extra carriage return)
     
    // "(gdb)" in practice tells us that the debugger is ready for the next command
    if (line=="(gdb)") {
      enteredInteractiveMode();
      if (gdbInteractiveCallback) execCommandCallback();  // run callback if present
      else execNextQueuedCommand();                       // execute next command in queue, if possible
      return;
    }
    
    // parse result
    var prefix = line[0],
        result = isStreamRecord(prefix) ? parseStreamRecordResult(line) : parseExecRecordResult(line);
    
    // process command results
    if (isStreamRecord(prefix)) processStreamRecord(prefix, result);
    else {
      if (isNotifyOutput(prefix)) processNotifyOutput(prefix, result);
      else processAsyncOutput(prefix, result);
    }
    
    // fire gdb output event
    var event = prefixToGdbEvent[prefix];
    me.emit(event, result);
  };
  
  function processGdbMiOutput(data) {
    var lines = data.toString().split("\n");
    for (var i = 0; i < lines.length; i++) processGdbMiLine(trim(lines[i]));
  };
  
  
  
  //-------------------------------------------------------------------------
  // 
  // Program input functions
  // 
  //-------------------------------------------------------------------------
  
  // write right into program input stream
  nodeGdb.prototype.appInWrite = function(str) {
    appIn.write(str);
  };
  
  // pipe a readble into program input stream
  nodeGdb.prototype.pipeToAppIn = function(readable) {
    readable.pipe(appIn);
  };
  
  
  //-------------------------------------------------------------------------
  // 
  // Execution methods
  // 
  //-------------------------------------------------------------------------
  
  // callback( data )
  nodeGdb.prototype.load = function(programName, programArgs, callback) {
    // do not mess around with this while debugging another program!
    if (debugStatus=='active') {
      callback({ error: 'Cannot load another program while debugging' });
      return;
    }
    
    // sanitize vars
    programName = programName || "";
    programArgs = programArgs || [];
    
    // add IO redirection to program args
    // if there's IO redirection lurking in there, it will have no effect
    var ioArgs = [ '<', appInFileName, '>', appOutFileName, '2>', appErrFileName ];
    programArgs = programArgs.concat(ioArgs);
    
    // -file-exec-and-symbols -> Specify the executable file to be debugged. 
    // This file is the one from which the symbol table is also read. If no file is specified, 
    // the command clears the executable and symbol information. If breakpoints are set 
    // when using this command with no arguments, gdb will produce error messages. 
    // Otherwise, no output is produced, except a completion notification.
    // 
    // -exec-arguments -> Set the inferior program arguments, to be used in the next `-exec-run'.
    // If any args had been set before, they get wiped.
    enqueueCommand("-file-exec-and-symbols", [programName], function(data) {
      enqueueCommand("-exec-arguments", programArgs, callback);
    });
  };
  
  // start the debug
  nodeGdb.prototype.run = function(callback) {
    // debug one program at a time!
    if (debugStatus=='active') {
      callback({ error: 'Already debugging a program' });
      return;
    }
    debugStatus = 'active';
    
    // will stream user input into program input channel
    // we need to open these every time we start a debug, cos the previous one closed our streams
    appIn = fs.createWriteStream(appInFileName, {encoding: 'utf8'});
    appOut = fs.createReadStream(appOutFileName, {encoding: 'utf8'});
    appErr = fs.createReadStream(appErrFileName, {encoding: 'utf8'});
    
    // debugee IO
    me.appStdin = appIn;
    me.appStdout = appOut;
    me.appStderr = appErr;
    me.appStdio = [appIn,appOut,appErr];
    
    // wire program out events
    appOut.on("data", function(data) {
      me.emit("appOut", data);
    });
    appErr.on("data", function(data) {
      me.emit("appErr", data);
    });
    
    // -exec-run -> Asynchronous command. Starts execution of the inferior from the beginning. 
    // The inferior executes until either a breakpoint is encountered or the program exits.
    enqueueCommand("-exec-run", [], callback);
  };
  
  nodeGdb.prototype.continue = function(callback) {
    // make sure we have started debugging something and we are on pause (status 'stopped')
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='running') {
      callback({ error: 'Program is already running' });
      return;
    }
    
    // exec-continue -> Asynchronous command. Resumes the execution of the inferior program 
    // until a breakpoint is encountered, or until the inferior exits.
    enqueueCommand("-exec-continue", [], callback);
  };
  
  nodeGdb.prototype.pause = function(callback) {
    // make sure we have started debugging something and we are 'running'
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='stopped') {
      callback({ error: 'Program is already stopped' });
      return;
    }
    
    // Could we do: enqueueCommand("-exec-interrupt", [], callback); to pause? 
    // No: gdb will not accept that command if debugee is running
    // Workaround: enqueue kill command
    function commandFunc() {
      interactive = false;
      gdbInteractiveCallback = callback;
      for (var i = 0; i < processes.length; ++i) {
        // kill the debugee (it is really only 'interrupted')
        var programPid = processes[i].pid;
        exec("kill -s 2 ".concat(programPid));
      }
    };
    if (interactive) commandFunc();
    else commadQueue.push(commandFunc);
  };
  
  nodeGdb.prototype.stop = function(callback) {
    // if not running, u r stupid
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    
    // really kill the debugee
    // if program is running, we need to interrupt it first so gdb goes back to interactive
    if (execStatus=='running') {
      me.pause(function(data) {
        enqueueCommand("kill", [], callback);
      });
    } else {
      enqueueCommand("kill", [], callback);
    }
  };
  
  //-------------------------------------------------------------------------
  // Step methods
  //-------------------------------------------------------------------------
  nodeGdb.prototype.stepOver = function(callback) {
    // error check
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='running') {
      callback({ error: 'Program is running, cannot step over' });
      return;
    }
    // -exec-next -> Asynchronous command. Resumes execution of the inferior program, 
    // stopping when the beginning of the next source line is reached.
    enqueueCommand("-exec-next", [], callback);
  };
  
  nodeGdb.prototype.stepInto = function(callback) {
    // error check
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='running') {
      callback({ error: 'Program is running, cannot step into' });
      return;
    }
    // -exec-step -> Asynchronous command. Resumes execution of the inferior program, 
    // stopping when the beginning of the next source line is reached, 
    // if the next source line is not a function call. 
    // If it is, stop at the first instruction of the called function
    enqueueCommand("-exec-step", [], callback);
  };
  
  nodeGdb.prototype.stepOut = function(callback) {
    // error check
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='running') {
      callback({ error: 'Program is running, cannot step out' });
      return;
    }
    // -exec-finish -> Asynchronous command. Resumes the execution of the inferior program 
    // until the current function is exited. 
    // Displays the results returned by the function
    enqueueCommand("-exec-finish", [], callback);
  };
  
  
  //-------------------------------------------------------------------------
  // 
  // Query methods
  // 
  //-------------------------------------------------------------------------
  
  nodeGdb.prototype.listVariables = function(callback) {
    // error check
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='running') {
      callback({ error: 'Program is running, cannot list variables' });
      return;
    }
    
    enqueueCommand("-stack-list-variables", ["1"], callback);
  };
  
  nodeGdb.prototype.evalExpression = function(callback) {
    // error check
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='running') {
      callback({ error: 'Program is running, cannot eval expression' });
      return;
    }
    
    enqueueCommand("-stack-list-variables", ["1"], callback);
  };
  
  nodeGdb.prototype.setVariableValue = function(callback) {
    // error check
    if (debugStatus=='idle') {
      callback({ error: 'Not debugging a program' });
      return;
    }
    if (execStatus=='running') {
      callback({ error: 'Program is running, cannot set variable value' });
      return;
    }
    
    enqueueCommand("-stack-list-variables", ["1"], callback);
  };
  
  
  //-------------------------------------------------------------------------
  // 
  // Breakpoint methods
  // 
  //-------------------------------------------------------------------------
  
  nodeGdb.prototype.setBreakpoint = function(callback) {
    enqueueCommand("-stack-list-variables", ["1"], callback);
  };
  
  nodeGdb.prototype.removeBreakpoint = function(callback) {
    enqueueCommand("-stack-list-variables", ["1"], callback);
  };
  
  
  //-----------------------------------------------------------
  // make this an event emitter
  //-----------------------------------------------------------
  
  // events: 
  // GDB output events:
  // 'gdbConsoleOutput',
  // 'gdbInternalsOutput',
  // 'gdbStateChange',
  // 'gdbInfo',
  // 'gdbCommandResponse',
  // 'gdbProgress'
  // General app and gdb output events
  // 'appOut'
  // 'appErr'
  // 'gdbOut'
  // 'gdbErr'
  // gdb process events
  // 'close'
  // 'exit'
  // 'error'
  events.EventEmitter.call(me);
  //nodeGdb.prototype.__proto__ = events.EventEmitter.prototype;              // DEPRECATED!
  Object.setPrototypeOf(nodeGdb.prototype, events.EventEmitter.prototype);    // use this instead
  
  
  //-----------------------------------------------------------
  // set up program IO
  //-----------------------------------------------------------
  
  // fifo files
  var fifoPath = randTempFilePath();
  var appInFileName = fifoPath.concat(".in");
  var appOutFileName = fifoPath.concat(".out");
  var appErrFileName = fifoPath.concat(".err");
  
  // fifos cleanup
  var fifosClosed = false;
  function closeFifos() {
    if (!fifosClosed) {
      fifosClosed = true;
      // delete debugee IO FIFOs
      fs.unlink(appInFileName);
      fs.unlink(appOutFileName);
      fs.unlink(appErrFileName);
    }
  }
  
  // Create a fifo with read/write permissions for owner, and with read permissions for group and others
  // Mode: 4516 (S_IFIFO | S_IWUSR | S_IRUSR | S_IRGRP | S_IROTH)
  // Device: 0 (dev_t)
  function mknodHandler(err) {
    if (err) throw err;
    ++fifoCnt;
    readyCheck();
  }
  mknod(appInFileName, 4516, 0, mknodHandler);
  mknod(appOutFileName, 4516, 0, mknodHandler);
  mknod(appErrFileName, 4516, 0, mknodHandler);
  
  var appIn;    // IO streams we'll use to comunicate with the debugee
  var appOut;
  var appErr;
    
  
  //-----------------------------------------------------------
  // set up debugger (gdb)
  // 
  // nodeGdb looks like a regular ChildProcess, and can be treated as such
  //
  //   Event: 'close'
  //   Event: 'disconnect'
  //   Event: 'error'
  //   Event: 'exit'
  //   Event: 'message'
  //   child.connected
  //   child.disconnect()
  //   child.kill([signal])
  //   child.pid
  //   child.send(message[, sendHandle][, callback])
  //   child.stderr
  //   child.stdin
  //   child.stdio
  //   child.stdout
  //   
  // Additional accessors are provided to separate gdb IO from debugee IO
  // 
  //   gdbStdio
  //   gdbStdin
  //   gdbStdout
  //   gdbStderr
  //   appStdin
  //   appStdout
  //   appStderr
  //   appStdio
  //-----------------------------------------------------------
  // prep GDB args
  gdbArgs = gdbArgs || [];
  // Hardcoded args
  gdbArgs = gdbArgs.concat("--interpreter=mi");   // Use MI interpreter
  //gdbArgs = gdbArgs.concat("--readnow");          // Fully read symbol files on first access.
  //gdbArgs = gdbArgs.concat("-tty=/dev/pts/5");    // set terminal
  //gdbArgs = gdbArgs.concat("--args");             // DO NOT USE!!! Program arguments should go in the 'programArgs' array

  // spawn gdb process and wire process events
  var gdb = spawn("gdb", gdbArgs, { detached: true });
  
  // wire ChildProcess-like event handlers
  gdb.on("close", function(code, signal) {
    me.emit("close", code, signal);
  });
  gdb.on("exit", function(code, signal) {
    closeFifos();
    me.emit("exit", code, signal);
  });
  gdb.on("error", function(err) {
    closeFifos();
    me.emit("error", err);
  });
  gdb.on("disconnect", function(err) {
    me.emit("disconnect", err);
  });
  gdb.on("message", function(message, sendHandle) {
    me.emit("message", message, sendHandle);
  });
  
  // make ChildProcess-like methods
  nodeGdb.prototype.disconnect = function() {
    gdb.disconnect();
  };
  nodeGdb.prototype.kill = function(signal) {
    gdb.kill(signal);
  };
  me.pid = gdb.pid;
  nodeGdb.prototype.send = function(message, sendHandle, callback) {
    gdb.send(message, sendHandle, callback);
  };
  
  // general IO
  me.stdio = gdb.stdio;
  me.stdin = gdb.stdin;
  me.stdout = gdb.stdout;
  me.stderr = gdb.stderr;
  
  
  // gdb IO
  me.gdbStdio = gdb.stdio;
  me.gdbStdin = gdb.stdin;
  me.gdbStdout = gdb.stdout;
  me.gdbStderr = gdb.stderr;
  
  // debugee IO
  me.appStdin = undefined;
  me.appStdout = undefined;
  me.appStderr = undefined;
  me.appStdio = [undefined,undefined,undefined];
  
  
  // gdb IO
  var gdbIn = gdb.stdin;    // all these are sockets
  var gdbOut = gdb.stdout;
  var gdbErr = gdb.stderr;
  
  // wire gdb out events
  gdbOut.on("data", function(data) {
    processGdbMiOutput(data);
    me.emit("gdbOut", data);
  });
  gdbErr.on("data", function(data) {
    processGdbMiOutput(data);
    me.emit("gdbErr", data);
  });
  
  
  //----------------------------------------
  // private variables
  //----------------------------------------
  
  var interactive = false;                  // when true, more commands can be issued to gdb
  var gdbInteractiveCallback = undefined;   // function that will be called after GDB has 
                                            // executed a command and gone back to interactive mode  
  
  var debugStatus = 'idle';                 // 'active' or 'idle': do not allow for more than 1 debug at a time
  
  var execStatus = 'stopped';               // https://sourceware.org/gdb/onlinedocs/gdb/GDB_002fMI-Async-Records.html#GDB_002fMI-Async-Records
                                            // execution status can be 'running' or 'stopped' (breakpoint, SIGINT, ...)
  
  var commadQueue = [];                     // commands to be executed
  
  var streamRecords = new BArray(100);      // save last few records here
  var execOutRecords = new BArray(100);
  var notifyOutRecords = new BArray(100);
  
  var processes = [];                       // debugee's PID and thread group id
    
}


module.exports = nodeGdb;