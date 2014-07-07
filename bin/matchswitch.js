#! /usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    q = require('q'),
    nconf = require('nconf'),
    argv = require('minimist')(process.argv.slice(2)),
    colors = require('colors'),

    readHostsFromSMBFS = require('../lib/read-hosts-from-smbfs'),
    readHostsFromLocal = require('../lib/read-hosts-from-local'),
    writeHostsToVM = require('../lib/write-hosts-to-vm'),
    getVMIP = require('../lib/get-vm-ip'),
    getVMID = require('../lib/get-vm-id'),
    switchHostsLocally = require('../lib/switch-hosts-locally'),
    switchHostsOnVM = require('../lib/switch-hosts-on-vm'),

    readFile = q.denodeify(fs.readFile),
    environment = argv._[0];

colors.setTheme({
    success: 'green',
    error: 'red',
    progress: 'yellow'
});


// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });

// set up defaults
nconf.defaults({
    'address': 'match.dev',
    'vm.prop': true
});


// set keys
if (argv._[0] == 'set') {
    if (argv._[1] === undefined) {
        console.error('You need to pass a key to set!'.error);
        return;
    }

    if (argv._[2] === undefined) {
        argv._[2] = true;
    }

    nconf.set(argv._[1], (argv._[2] === 'true' || argv._[2] === 'false') ? argv._[2] === 'true' : argv._[2]);
    nconf.save();

    console.log((argv._[1] + ': ' + argv._[2] || true).success);
    return;
}

// needs to be run with sudo
if (!process.env.SUDO_UID) {
    console.error('Please run matchswitch with sudo.'.error);
    return;
}

// revert to old hosts
if (argv._[0] == 'clear') {
    console.log('Reverting to original hosts'.progress);

    readFile('/etc/hosts.matchbackup')
        .then(function (oldHosts) {
            fs.writeFile('/etc/hosts', oldHosts);
            console.log('Done!'.success);
        }, function () {
            console.log('No hosts file found, create with the updatehosts command.'.error);
        });
    return;
}

// hosts drive backwards compatibility, will be gone in 1.0.0
if (nconf.get('sambaLocation') && !nconf.get('hosts.location')) {
    nconf.set('hosts.location', nconf.get('sambaLocation'));
    nconf.save();
}

// mount a network drive with hosts files
if (argv.updatehosts || argv._[0] == 'updatehosts') {

    // backward compatibility for --updatehosts flag
    // supporting both matchswitch --updatehosts dev OR matchswitch dev --updatehosts
    // will remove in v1.0.0
    if (typeof argv.updatehosts === 'string') {
        environment = argv.updatehosts;
    }

    readHostsFromSMBFS(nconf.get('hosts.location'))
        .then(readHostsFromLocal)
        .then(writeHostsToVM)
        .then(function () {
            console.log('\nDone!'.success);
        });

    // in only matchswitch updatehosts was run, we exit here
    if (argv._[0] == 'updatehosts') {
        return;
    }
}


getVMID()
    .then(getVMIP)
    .then(function () {
        return switchHostsLocally(environment);
    })
    .then(function () {
        return switchHostsOnVM(environment);
    })
    .then(function () {
        console.log('Done!'.success);
    });
