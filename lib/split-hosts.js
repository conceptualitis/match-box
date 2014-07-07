// break hosts file into chunks smaller than 2048, so we can write them on the command line
module.exports = function (source, destination) {
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