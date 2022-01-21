#!/usr/bin/env node

DIST_DIR = "./dist"

process.chdir(DIST_DIR)

var http = require("http");
const kill = require("kill-port");

var finalhandler = require("finalhandler");
var serveStatic = require("serve-static");

var serve = serveStatic(".");

var server = http.createServer(function(req, res) {
    var done = finalhandler(req, res);
    serve(req, res, done);
});

let port = process.argv[2] || 8080;
kill(port).then(() => {
    server.listen(port, () => console.log("Dev server running on port:", port));
});