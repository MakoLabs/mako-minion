var MINION_PASS, addNewline, getJSON, gitter, http, porter, qs, respondJSONerr, router, runner, server, url, util, debug;

debug = require('debug-levels')('webserver');

http = require('http');

qs = require("querystring");

url = require('url');

server = http.createServer();

gitter = require('../lib/gitter')();

runner = require('../lib/runner');

porter = require('../lib/porter');

router = require('../lib/router');

util = require('../lib/util');

porter.neverTwice = true;

MINION_PASS = process.env.MINION_PASS || "shortfin";

getJSON = function (req, cb) {
    var optStr;
    optStr = "";
    req.on("data", function (buf) {
        return optStr += buf.toString();
    });
    return req.on("end", function () {
        var e, parsed;
        try {
            debug.verbose('processing', optStr);
            parsed = JSON.parse(optStr);
        } catch (_error) {
            e = _error;
            cb(e, null);
        }
        return cb(null, parsed);
    });
};

respondJSONerr = function (err, res) {
    res.writeHead(400);
    return res.end(err);
};

addNewline = function (str) {
    if (str.charAt(str.length - 1) !== '\n') {
        return str += '\r\n';
    }
    return str;
};

server.on('request', function (req, res) {
    var authArray, parsed, proc, ps, _;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"]);
    if (req.headers.authorization == null) {
        res.writeHead(401);
        return res.end("auth required");
    }
    authArray = new Buffer(req.headers.authorization.split(' ')[1], 'base64').toString('ascii').split(':');
    if (authArray[1] !== MINION_PASS) {
        res.writeHead(401);
        return res.end("wrong pass");
    }
    parsed = url.parse(req.url, true);
    debug.info('request', parsed.pathname);
    switch (parsed.pathname) {
        case "/health":
            return res.end("ok");
        case "/ps":
            res.setHeader("Content-Type", "application/json");
            ps = util.clone(runner.processes);
            for (_ in ps) {
                proc = ps[_];
                delete proc.process;
            }
            res.write(JSON.stringify(ps, null, 2));
            return res.end();
        case "/fetch":
            return getJSON(req, function (err, repo) {
                if (err != null) {
                    return respondJSONerr(err, res);
                }
                return gitter.fetch(repo.name, repo.url, function (err) {
                    if (err != null) {
                        res.writeHead(500);
                    }
                    if (err != null) {
                        return res.end(err.toString());
                    }
                    return res.end();
                });
            });
        case "/" + util.apiVersion + "/stop":
            return getJSON(req, function (err, ids) {
                if (err != null) {
                    return respondJSONerr(err, res);
                }
                runner.stop(ids);
                return res.end();
            });
        case "/" + util.apiVersion + "/restart":
            return getJSON(req, function (err, ids) {
                if (err != null) {
                    return respondJSONerr(err, res);
                }
                runner.restart(ids);
                return res.end();
            });
        case "/" + util.apiVersion + "/spawn":
            return getJSON(req, function (err, opts) {
                if (err != null) {
                    return respondJSONerr(err, res);
                }
                return runner.spawn(opts, function (processes) {
                    res.write(JSON.stringify(util.clone(processes)));
                    return res.end();
                });
            });
        case "/" + util.apiVersion + "/exec":
            return getJSON(req, function (err, opts) {
                if (err != null) {
                    return respondJSONerr(err, res);
                }
                if (!opts.once) {
                    res.writeHead(400);
                    return res.end();
                }
                res.setHeader("Content-Type", "application/json");
                return runner.spawn(opts, function (proc) {
                    var output;
                    output = {
                        stdout: [],
                        stderr: []
                    };
                    proc.process.stdout.on('data', function (buf) {
                        return output.stdout.push(buf.toString());
                    });
                    proc.process.stderr.on('data', function (buf) {
                        return output.stderr.push(buf.toString());
                    });
                    return proc.process.on('close', function (code, signal) {
                        output.code = code;
                        output.signal = signal;
                        return res.end(JSON.stringify(output));
                    });
                });
            });
        case "/routingTable":
            return getJSON(req, function (err, table) {
                if (err != null) {
                    return respondJSONerr(err, res);
                }
                return router.writeFile(table, function (err, action) {
                    if (err != null) {
                        throw new Error(err);
                    }
                    return router.reload(function    () {
                        return res.end();
                    });
                });
            });
        case "/port":
            return porter.getPort(function (err, port) {
                res.setHeader("Content-Type", "application/json");
                res.write(JSON.stringify({
                    port: port
                }));
                return res.end();
            });
        case "/monitor":
            res.setTimeout(60 * 60 * 1000);
            res.writeHead(200);
            res.write("Monitoring " + runner.minionId + "\r\n");
            runner.on("stdout", function (buf, info) {
                return res.write("" + info.repo + " " + info.id + " - " + (addNewline(buf.toString())));
            });
            runner.on("stderr", function (buf, info) {
                return res.write("" + info.repo + " " + info.id + " - " + (addNewline(buf.toString())));
            });
            runner.on("spawn", function (info) {
                return res.write("" + info.repo + " " + info.id + " spawn\r\n");
            });
            runner.on("stop", function (info) {
                return res.write("" + info.repo + " " + info.id + " stop\r\n");
            });
            runner.on("restart", function (info) {
                return res.write("" + info.repo + " " + info.id + " restart\r\n");
            });
            runner.on("exit", function (code, signal, info) {
                var str;
                str = "" + info.repo + " exited with code " + code;
                if (signal != null) {
                    str += " from signal " + signal;
                }
                return res.write(str + "\r\n");
            });
            runner.on("error", function (err, info) {
                return res.write("" + info.repo + " " + info.id + " error - " + (addNewline(err.toString())));
            });
            return gitter.on("deploy", function (info) {
                return res.write("" + info.repo + " " + info.commit + " deploy\r\n");
            });
        case '/apiVersion':
            res.writeHead(200);
            res.write(util.apiVersion.toString());
            return res.end();
        case '/uptime':
            res.writeHead(200);
            res.write((new Date() - new Date(runner.started)).toString());
            return res.end();
        default:
            res.writeHead(404);
            return res.end("not found");
    }
});

//Default system logging
runner.on("stdout", function (buf, info) {
    debug.verbose("" + info.repo + " " + info.id + " - " + buf.toString());
});
runner.on("stderr", function (buf, info) {
    debug.verbose("" + info.repo + " " + info.id + " - " + buf.toString());
});
runner.on("spawn", function (info) {
    debug.verbose("" + info.repo + " " + info.id + " spawn");
});
runner.on("stop", function (info) {
    debug.verbose("" + info.repo + " " + info.id + " stop");
});
runner.on("restart", function (info) {
    debug.verbose("" + info.repo + " " + info.id + " restart");
});
runner.on("exit", function (code, signal, info) {
    var str;
    str = "" + info.repo + " exited with code " + code;
    if (signal != null) {
        str += " from signal " + signal;
    }
    debug.verbose(str);
});

runner.on("error", function (err, info) {
    debug.verbose("" + info.repo + " " + info.id + " error - " + err.toString());
});

gitter.on("deploy", function (info) {
    debug.verbose("" + info.repo + " " + info.commit + " deploy");
});

module.exports = server;
