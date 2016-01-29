var express = require('express');
var router = express.Router();
var fs = require('fs');

router.get('/', function(req, res, next) {
  fs.readFile('/home/llop/Llop/FIB/TFG/main.cc', 'utf8', function(err, data) {
    if (err) data='Error reading file';
    res.json({ wfile: data });
  });
});

router.post('/', function(req, res, next) {
  fs.writeFile("/home/llop/Llop/FIB/TFG/main.cc", req.body.wfile, 'utf8', function(err) {
    if (err) {
      res.sendStatus(500);
      console.log(err);
      return;
    }
    console.log("The file was saved!");
    res.sendStatus(200);
  });
});

module.exports = router;
