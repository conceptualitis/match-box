#! /usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    q = require('q'),
    nconf = require('nconf'),
    argv = require('minimist')(process.argv.slice(2)),
    readFile = q.denodeify(fs.readFile),
    writeFile = q.denodeify(fs.writeFile),
    exec = q.denodeify(require('child_process').exec),
    environment = argv._[0],
    baseHosts;

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


(function () {
    // use the VM ID or find it
    if (!nconf.get('vm')) {
        return exec('prlctl list')
            .then(function (stdout) {
                nconf.set('vm', /{(\S+)}/gi.exec(stdout)[1]);
                nconf.save();
                return exec('prlctl exec ' + nconf.get('vm') + ' ipconfig');
            });
    }
    return exec('prlctl exec ' + nconf.get('vm') + ' ipconfig');
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
        // combine the host files
        return writeFile('/etc/hosts', baseHosts + data.toString());
    }).then(function () {
        // flush the DNS cache
        exec('dscacheutil -flushcache');
    });
