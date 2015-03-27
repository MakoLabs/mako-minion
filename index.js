#!/usr/bin/env node
(function () {
    var checkin, cleaner, opts, server, start, util, debug;

    debug = require('debug-levels')('index');

    server = require('./lib/webserver');

    checkin = require('./lib/checkin')();

    cleaner = require('./lib/cleaner');

    util = require('./lib/util');

    opts = util.opter(process.argv);

    start = function () {
        var port = process.env.PORT || 3000;
        debug.info('start', 'listening on', port);
        server.listen(port);
        return checkin.startCheckin();
    };

    cleaner.on('pruned directory', function(dir){
        debug.verbose('pruned directory', dir);
    });

    if (opts.create) {
        start();
    } else {
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        console.log("Mako Minion needs to write files to the current working directory.");
        console.log("process.cwd() is " + (process.cwd()));
        console.log("To avoid this message in future pass the --create option");
        console.log("Are you happy to have things written here? [y/N]");
        process.stdin.on('data', function (chunk) {
            if (chunk.toString().toLowerCase() === 'y\n') {
                return start();
            } else {
                throw new Error("User did not grant write permission");
            }
        });
    }

}).call(this);
