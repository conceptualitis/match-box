#! /usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    q = require('q'),
    nconf = require('nconf'),
    argv = require('minimist')(process.argv.slice(2)),
    colors = require('colors'),

    readFile = q.denodeify(fs.readFile),
    writeFile = q.denodeify(fs.writeFile),
    exec = q.denodeify(require('child_process').exec),
    spawn = require('child_process').spawn,
    environment = argv._[0],
    hostCmds = [],
    baseHosts, newHosts;

colors.setTheme({
    success: 'green',
    error: 'red',
    progress: 'yellow'
});

// set up defaults
nconf.defaults({
    address: 'match.dev'
});

// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });

// set keys
if (argv._[0] == 'set') {
    if (argv._[1] === undefined) {
        console.error('You need to pass a key to set!'.error);
        return;
    }
    nconf.set(argv._[1], argv._[2] || true);
    nconf.save();

    console.log((argv._[1] + ': ' + nconf.get(argv._[1])).success);
    return;
}

// needs to be run with sudo
if (!process.env.SUDO_UID) {
    console.error('Please run matchswitch with sudo.'.error);
    return;
}




// break hosts file into chunks smaller than 2048, so we can write them on the command line
var splitHosts = function (source, destination) {
    var hosts = ["'' | Out-File '" + destination + "'; "],
        cmdlimit = 1850, // windows cmd has limit of INTERNET_MAX_URL_LENGTH ( ~2048 characters )
        pos = 0;

    source.split('\n').forEach(function (val, i) {
        hosts[pos] += "'" + val.trim() + "' | Out-File '" + destination + "' -Append; ";

        if (hosts[pos].length >= cmdlimit) {
            pos += 1;
            hosts[pos] = '';
        }
    });

    return hosts;
};

var writeHostsLocally = function (directory) {
    var def = q.defer(),
        read;

    read = fs.createReadStream('/Volumes/match-box/' + directory + '/hosts');
    read.pipe(fs.createWriteStream('/etc/hosts.match' + directory.toLowerCase()));
    read.on('end', function () {
        hostCmds = hostCmds.concat(splitHosts(fs.readFileSync('/etc/hosts.match' + directory.toLowerCase()).toString(), '.match-box.' + directory.toLowerCase()));
        console.log(('Created hosts for ' + directory).progress);
        def.resolve();
    });

    return def.promise;
};

// function to write to the VM
var writeHostsToVM = function (def, i) {
    var pos = i || 0;
        child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'powershell.exe', '-Command', hostCmds[pos]], {
            uid: process.env.SUDO_UID - 0
        });

    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(('Writing to VM: ' +  Math.ceil(i / hostCmds.length * 100) + '%\n').progress);

    // when it's written, move to the next chunk
    child.on('close', function (code) {
        pos += 1;
        
        if (pos === hostCmds.length) {
            def.resolve();
        } else {
            writeHostsToVM(def, pos);
        }
    });
};


// mount a network drive with hosts files
if (argv.updatehosts || argv._[0] == 'updatehosts') {

    // backward compatibility for --updatehosts flag
    // supporting both matchswitch --updatehosts dev OR matchswitch dev --updatehosts
    // will remove in v1.0.0
    if (typeof argv.updatehosts === 'string') {
        environment = argv.updatehosts;
    }
    
    // no location defined...
    if (!nconf.get('sambaLocation')) {
        console.error('You need to define a network drive.'.error);
        console.log('Try running: matchswitch set sambaLocation [driveLocation]');
        return;
    }

    if (!fs.existsSync('/Volumes/match-box')) {
        fs.mkdirSync('/Volumes/match-box');
    }

    // mount the drive
    console.log(('Mounting network drive: ' + nconf.get('sambaLocation')).progress);
    exec('mount -t smbfs ' + nconf.get('sambaLocation') + ' /Volumes/match-box')
        .then(function () {
            var writePromises = [];
            // read the directories
            // looking for the envName/hosts format
            fs.readdirSync('/Volumes/match-box').forEach(function (val, i) {
                if (fs.existsSync('/Volumes/match-box/' + val + '/hosts')) {
                    writePromises.push(writeHostsLocally(val));
                }
            });

            return q.all(writePromises);
        }).then(function () {
            var def = q.defer();

            // write hosts to the vm, one chunk at a time
            writeHostsToVM(def, 0);

            return def.promise;
        }).then(function () {
            console.log(('Unmounting network drive: ' + nconf.get('sambaLocation')).progress);
            return exec('umount /Volumes/match-box');
        }).then(function () {
            // clean up the temp directory
            fs.rmdirSync('/Volumes/match-box');
        });

    // in only matchswitch updatehosts was run, we exit here
    if (argv._[0] == 'updatehosts') {
        return;
    }
}




var getVMID = function () {
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

// get the IP fresh every time
var getVMIP = function () {
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

        df.resolve();
    });

    return df.promise;
};

getVMID().then(getVMIP).then(function () {
        console.log(('Using IP of ' + nconf.get('ip')).progress);
        // find the base hosts
        return readFile('/etc/hosts.matchbackup');
    }).fail(function (err) {
        var hosts;

        // if it doesn't exist, create it by taking the existing
        // hosts file and adding a record pointing to the VM
        if (err.code === 'ENOENT') {
            hosts = fs.readFileSync('/etc/hosts').toString() + '\n\n#Match\n' + nconf.get('ip') + ' ' + nconf.get('address') + '\n';
            fs.writeFile('/etc/hosts.matchbackup', hosts);
            return hosts;
        }
    }).then(function (data) {
        // store the result from opening hosts.matchbackup
        baseHosts = data.toString();
        // open the file containing the match info
        return readFile('/etc/hosts.match' + environment);
    }).then(function (data) {
        var df = q.defer();

        // combine the host files
        newHosts = baseHosts + data.toString();

        console.log('Writing hosts file on VM...'.progress);
        var child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'copy', '/y', 'C:\\.match-box.' + environment, 'C:\\Windows\\System32\\drivers\\etc\\hosts'], {
            uid: process.env.SUDO_UID - 0
        });
        child.on('close', function (code) {
            df.resolve();
        });

        return df.promise;
    }).then(function () {
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
    }).then(function () {
        // write locally
        console.log('Writing hosts locally...'.progress);
        return writeFile('/etc/hosts', newHosts);
    }).then(function () {
        // flush the DNS cache
        return exec('dscacheutil -flushcache');
    }).then(function () {
        console.log('Done!'.success);
    });
