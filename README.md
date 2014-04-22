# Match-Box

A collection of tools for developers working with .NET on OSX



## Installation

- Make sure you have [Node](http://nodejs.org/download/)
- Install with `npm install -g match-box`



## Match Switch

Match switch can be used to change the hosts file on the Mac as well as the hosts of the Windows VM.

### Setup

With SMB drive:

1.  Tell match switch where to find the hosts: `matchswitch set hosts.location smb://your.network/location/here`. Note: it looks for hosts files in the format of [env]/hosts, so something like america/hosts, brazil/hosts, etc.
2. If you want to set a custom url (default is `match.dev`) to access in the browser, run: `matchswitch set address [your.url.here]`
3. Pull in the latest hosts from the network and push them to your VM: `sudo matchswitch updatehosts`. This might take a while.

Without SMB drive:

1. Set up hosts in your /etc/hosts directory in this format: hosts.match[env], so something like hosts.matchamerica, hosts.matchbrazil, etc.
2. If you want to set a custom url (default is `match.dev`) to access in the browser, run: `matchswitch set address [your.url.here]`
3. Push the hosts to your VM: `sudo matchswitch updatehosts`. This might take a while.

### General Usage

`sudo matchswitch [env]`

It's pretty simple. Match switch will take the environments from the network directory and use them. So, if you had hosts in the /america directory, you would switch like this:

`sudo matchswitch america`

### Clearing Hosts

You can revert your hosts file by running `matchswitch clear`

### Updating Hosts

Match switch pull hosts from the network drive (and pushes them to your VM) only when you run `sudo matchswitch updatehosts`. It's a good idea to run this command after updating or whenever you know the hosts on your machine are stale.

### Options

Options for the tool can be set by running `matchswitch set [key.name] [value]`.

- `address`: the default address for development that match switch uses is `match.dev`. If this isn't what you want, change it here.
- `hosts.location`: if you have hosts files defined on an SMB drive somewhere, set this option to the network location
- `vm`: if you have more than one VM, you can specify an ID for match switch to use. If you only have one, match switch will automatically detect the ID.
- `vm.prop`: if you don't want to propagate your hosts to the VM, set this to `false`.
