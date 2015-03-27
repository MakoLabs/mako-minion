var Minion, Stream, exec, fs, gitter, path, minion, spawn, util;

path = require('path');

util = require('util');

Stream = require('stream').Stream;

spawn = require('child_process').spawn;

exec = require('child_process').exec;

fs = require('fs');

gitter = require('../lib/gitter')();

Minion = function (opts) {
    var base;
    if (opts == null) {
        opts = {};
    }
    this.processes = {};
    this.minionId = process.env.MINION_ID || ("minion-" + (Math.floor(Math.random() * (1 << 24)).toString(16)));
    base = process.env.BASEDIR || process.cwd();
    this.deploydir = path.resolve(process.env.DEPLOYDIR || path.join(base, 'deploy'));
    return this;
};

Minion.prototype = new Stream;

Minion.prototype.generateEnv = function (supp, opts) {
    var env, k, v, _ref, _ref1;
    env = {};
    _ref = process.env;
    for (k in _ref) {
        v = _ref[k];
        env[k] = v;
    }
    _ref1 = opts.env;
    for (k in _ref1) {
        v = _ref1[k];
        env[k] = v;
    }
    return env;
};

Minion.prototype.spawn = function (opts, cb) {
    var commit, deployOpts, dir, id, procInfo, repo;
    id = opts.testingPid || Math.floor(Math.random() * (1 << 24)).toString(16);
    repo = opts.repo;
    commit = opts.commit;
    dir = opts.cwd || path.join(this.deploydir, "" + repo + "." + id + "." + commit);
    deployOpts = {
        pid: id,
        name: repo,
        commit: commit
    };
    procInfo = {
        minion: this.minionId,
        id: id,
        repo: repo,
        commit: commit
    };
    this.processes[id] = {
        id: id,
        status: 'spawning',
        repo: repo,
        commit: commit,
        opts: opts,
        cwd: dir
    };
    return fs.exists(dir, (function (_this) {
        return function (exists) {
            if (exists) {
                return _this.runSetup(opts, dir, id, cb);
            } else {
                return gitter.deploy_and_check(deployOpts, function (err, actionTaken) {
                    if (err != null) {
                        _this.emitErr("error", err, procInfo);
                        if (_this.processes[id]) {
                            _this.processes[id].status = 'stopped';
                        }
                        return cb({});
                    }
                    return _this.runSetup(opts, dir, id, cb);
                });
            }
        };
    })(this));
};

Minion.prototype.runSetup = function (opts, dir, id, cb) {
    var firstSpawn, procInfo;
    procInfo = {
        minion: this.minionId,
        id: id,
        repo: opts.repo,
        commit: opts.commit
    };
    firstSpawn = (function (_this) {
        return function () {
            _this.respawn(opts, dir, id);
            if (cb != null) {
                return cb(_this.processes[id]);
            }
        };
    })(this);
    if ((opts.setup != null) && Array.isArray(opts.setup)) {
        return exec(opts.setup.join(' '), {
            cwd: dir,
            env: this.generateEnv(opts.env, opts)
        }, (function (_this) {
            return function (err, stdout, stderr) {
                if (err != null) {
                    _this.emitErr("error", err, procInfo);
                }
                if (err != null) {
                    if (_this.processes[id]) {
                        _this.processes[id].status = 'stopped';
                    }
                    return cb({});
                }
                _this.emit("setupComplete", {
                    stdout: stdout,
                    stderr: stderr
                }, procInfo);
                return firstSpawn();
            };
        })(this));
    } else {
        return firstSpawn();
    }
};

Minion.prototype.deploy = (function (_this) {
    return function (opts, cb) {
        var innerOpts;
        innerOpts = {
            pid: opts.id,
            name: opts.repo,
            commit: opts.commit
        };
        return gitter.deploy_and_check(innerOpts, function (err) {
            if (err) {
                return cb(err);
            }
            return cb(null);
        });
    };
})(this);

Minion.prototype.stop = function (ids) {
    var id, proc, _i, _len;
    if (!Array.isArray(ids)) {
        ids = [ids];
    }
    for (_i = 0, _len = ids.length; _i < _len; _i++) {
        id = ids[_i];
        proc = this.processes[id];
        if (proc == null) {
            return false;
        }
        this.emit("stop", this.processes[id]);
        proc.status = "stopped";
        proc.process.kill();
    }
};

Minion.prototype.restart = function (ids) {
    var id, proc, _i, _len;
    if (!Array.isArray(ids)) {
        ids = [ids];
    }
    for (_i = 0, _len = ids.length; _i < _len; _i++) {
        id = ids[_i];
        proc = this.processes[id];
        if (proc == null) {
            return false;
        }
        this.emit("restart", this.processes[id]);
        proc.process.kill();
    }
};

Minion.prototype.emitErr = function () {
    if (this.listeners('error').length > 0) {
        return this.emit.apply(this, arguments);
    }
};

Minion.prototype.respawn = function (opts, dir, id) {
    var args, cmd, env, innerProcess, procInfo;
    env = this.generateEnv(opts.env, opts);
    cmd = opts.command[0];
    args = opts.command.slice(1);
    procInfo = {
        minion: this.minionId,
        id: id,
        repo: opts.repo,
        commit: opts.commit
    };
    innerProcess = spawn(cmd, args, {
        cwd: dir,
        env: env
    });
    this.processes[id] = {
        id: id,
        status: "running",
        repo: opts.repo,
        commit: opts.commit,
        command: opts.command,
        opts: opts,
        cwd: dir,
        process: innerProcess,
        respawn: this.respawn,
        minion: this.minionId
    };
    innerProcess.stdout.on("data", (function (_this) {
        return function (buf) {
            return _this.emit("stdout", buf, procInfo);
        };
    })(this));
    innerProcess.stderr.on("data", (function (_this) {
        return function (buf) {
            return _this.emit("stderr", buf, procInfo);
        };
    })(this));
    innerProcess.on("error", this.error_handler(procInfo, opts, dir));
    innerProcess.once("exit", this.exit_handler(id, opts, dir));
    return this.emit("spawn", {
        minion: this.minionId,
        id: id,
        repo: opts.repo,
        commit: opts.commit,
        command: opts.command,
        cwd: dir
    });
};

Minion.prototype.error_handler = function (procInfo, opts, dir) {
    var id;
    id = procInfo.id;
    return (function (_this) {
        return function (err) {
            return _this.emitErr("error", err, {
                minion: _this.minionId,
                id: id,
                repo: opts.repo,
                commit: opts.commit
            });
        };
    })(this);
};

Minion.prototype.exit_handler = function (id, opts, dir) {
    return (function (_this) {
        return function (code, signal) {
            var proc;
            proc = _this.processes[id];
            _this.emit("exit", code, signal, {
                minion: _this.minionId,
                id: id,
                repo: opts.repo,
                commit: opts.commit,
                command: opts.command
            });
            if (opts.once) {
                return delete _this.processes[id];
            } else if (proc.status !== "stopped") {
                proc.status = "respawning";
                return setTimeout(function () {
                    if (proc.status !== "stopped") {
                        return _this.respawn(opts, dir, id);
                    }
                }, opts.debounce || 1000);
            } else if (proc.status === "stopped") {
                return delete _this.processes[id];
            }
        };
    })(this);
};

Minion.prototype.started = new Date().toISOString();

minion = new Minion();

module.exports = minion;

