var q = require('q'),
    path = require('path'),
    spawn = require('child_process').spawn,
    nconf = require('nconf');

// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });

module.exports = function () {
    var df = q.defer(),
        vmListProcess;

    // if the vm id isn't stored in settings
    if (!nconf.get('vm')) {
        console.log('Finding a VM...'.progress);

        // call the parallels list function, assigning user's uid to the child process
        vmListProcess = spawn('prlctl', ['list'], {
            uid: process.env.SUDO_UID - 0
        });

        // set the VM when the listing is done
        vmListProcess.stdout.on('data', function (stdout) {
            nconf.set('vm', /{(\S+)}/gi.exec(stdout.toString())[1]);
            nconf.save();
            console.log(('Found VM with id {' + nconf.get('vm') + '}').progress);
            df.resolve();
        });
    } else {
        console.log(('Using VM with id {' + nconf.get('vm') + '}').progress);
        df.resolve();
    }

    return df.promise;
};