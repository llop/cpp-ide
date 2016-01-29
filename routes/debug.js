
module.exports = function(gdb) {
  
  var express = require('express');
  var router = express.Router();
  
  router.get('/run', function(req, res, next) {
    gdb.run({}, function(data) {
      // TODO: error handling
      //console.log("GDB STARTED!");
      res.json(data);
    });
  });
  
  router.get('/variables', function(req, res, next) {
    gdb.listVariables(function(data) {
      // TODO: error handling
      res.json(data);
    });
  });
  
  router.get('/continue', function(req, res, next) {
    gdb.continue(function(data) {
      // TODO: error handling
      res.json(data);
    });
  });
  
  return router;
};