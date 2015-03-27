var Cleaner, Stream, fs, path, rimraf, runner;

Stream = require('stream').Stream;

runner = require('../lib/runner');

rimraf = require('rimraf');

fs = require('fs');

path = require('path');

Cleaner = function () {
    setInterval((function (_this) {
        return function () {
            return _this.clean(function () {
            });
        };
    })(this), 60 * 1000);
    return this;
};

Cleaner.prototype = new Stream;

Cleaner.prototype.clean = function (cb) {
    var checkDone, deploydir, errs, total;
    deploydir = runner.deploydir;
    total = 0;
    errs = [];
    fs.readdir(deploydir, (function (_this) {
        return function (err, files) {
            var dir, i, _i, _len, _results;
            total = files.length - 1;
            if (err != null) {
                throw err;
            }
            _results = [];
            for (i = _i = 0, _len = files.length; _i < _len; i = ++_i) {
                dir = files[i];
                _results.push((function (dir, i) {
                    var pid;
                    pid = dir.split('.')[1];
                    if (dir.charAt(0) === '.') {
                        return checkDone(i);
                    }
                    if (Object.keys(runner.processes).indexOf(pid) > -1) {
                        return checkDone(i);
                    }
                    return _this.rmIfDir(path.join(deploydir, dir), function (err) {
                        if (errs == null) {
                            errs = [];
                        }
                        if (err != null) {
                            errs.push(err);
                        }
                        return checkDone(i);
                    });
                })(dir, i));
            }
            return _results;
        };
    })(this));
    return checkDone = function (i) {
        if (i === total) {
            if (errs.length === 0) {
                errs = null;
            }
            return cb(errs);
        }
    };
};

Cleaner.prototype.rmIfDir = function (dir, cb) {
    return fs.stat(dir, (function (_this) {
        return function (err, stats) {
            if (!stats.isDirectory()) {
                return cb(null);
            }
            return rimraf(dir, function (err) {
                if (err == null) {
                    _this.emit('pruned directory', dir);
                }
                return cb(err);
            });
        };
    })(this));
};

module.exports = new Cleaner;
