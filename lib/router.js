var Router, Stream, fs, nginxPath, os, path, router, spawn, util, template, hogan, shelljs;

hogan = require('hogan');

path = require('path');

os = require('os');

fs = require('fs');

shelljs = require('shelljs');

spawn = require('child_process').spawn;

Stream = require('stream').Stream;

util = require('../lib/util');

nginxPath = path.join(process.cwd(), 'nginx');

template =  hogan.compile(shelljs.cat(path.resolve(__dirname, '..', 'nginx', 'nginx.conf.mustache')));

shelljs.mkdir('-p', nginxPath);

Router = function () {
    var nginxTempPath;
    this.pidpath = path.join(process.cwd(), 'pids');
    if (process.env.NGINXLOCALTEMPFILE) {
        nginxTempPath = nginxPath;
    }
    if (process.env.NGINXTEMPPATH != null) {
        nginxTempPath = process.env.NGINXTEMPPATH;
    }
    try {
        fs.mkdirSync(this.pidpath);
    } catch (_error) {
    }
    this.buildOpts = (function (_this) {
        return function (routingTable) {
            var data, directive, domain, name, options, route, server, upstream, _i, _j, _len, _len1, _ref, _ref1, _ref2;
            options = {
                http_port: process.env.HTTP_PORT || 7005,
                https_port: process.env.HTTPS_PORT || 7448,
                use_ssl: process.env.USE_SSL || false,
                worker_processes: os.cpus().length,
                access_log: path.join(nginxPath, 'access.log'),
                error_log: path.join(nginxPath, 'error.log'),
                pidfile: path.join(_this.pidpath, 'nginx.pid'),
                temp_path: nginxTempPath != null ? nginxTempPath : void 0
            };
            for (name in routingTable) {
                data = routingTable[name];
                if (options.server == null) {
                    options.server = [];
                }
                if (Array.isArray(domain)) {
                    domain = data.domain.join(' ');
                } else {
                    domain = data.domain;
                }
                server = {
                    domain: domain,
                    name: name,
                    directives: []
                };
                if (data.directives != null) {
                    _ref = data.directives;
                    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
                        directive = _ref[_i];
                        server.directives.push({
                            directive: directive
                        });
                    }
                }
                options.server.push(server);
                if (options.upstream == null) {
                    options.upstream = [];
                }
                upstream = {
                    name: name,
                    method: (_ref1 = data.method) != null ? _ref1 : "least_conn",
                    routes: []
                };
                _ref2 = data.routes;
                for (_j = 0, _len1 = _ref2.length; _j < _len1; _j++) {
                    route = _ref2[_j];
                    upstream.routes.push({
                        host: route.host,
                        port: route.port
                    });
                }
                options.upstream.push(upstream);
            }
            return options;
        };
    })(this);
    this.writeFile = (function (_this) {
        return function (routingTable, cb) {
            var mustache, options, output, tableHash;
            tableHash = util.hashObj(routingTable);
            if (tableHash instanceof Error) {
                return cb(tableHash);
            }
            if (tableHash === _this.currentHash) {
                return cb(null, false);
            }
            options = _this.buildOpts(routingTable);
            options.mimePath = path.resolve(__dirname, '..', 'nginx', 'mime.types');

            try {
                fs.writeFileSync(path.join(nginxPath, 'nginx.conf'), template.render(options));
                _this.currentHash = tableHash;
                return cb(null, true);
            } catch (err) {
                _this.currentHash = void 0;
                return cb(err);
            }
        };
    })(this);
    this.reload = (function (_this) {
        return function (cb) {
            _this.nginx.kill('SIGHUP');
            _this.emit('reloading');
            return cb();
        };
    })(this);
    this.checkStale = (function (_this) {
        return function (cb) {
            return fs.readFile(path.join(_this.pidpath, 'nginx.pid'), function (err, buf) {
                var info, stalePid;
                if (err != null) {
                    return cb();
                } else {
                    stalePid = parseInt(buf.toString());
                    info = spawn('ps', ['-p', stalePid, '-o', 'comm']);
                    info.stdout.once('data', function (data) {
                        if (data.toString().indexOf('nginx') > -1) {
                            process.kill(stalePid);
                        }
                        return cb();
                    });
                    return info.on('error', function (err) {
                        return console.error("Err from staleness check", err);
                    });
                }
            });
        };
    })(this);
    this.start = (function (_this) {
        return function () {
            return _this.checkStale(function () {
                return _this.writeFile({}, function (err) {
                    var norespawn;
                    _this.nginx = spawn("nginx", ['-c', path.join(nginxPath, 'nginx.conf')]);
                    _this.nginx.on('error', function (err) {
                        console.error('Nginx must be installed for mako-minion', err);
                        throw err;
                    })
                    _this.emit('ready');
                    norespawn = false;
                    _this.on('norespawn', function () {
                        return norespawn = true;
                    });
                    return _this.nginx.once('exit', function (code, signal) {
                        if (!norespawn) {
                            return _this.start();
                        }
                    });
                });
            });
        };
    })(this);
    this.start();
    this.nginx = null;
    this.takedown = (function (_this) {
        return function () {
            _this.emit('norespawn');
            return _this.nginx.kill();
        };
    })(this);
    this.nginxlogrotate = (function (_this) {
        return function () {
            var file, files, loc, _i, _len, _results;
            files = ['error.log', 'access.log'];
            _results = [];
            for (_i = 0, _len = files.length; _i < _len; _i++) {
                file = files[_i];
                loc = path.join(nginxPath, file);
                _results.push((function (loc) {
                    return fs.stat(loc, function (err, stat) {
                        if (err != null) {
                            return console.error(err);
                        }
                        if (stat == null) {
                            return;
                        }
                        if (stat.size > process.env.MAXLOGFILESIZE || stat.size > 524288000) {
                            return fs.rename(loc, "" + loc + ".1", function (err) {
                                if (err != null) {
                                    return console.error(err);
                                }
                                return _this.nginx.kill('SIGUSR1');
                            });
                        }
                    });
                })(loc));
            }
            return _results;
        };
    })(this);
    setInterval((function (_this) {
        return function () {
            return _this.nginxlogrotate();
        };
    })(this), 60 * 1000);
    return this;
};

Router.prototype = new Stream;

router = new Router;

module.exports = router;
