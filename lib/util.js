var clone, crypto, hashObj, opter;

crypto = require('crypto');

clone = (function (_this) {
    return function (obj) {
        var key, newInstance;
        if ((obj == null) || typeof obj !== 'object') {
            return obj;
        }
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        if (obj instanceof RegExp) {
            return '';
        }
        newInstance = new obj.constructor();
        for (key in obj) {
            if (key === "process" || key === "respawn" || key === "minion") {
                continue;
            }
            newInstance[key] = clone(obj[key]);
        }
        return newInstance;
    };
})(this);

opter = function (arr) {
    var opt, opts, _i, _len;
    opts = {};
    for (_i = 0, _len = arr.length; _i < _len; _i++) {
        opt = arr[_i];
        if (!(opt.indexOf('--' === 1))) {
            continue;
        }
        opt = opt.replace('--', '');
        opts[opt] = true;
    }
    return opts;
};

hashObj = function (obj) {
    var e, md5sum, str;
    md5sum = crypto.createHash('md5');
    try {
        str = JSON.stringify(obj);
    } catch (_error) {
        e = _error;
        return e;
    }
    md5sum.update(str);
    return md5sum.digest('hex');
};

module.exports = {
    clone: clone,
    opter: opter,
    hashObj: hashObj,
    apiVersion: '1'
};
