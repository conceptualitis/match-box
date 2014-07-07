var fs = require('fs'),
    q = require('q'),
    exec = q.denodeify(require('child_process').exec),
    writeHost = require('./write-host');

var walk = function(dir, done) {
    var results = [],
        def = q.defer();

  fs.readdir(dir, function(err, list) {
    var pending = list.length;

    if (!pending) {
        return done(null, results);
    }

    list.forEach(function(file) {
        file = dir + '/' + file;
        fs.stat(file, function(err, stat) {
            if (stat && stat.isDirectory()) {
                walk(file, function(err, res) {
                    results = results.concat(res);
                    if (!--pending) done(null, results);
                });
            } else {
                if ((file.lastIndexOf('/hosts') + 6) === file.length) {
                    results.push(file);
                }
                if (!--pending) done(null, results);
            }
        });
    });
  });
};

module.exports = function (location) {
    var def = q.defer();

    if (!location) {
        def.resolve();
        return def.promise;
    }

    // create the directory where we'll mount the network drive
    if (!fs.existsSync('/Volumes/match-box')) {
        fs.mkdirSync('/Volumes/match-box');
    }

    console.log(('Mounting network drive: ' + location).progress);
    return exec('mount -t smbfs ' + location + ' /Volumes/match-box')
        .then(function () {
            var def = q.defer();

            walk('/Volumes/match-box', function (err, results) {
                def.resolve(results);
            });

            return def.promise;
        })
        .then(function (hosts) {
            var writePromises = [];

            hosts.forEach(function (dir, i) {
                writePromises.push(writeHost(dir));
            });

            return q.all(writePromises);
        })
        .then(function () {
            console.log(('Unmounting network drive: ' + location).progress);
            return exec('umount /Volumes/match-box');
        })
        .fail(function () {
            console.log('Unmounting the drive failed, this can happen if a Finder window is open to the location of the volume... And for other reasons'.error);
        });
};
