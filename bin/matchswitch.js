#! /usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    q = require('q'),
    nconf = require('nconf'),
    argv = require('minimist')(process.argv.slice(2)),
    readFile = q.denodeify(fs.readFile),
    writeFile = q.denodeify(fs.writeFile),
    exec = q.denodeify(require('child_process').exec),
    spawn = require('child_process').spawn,
    environment = argv._[0],
    baseHosts, newHosts;

// set up defaults
nconf.defaults({
    address: 'match.dev'
});

// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });

if (argv._[0] == 'set') {
    nconf.set(argv._[1], argv._[2] || true);
    console.log(argv._[1] + ' set to ' + nconf.get(argv._[1]));
    nconf.save();
    return;
}

if (!process.env.SUDO_UID) {
    console.log('Please run this with sudo');
    return;
}

// mount a network drive with hosts files
if (nconf.get('sambaLocation') && argv.updatehosts) {
    if (!fs.existsSync('/Volumes/match-box')) {
        fs.mkdirSync('/Volumes/match-box');
    }

    // mount the drive
    exec('mount -t smbfs ' + nconf.get('sambaLocation') + ' /Volumes/match-box')
        .then(function () {
            // read the directories
            // looking for the envName/hosts format
            fs.readdirSync('/Volumes/match-box').forEach(function (val, i) {
                if (fs.existsSync('/Volumes/match-box/' + val + '/hosts')) {
                    fs.createReadStream('/Volumes/match-box/' + val + '/hosts').pipe(fs.createWriteStream('/etc/hosts.match' + val.toLowerCase()));
                }
            });

            return exec('umount /Volumes/match-box');
        }).then(function () {
            // clean up the temp directory
            fs.rmdirSync('/Volumes/match-box');
        });
}


(function () {
    var df = q.defer(), dStream, dList;
    
    // use the VM ID or find it
    if (!nconf.get('vm')) {
        dList = spawn('prlctl', ['list'], {
            uid: process.env.SUDO_UID - 0
        });

        dList.stdout.on('data', function (stdout) {
            nconf.set('vm', /{(\S+)}/gi.exec(stdout.toString())[1]);
            nconf.save();

            dStream = spawn('prlctl', ['exec', nconf.get('vm'), 'ipconfig'], {
                uid: process.env.SUDO_UID - 0
            });

            dStream.stdout.on('data', function (data) {
                df.resolve(data.toString());
            });
        });
    } else {
        dStream = spawn('prlctl', ['exec', nconf.get('vm'), 'ipconfig'], {
            uid: process.env.SUDO_UID - 0
        });

        dStream.stdout.on('data', function (data) {
            df.resolve(data.toString());
        });
    }


    return df.promise;
})().then(function (stdout) {
        var reg = /ipv4 address[\.\s]+:\s+([\.0-9]+)/gi,
            matches, ip;

        while ((matches = reg.exec(stdout)) !== null) {
            ip = matches[1];
        }

        // use the last match
        nconf.set('ip', ip);

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
        var df = q.defer(), winWrite = [], hostsCmd = [], pos = 0, cmdlimit = 1850; // windows cmd has limit of INTERNET_MAX_URL_LENGTH ( ~2048 characters )
        // combine the host files
        newHosts = baseHosts + data.toString();

        // function to write to the VM
        var writeSection = function (cmds, i) {
            // write the command chunk into the VM's temp file
            var child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'powershell.exe', '-Command', cmds[i]], {
                uid: process.env.SUDO_UID - 0
            });
            // when it's written, move to the next chunk
            child.on('close', function (code) {
                i += 1;
                
                if (i === cmds.length) {
                    // when all of them are written we copy the temp file's contents to hosts, was unable to edit hosts directly so this is a workaround
                    var child = spawn('prlctl', ['exec', nconf.get('vm'), 'cmd', '/c', 'copy', '/y', 'C:\\.match-box.tmp', 'C:\\Windows\\System32\\drivers\\etc\\hosts'], {
                        uid: process.env.SUDO_UID - 0
                    });
                    child.on('close', function (code) {
                        df.resolve();
                    });
                } else {
                    writeSection(cmds, i);
                }
            });
        };

        // break hosts file into chunks smaller than 2048, so we can write them on the command line
        hostsCmd[0] = "'' | Out-File '.match-box.tmp'; ";
        newHosts.split('\n').forEach(function (val, i) {
            hostsCmd[pos] += "'" + val.trim() + "' | Out-File '.match-box.tmp' -Append; ";

            if (hostsCmd[pos].length >= cmdlimit) {
                pos += 1;
                hostsCmd[pos] = '';
            }
        });

        console.log("Writing hosts file to VM...");
        writeSection(hostsCmd, 0);

        return df.promise;
    }).then(function () {
        // write locally
        console.log("Writing hosts locally...");
        return writeFile('/etc/hosts', newHosts);
    }).then(function () {
        // flush the DNS cache
        exec('dscacheutil -flushcache');
    });
