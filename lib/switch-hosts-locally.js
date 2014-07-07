var fs = require('fs'),
    q = require('q'),
    path = require('path'),
    readFile = q.denodeify(fs.readFile),
    writeFile = q.denodeify(fs.writeFile),
    exec = q.denodeify(require('child_process').exec),
    nconf = require('nconf');

// find the settings file
nconf.file({ file: path.join(process.env.HOME, '.match-box') });

module.exports = function (environment) {
    var baseHosts;

    // find the base hosts
    return readFile('/etc/hosts.matchbackup')
        .fail(function (err) {
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
            return readFile('/etc/matchswitch.' + environment + '.hosts');
        }).then(function (data) {
            var df = q.defer();

            // combine the host files
            df.resolve(baseHosts + data.toString());

            return df.promise;
        }).then(function (data) {
            // write locally
            console.log('Writing hosts locally...'.progress);
            return writeFile('/etc/hosts', data);
        })
        .then(function () {
            // flush the DNS cache
            console.log('Flushing DNS locally...'.progress);
            return exec('dscacheutil -flushcache');
        });
};
