var Gitter, Stream, exec, find, fs, git, path, rimraf, throwUnlessExists, shelljs;

shelljs = require('shelljs');

Stream = require('stream').Stream;

exec = require('child_process').exec;

fs = require('fs');

path = require('path');

rimraf = require('rimraf');

find = require('findit');

git = require('gift');

throwUnlessExists = function (err) {
    if (err != null) {
        if (err.toString().split(' ')[1] !== "EEXIST,") {
            throw err;
        }
    }
};

Gitter = function (opts) {
    var base, err;
    if (opts == null) {
        opts = {};
    }
    base = opts.basedir || process.cwd();
    this.repodir = path.resolve(opts.repodir || path.join(base, 'repos'));
    this.deploydir = path.resolve(opts.deploydir || path.join(base, 'deploy'));
    try {
        fs.mkdirSync(this.repodir);
    } catch (_error) {
        err = _error;
        throwUnlessExists(err);
    }
    try {
        return fs.mkdirSync(this.deploydir);
    } catch (_error) {
        err = _error;
        return throwUnlessExists(err);
    }
};

Gitter.prototype = new Stream;

Gitter.prototype.fetch = function (repo, url, cb) {
    var fetchdir;
    fetchdir = path.join(this.repodir, repo);
    return fs.mkdir(fetchdir, function (err) {
        throwUnlessExists(err);
        if (!shelljs.test('-f', path.join(fetchdir, 'HEAD'))) {
            shelljs.exec('git init --bare ' + fetchdir, {silent:false});
        }

        shelljs.exec('cd ' + fetchdir + ' && git fetch ' + url, {silent:false}, function(code,output){
            if (code == 0){
                return cb(null);
            } else {
                shellsjs.rm('-rf', fetchdir);
                return cb (new Error(output));
            }
        });


    });
};

Gitter.prototype.deploy = function (opts, cb) {
    var checkoutdir, commit, innerDeploy, name, pid, targetrepo;
    name = opts.name;
    commit = opts.commit;
    pid = opts.pid;
    if ((name == null) || (commit == null) || (pid == null)) {
        return cb(new Error("Insufficient args"));
    } else if (commit === 'LATEST'){
        return cb(new Error("Invalid commit; repo not pushed to master"));
    }
    checkoutdir = path.join(this.deploydir, "" + name + "." + pid + "." + commit);
    targetrepo = path.join(this.repodir, name);
    fs.exists(targetrepo, (function (_this) {
        return function (exists) {
            var master;
            if (exists) {
                return innerDeploy();
            }
            master = {
                hostname: process.env.MASTER_HOST || "localhost",
                port: process.env.MASTER_GITPORT || 4001,
                secret: process.env.MASTER_PASS || 'shortfin'
            };
            return _this.fetch(name, "http://git:" + master.secret + "@" + master.hostname + ":" + master.port + "/" + name + "/", function (err) {
                if (err != null) {
                    return cb(err);
                }
                return innerDeploy();
            });
        };
    })(this));
    return innerDeploy = (function (_this) {
        return function () {
            return fs.exists(checkoutdir, function (exists) {
                if (exists) {
                    return cb(null, false);
                }
                return git.clone(targetrepo, checkoutdir, function (err, repo) {
                    if (err != null) {
                        return cb(err);
                    }
                    return repo.checkout(commit, function (errr) {
                        if (err != null) {
                            return cb(err);
                        }
                        _this.emit('deploy', {
                            repo: name,
                            commit: commit,
                            cwd: checkoutdir
                        });
                        return cb(err, true);
                    });
                });
            });
        };
    })(this);
};

Gitter.prototype.check = function (opts, cb) {
    var checkoutdir;
    checkoutdir = path.join(this.deploydir, "" + opts.name + "." + opts.pid + "." + opts.commit);
    return exec("git ls-tree -r " + opts.commit, {
        cwd: checkoutdir
    }, (function (_this) {
        return function (err, stdout) {
            var actual_files, arr, arr2, expected_files, file, file_data, finder, _i, _len;
            if (err) {
                return cb(err, false);
            }
            file_data = stdout.split('\n');
            expected_files = [];
            for (_i = 0, _len = file_data.length; _i < _len; _i++) {
                file = file_data[_i];
                arr = file.split(' ');
                if (arr.length === 1) {
                    continue;
                }
                arr2 = arr[2].split('\t');
                expected_files.push({
                    mode: arr[0],
                    type: arr[1],
                    sha: arr2[0],
                    name: arr2[1]
                });
            }
            if (expected_files.length === 0) {
                return cb(new Error('empty repository', false));
            }
            actual_files = [];
            finder = find(checkoutdir);
            finder.on('file', function (file) {
                return actual_files.push({
                    name: path.relative(checkoutdir, file)
                });
            });
            finder.on('link', function (file) {
                return actual_files.push({
                    name: path.relative(checkoutdir, file)
                });
            });
            finder.on('directory', function (dir, stat, stop) {
                if (dir.indexOf('.git') > -1) {
                    return stop();
                }
            });
            return finder.on('end', function () {
                var file_names, _j, _len1;
                if (actual_files.length !== expected_files.length) {
                    return cb(null, false);
                }
                file_names = actual_files.map(function (file) {
                    return file.name;
                });
                for (_j = 0, _len1 = expected_files.length; _j < _len1; _j++) {
                    file = expected_files[_j];
                    if (file_names.indexOf(file.name) < 0) {
                        return cb(new Error('file missing'), false);
                    }
                }
                return cb(null, true);
            });
        };
    })(this));
};

Gitter.prototype.deploy_and_check = function (opts, cb) {
    return this.deploy(opts, (function (_this) {
        return function (err, actionTaken) {
            if (err != null) {
                return cb(err);
            }
            return _this.check(opts, function (err, complete) {
                if (err != null) {
                    return cb(err);
                }
                if (!complete) {
                    return cb(new Error('checkout incomplete'));
                }
                return cb(null, actionTaken);
            });
        };
    })(this));
};

module.exports = function (opts) {
    return new Gitter(opts);
};
