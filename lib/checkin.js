var Checkin, router, runner, util, debug, request;

debug = require('debug-levels')('checkin');

request = require('request');

runner = require('../lib/runner');

util = require('../lib/util');

router = require('../lib/router');

Checkin = function () {
    var $ = {};


    $.interval = null;

    $.masterFound = false;

    $.opts = {
        hostname: process.env.MASTER_HOST || "localhost",
        port: process.env.MASTER_PORT || 4001,
        secret: process.env.MASTER_PASS || 'shortfin',
        checkinLog: process.env.CHECKIN_LOG || false,
        checkinInterval: process.env.CHECKIN_INTERVAL || 1000,
        timeout: process.env.MASTER_CONNECTION_TIMEOUT || 1000
    };

    debug.info('host', $.opts.hostname, $.opts.port);

    $.hostUrl = "http://" + $.opts.hostname + ":" + $.opts.port;

    $.checkinMaxWait = 1000 * 10;

    $.checkinWait = 500;

    $.parseJSON = function (str) {
        var err;
        try {
            str = JSON.parse(str);
        } catch (_error) {
            err = _error;
        }
        return str;
    };

    $.postJSON = function (arg, opts, cb) {
        var url;
        url = "" + $.hostUrl + "/" + arg;

        return request({
            json: opts,
            auth: {
                user: "minion",
                pass: $.opts.secret
            },
            url: url,
            timeout: $.opts.timeout
        }, function (error, response, body) {
            body = $.parseJSON(body);
            return cb(error, body);
        });
    };

    $.getJSON = function (arg, cb) {
        var url;
        url = "" + $.hostUrl + "/" + arg;
        return request.get({
            url: url,
            auth: {
                user: "minion",
                pass: $.opts.secret
            }
        }, function (error, response, body) {
            body = $.parseJSON(body);
            return cb(error, body);
        });
    };

    $.startCheckin = function () {
        var checkinMessage, sendCheckin;

        checkinMessage = function () {

            debug.verbose('sending');
            return {
                secret: $.opts.secret,
                type: "checkin",
                id: runner.minionId.toString(),
                processes: util.clone(runner.processes),
                routingTableHash: router.currentHash,
                apiVersion: util.apiVersion
            };
        };

        sendCheckin = function () {
            $.postJSON('checkin', checkinMessage(), function (err, result) {
                if (err != null) {
                    if (err['code'] != undefined && err.code !== 'ECONNREFUSED') {
                        debug.error('send', err);
                        process.exit(1);
                    }

                    if (err.code === 'ECONNREFUSED' && $.masterFound) {
                        debug.warn('lost master', err);
                        $.masterFound = false;
                    }

                    setTimeout(sendCheckin, $.opts.checkinInterval);


                } else if (result['type'] != undefined && result.type === 'routing') {
                    if (!$.masterFound) {
                        debug.info('master found');
                        $.masterFound = true;
                    }

                    router.writeFile(result.body, function (err, action) {
                        if (err != null) {
                            debug.error('router', err);
                        } else {
                            router.reload(function () {
                                debug.verbose('router', 'reload', JSON.stringify(result));
                            });
                        }

                        setTimeout(sendCheckin, $.opts.checkinInterval);

                    });
                } else {
                    setTimeout(sendCheckin, $.opts.checkinInterval);

                }
            });
        }

        debug.info('checkin interval', $.opts.checkinInterval);
        debug.info('starting checkins');
        debug.info('waiting for master');
        sendCheckin();

    }


    return $;
}

module.exports = function () {
    return Checkin();
};


