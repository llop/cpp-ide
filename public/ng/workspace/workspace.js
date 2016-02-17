(function() {
  'use strict';
  var workspace = angular.module('webIDE.workspace', ['btford.socket-io']);
  workspace.factory('workspace', ['socketFactory', function(socketFactory) {
    var socket = socketFactory();
    var files = [];
    return {
      socket: socket, 
      files:files
    };
  }]);
})();
