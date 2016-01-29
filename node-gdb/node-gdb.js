//-----------------------------------------------------------
// Modules
//-----------------------------------------------------------

var spawn = require('child_process').spawn;
var events = require('events');
var fs = require('fs');


//-----------------------------------------------------------
// String helper functions
//-----------------------------------------------------------

function stringStartsWith(string, prefix) {
  return string.slice(0, prefix.length) == prefix;
}
function isEmpty(str) {
  return !str || 0 === str.length;
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
    if (stack[stack.length - 1]==1 && (str[i]==','||str[i]=='[') && str[i+1]=='\"') {
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
// lines' first character tells us what type of gdb output event we have to fire
var prefixToGdbEvent = {
  '~': 'gdbConsoleOutput',
  '&': 'gdbInternalsOutput',
  '*': 'gdbStateChange',
  '=': 'gdbInfo',
  '^': 'gdbCommandResponse',
  '+': 'gdbProgress'
};


//-----------------------------------------------------------
// Main gdb instance
// 
// Intended use:
//   * To issue gdb commands, use the command function
//   * To get gdb output, listen to output events
//-----------------------------------------------------------

function nodeGdb(gdbArgs) {
  
  // reference to this instance for callbacks
  var me = this;
    
  //-----------------------------------------------------------
  // prototype functions
  //-----------------------------------------------------------
    
  // command(name, args, callback)
  // processGdbMiLine(line)
  // processGdbMiOutput(data)
  
  // issues the given command
  // args is an array containing command arguments
  // callback is a function that will get executed when the debugger goes back to interactive mode
  // return value indicates if the command got through to the debugger
  // the command will not be issued if the debugger is not in interactive mode
  nodeGdb.prototype.command = function(name, args, callback) {
    if (me.interactive) {
      me.interactive = false;
      me.gdbInteractiveCallback = callback;
      var cmd = name.concat(' ').concat(args.join(' ')).concat('\n');
      console.log("CMD: "+cmd);
      me.gdbIn.write(cmd);
      return true;
    }
    return false;
  };
  
  // 
  nodeGdb.prototype.processGdbMiLine = function(line) {
    if (isEmpty(line)) return;      // should never happen, right?
    // "(gdb)" in practice tells us that the debugger is ready for the next command
    if (line=="(gdb)") {
      me.interactive = true;
      if (me.gdbInteractiveCallback) {
        var callback = me.gdbInteractiveCallback;
        var commandResponse = me.lastCommandResponse;
        me.gdbInteractiveCallback = undefined;
        me.lastCommandResponse = undefined;
        callback(commandResponse.result);
      }
      return;
    }
    // prefix:
    var prefix = line[0];
    var event = prefixToGdbEvent[prefix];
    // wrap output into result
    var result;
    if (prefix=='&' || prefix=='~') {
      // console and internals output are plain strings
      line = trim(line.substr(1));
      if (line[0]=='"' && line[line.length-1]=='"') line = trim(line.substr(1, line.length-2));
			line = line.replace(/\\"/g, '\"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      result = { result: '\"'.concat(line).concat('\"') };
    } else {
      // output class and result
      var i = 1;
      while (i<line.length && line[i]!=',') ++i;
      result = { class: trim(line.substring(1, i)), result: resultToJSON(trim(line.substr(i+1))) };
      // store last command response
      if (prefix=='^') me.lastCommandResponse = result;
    }
    me.emit(event, result);
  };
  
  nodeGdb.prototype.processGdbMiOutput = function(data) {
    var lines = data.toString().split("\n");
    for (var i = 0; i < lines.length; i++) me.processGdbMiLine(trim(lines[i]));
  };
  
  
  // start the debug
  nodeGdb.prototype.run = function(options, callback) {
    // process options
    options = options || {};

    // program name + args
    var programName = options.programName || "/home/llop/Llop/FIB/TFG/a.out";
    var programArgs = options.programArgs || [];
    
    // add IO redirection to program args
    // if there's IO redirection lurking in there, it will have no effect
    var ioArgs = [ '<', me.appInFileName, '>', me.appOutFileName, '2>', me.appErrFileName ];
    programArgs = programArgs.concat(ioArgs);
    
    // set program, args, and run
    me.command("-file-exec-and-symbols", [programName], function(data) {  
      me.command("-exec-arguments", programArgs, function(data) {
        me.command("-exec-run", [], callback);
      });
    });
  };
  
  nodeGdb.prototype.listVariables = function(callback) {
    // process options
    me.command("-stack-list-variables", ["1"], callback);
  };
  
  nodeGdb.prototype.continue = function(callback) {
    // process options
    me.command("-exec-continue", [], callback);
  };
  
  
  // make this an event emitter
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
  events.EventEmitter.call(me);
  nodeGdb.prototype.__proto__ = events.EventEmitter.prototype;
  
  
  
  
  //-----------------------------------------------------------
  // set up program IO
  //-----------------------------------------------------------
  
  // fifo files
  me.appInFileName = "/home/llop/Llop/FIB/TFG/in.nod";
  me.appOutFileName = "/home/llop/Llop/FIB/TFG/out.nod";
  me.appErrFileName = "/home/llop/Llop/FIB/TFG/err.nod";
  
  // will stream user input into program input channel
  me.appIn = fs.createWriteStream(me.appInFileName, {encoding: 'utf8'});
  me.appOut = fs.createReadStream(me.appOutFileName, {encoding: 'utf8'});
  me.appErr = fs.createReadStream(me.appErrFileName, {encoding: 'utf8'});
  
  // wire program out events
  me.appOut.on("data", function(data) {
    me.emit("appOut", data);
  });
  me.appErr.on("data", function(data) {
    me.emit("appErr", data);
  });
  
  
  //-----------------------------------------------------------
  // set up debugger
  //-----------------------------------------------------------
  
  // prep GDB args
  gdbArgs = gdbArgs || [];

  // Hardcoded args
  gdbArgs = gdbArgs.concat("--interpreter=mi");   // Use MI interpreter
  //gdbArgs = gdbArgs.concat("--readnow");          // Fully read symbol files on first access.
  //gdbArgs = gdbArgs.concat("-tty=/dev/pts/5");    // set terminal
  //gdbArgs = gdbArgs.concat("--args");             // DO NOT USE!!! Program arguments should go in the 'programArgs' array

  // spawn gdb process
  me.gdb = spawn("gdb", gdbArgs, { detached: true });
  me.gdbIn = me.gdb.stdin;    // all these are sockets
  me.gdbOut = me.gdb.stdout;
  me.gdbErr = me.gdb.stderr;
  
  // wire gdb out events
  me.gdbOut.on("data", function(data) {
    me.processGdbMiOutput(data);
    me.emit("gdbOut", data);
  });
  me.gdbErr.on("data", function(data) {
    me.processGdbMiOutput(data);
    me.emit("gdbErr", data);
  });
  
  
  //----------------------------------------
  // instance vars
  //----------------------------------------
  
  me.interactive = true;                    // when true, more commands can be issued to gdb
  me.gdbInteractiveCallback = undefined;    // function that will be called after GDB has 
                                            // executed a command and gone back to interactive mode  
  me.lastCommandResponse = undefined;
}


module.exports = nodeGdb;