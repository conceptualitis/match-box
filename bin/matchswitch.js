#! /usr/bin/env node

var exec = require('child_process').exec,
    fs = require('fs'),
    q = require('q'),
    argv = require('minimist')(process.argv.slice(2)),
    readFile = q.denodeify(fs.readFile),
    writeFile = q.denodeify(fs.writeFile),
    environment = argv._[0],
    baseHosts;

// find the base hosts
readFile('/etc/hosts.matchbackup')
    .fail(function (err) {
        var hosts;

        if (!argv.ip || !argv.address) {
            return;
        }

        // if it doesn't exist, create it by taking the existing
        // hosts file and adding a record pointing to the VM
        if (err.code === 'ENOENT') {
            hosts = fs.readFileSync('/etc/hosts').toString() + '\n\n#Match\n' + argv.ip + ' ' + argv.address + '\n';
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
