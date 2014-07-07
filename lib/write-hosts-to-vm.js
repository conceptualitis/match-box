var fs = require('fs'),
    q = require('q'),
    path = require('path'),
    spawn = require('child_process').spawn,
    nconf = require('nconf');

// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });


var writeToVM = function (commands, def, i) {
    var pos = i || 0;
        child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'powershell.exe', '-Command', commands[pos]], {
            uid: process.env.SUDO_UID - 0
        });

    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(('Writing to VM: ' +  Math.ceil(i / commands.length * 100) + '%').progress);

    // when it's written, move to the next chunk
    child.on('close', function (code) {
        pos += 1;
        
        if (pos === commands.length) {
            def.resolve();
        } else {
            writeToVM(commands, def, pos);
        }
    });
};

module.exports = function (commands) {
    var def = q.defer();

    writeToVM(commands, def);

    return def.promise;
};
