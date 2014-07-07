var fs = require('fs'),
    q = require('q'),
    path = require('path'),
    readFile = q.denodeify(fs.readFile),
    writeFile = q.denodeify(fs.writeFile),
    spawn = require('child_process').spawn,
    nconf = require('nconf');

// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });

module.exports = function (environment) {
    var df = q.defer();

    if (nconf.get('vm.prop')) {
        var child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'copy', '/y', 'C:\\.matchswitch.' + environment + '.hosts', 'C:\\Windows\\System32\\drivers\\etc\\hosts'], {
            uid: process.env.SUDO_UID - 0
        });
        child.on('close', function (code) {
            df.resolve();
        });
    } else {
        df.resolve();
    }

    return df.promise.then(function () {
        // flush dns
        var def = q.defer();

        console.log('Flushing VM DNS...'.progress);

        var child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'ipconfig', '/flushdns'], {
            uid: process.env.SUDO_UID - 0
        });
        child.on('close', function (code) {
            def.resolve();
        });

        return def.promise;
    }).then(function () {
        // restart iis
        var def = q.defer();

        console.log('Restarting IIS...'.progress);

        var child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'iisreset', '/noforce'], {
            uid: process.env.SUDO_UID - 0
        });
        child.on('close', function (code) {
            def.resolve();
        });

        return def.promise;
    });
};
