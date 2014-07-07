var q = require('q'),
    path = require('path'),
    spawn = require('child_process').spawn,
    nconf = require('nconf');

// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });

// get the IP fresh every time
module.exports = function () {
    var df = q.defer(),
        reg = /ipv4 address[\.\s]+:\s+([\.0-9]+)/gi,
        response,
        matches,
        ip,
        vmIPProcess;

    console.log('Finding the VM\'s IP...'.progress);

    // start the process to list all the ip information on the VM
    vmIPProcess = spawn('prlctl', ['exec', nconf.get('vm'), 'ipconfig'], {
        uid: process.env.SUDO_UID - 0
    });

    vmIPProcess.stdout.on('data', function (data) {
        response = data.toString();

        if (!reg.test(response)) {
            return;
        }

        // cycle through to the last match...
        // regexp ripe for improvement here x_x
        while ((matches = reg.exec(response)) !== null) {
            ip = matches[1];
        }

        // use the last match
        nconf.set('ip', ip);

        console.log(('Using IP of ' + nconf.get('ip')).progress);

        df.resolve();
    });

    return df.promise;
};