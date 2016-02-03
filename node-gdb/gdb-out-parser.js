
function trim(str) {
  if (str) str = str.trim();
  return str;
}


/*
 * About gdb output
 * https://sourceware.org/gdb/onlinedocs/gdb/GDB_002fMI-Output-Syntax.html
 * 
 * output ==>
 *   ( out-of-band-record )* [ result-record ] "(gdb)" nl 
 * result-record ==>
 *   [ token ] "^" result-class ( "," result )* nl 
 * out-of-band-record ==>
 *   async-record | stream-record 
 * async-record ==>
 *   exec-async-output | status-async-output | notify-async-output 
 * exec-async-output ==>
 *   [ token ] "*" async-output nl 
 * status-async-output ==>
 *   [ token ] "+" async-output nl 
 * notify-async-output ==>
 *   [ token ] "=" async-output nl 
 * async-output ==>
 *   async-class ( "," result )* 
 * result-class ==>
 *   "done" | "running" | "connected" | "error" | "exit" 
 * async-class ==>
 *   "stopped" | others (where others will be added depending on the needs—this is still in development). 
 * result ==>
 *   variable "=" value 
 * variable ==>
 *   string 
 * value ==>
 *   const | tuple | list 
 * const ==>
 *   c-string 
 * tuple ==>
 *   "{}" | "{" result ( "," result )* "}" 
 * list ==>
 *   "[]" | "[" value ( "," value )* "]" | "[" result ( "," result )* "]" 
 * stream-record ==>
 *   console-stream-output | target-stream-output | log-stream-output 
 * console-stream-output ==>
 *   "~" c-string nl 
 * target-stream-output ==>
 *   "@" c-string nl 
 * log-stream-output ==>
 *   "&" c-string nl 
 * nl ==>
 *   CR | CR-LF 
 * token ==>
 *   any sequence of digits.
 * 
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
 *   
 * WARNING:
 * We are ignoring tokens for now -DO NOT USE TOKENS!
 */

function eatWhitespace(line, i) {
  while (i<line.length && (line[i]==' '||line[i]=='\n'||line[i]=='\r'||line[i]=='\t')) ++i;
  return i;
}

function eatVariableName(line, i) {
  while (i<line.length && line[i]!='=') ++i;
  return i+1;
}

function nextVariableName(line, i) {
  var j = i;
  while (j<line.length && line[j]!='=') ++j;
  return [j, trim(line.substring(i, j))];
}

function nextValue(line, i) {
  if (line[i]=='"') {
    // parse const
    return nextConst(line, i);
  } else if (line[i]=='{') {
    // parse tuple
    return nextTuple(line, i);
  } else if (line[i]=='[') {
    // parse list
    return nextList(line, i);
  }
}

function nextConst(line, i) {
  var j = i+1;
  while (j<line.length) {
    if (line[j]=='\\') ++j;
    else if (line[j]=='"') return [j+1, trim(line.substring(i+1, j))];
    ++j;
  }
}

function nextResult(line, i) {
  // extract variable name
  var nameRes = nextVariableName(line, i);
  var varName = nameRes[1];
  i = eatWhitespace(line, nameRes[0]+1);
  // extract variable value
  var valRes = nextValue(line, i);
  var varValue = valRes[1];
  return [valRes[0], varName, varValue];
}

function nextTuple(line, i) {
  var ret = {};
  while (i<line.length && line[i]!='}') {
    var result = nextResult(line, i+1);
    ret[ result[1] ] = result[2];
    i = eatWhitespace(line, result[0]);   // i at ',', '}', or line end
  }
  return [i+1, ret];
}

function nextList(line, i) {
  var ret = [];
  while (i<line.length && line[i]!=']') {
    i = eatWhitespace(line, i+1);
    if (line[i]!='"' && line[i]!='{' || line[i]!='[') {
      i = eatVariableName(line, i);
      i = eatWhitespace(line, i);
    }
    var valRes = nextValue(line, i);
    ret.push(valRes[1]);
    i = eatWhitespace(line, valRes[0]+1);
  }
  return [i+1, ret];
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
  var result = nextTuple(line, i)[1];
  return { class: klass, result: result };
}

function isStreamRecord(prefix) {
  return prefix=='~' || prefix=='&' || prefix=='@';
}
function isNotifyOutput(prefix) {
  return prefix=='=' || prefix=='+';
}
function isAsyncOutput(prefix) {
  return prefix=='^' || prefix=='*';
}

module.exports = {
  parseRecord: function(line) {
    var prefix = line[0];
    return isStreamRecord(prefix) ? parseStreamRecordResult(line) : parseExecRecordResult(line);
  },
  isAsyncRecord: function(prefix) { return !isStreamRecord(prefix); },
  isStreamRecord: isStreamRecord,
  isNotifyOutput: isNotifyOutput,
  isAsyncOutput: isAsyncOutput
};