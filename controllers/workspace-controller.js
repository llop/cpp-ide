var chokidar = require('chokidar');


function workspaceController(io) {
  
  // Initialize watcher.
  var watcher = chokidar.watch('/home/llop/Llop/FIB/TFG/', {persistent:true});

  
  // RENAME:
  // Directory has been removed /home/llop/Llop/FIB/TFG/Hola
  // Directory has been added /home/llop/Llop/FIB/TFG/Hola2
  watcher.on('ready', function() {
    
    console.log('Initial scan complete. Ready for changes'); 
    console.log("JOLAAA "+JSON.stringify(watcher.getWatched()));
    console.log('');
    
    
    // Add event listeners.
    watcher.on('add', function(path) { console.log('File has been added '+path); });
    watcher.on('change', function(path) { console.log('File has been changed '+path); });
    watcher.on('unlink', function(path) { console.log('File has been removed '+path); });

    // More possible events.
    watcher.on('addDir', function(path) { console.log('Directory has been added '+path); });
    watcher.on('unlinkDir', function(path) { console.log('Directory has been removed '+path); });
    watcher.on('error', function(error) { console.log('Watcher error: '+error); });
    watcher.on('raw', function(event, path, details) {
      console.log('Raw event info:'+event+' '+path+' '+JSON.stringify(details));
    });

    // 'add', 'addDir' and 'change' events also receive stat() results as second
    // argument when available: http://nodejs.org/api/fs.html#fs_class_fs_stats
    watcher.on('change', function(path, stats) {
      console.log('File changed size'+path);
      if (stats) console.log(JSON.stringify(stats));
    });
    
  });
  
  
}

module.exports = workspaceController;