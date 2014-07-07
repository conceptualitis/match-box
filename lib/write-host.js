var fs = require('fs'),
    q = require('q');

module.exports = function (directory) {
    var def = q.defer(),
        read,
        envName = directory.replace('/hosts', '').replace('/Volumes/match-box/', '').replace('/', '.', 'gi').toLowerCase();

    read = fs.createReadStream(directory);
    read.pipe(fs.createWriteStream('/etc/matchswitch.' + envName + '.hosts'));
    read.on('end', function () {
        console.log(('Created hosts for ' + envName).progress);
        def.resolve();
    });

    return def.promise;
};
