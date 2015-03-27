var net, porter;

net = require('net');

porter = {};

porter.basePort = 8000;

porter.neverTwice = false;

porter.getPort = function (options, callback) {
    var onError, onListen;
    if (!callback) {
        callback = options;
        options = {};
    }
    options.port = options.port || porter.marker || porter.basePort;
    options.host = options.host || null;
    options.server = options.server || net.createServer();
    onListen = function () {
        options.server.removeListener('error', onError);
        options.server.close();
        if (porter.neverTwice) {
            porter.marker = options.port + 1;
        }
        if (porter.upperLimit) {
            if (porter.marker > porter.upperLimit) {
                porter.marker = porter.basePort;
            }
        }
        return callback(null, options.port);
    };
    onError = function (err) {
        options.server.removeListener('listening', onListen);
        if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
            return callback(err);
        }
        return porter.getPort({
            port: porter.nextPort(options.port),
            host: options.host,
            server: options.server
        }, callback);
    };
    options.server.once('error', onError);
    options.server.once('listening', onListen);
    options.server.listen(options.port, options.host);
    return porter.nextPort = function (port) {
        return port + 1;
    };
};

module.exports = porter;

