# Atom-cli

TODO: the install.sh script could patch the /usr/lib/electron/resources/default_app.asar/main.js file to support NODE_PATH
TODO: the install.sh script should download the atom/[package.json].electronVersion zip file

This project is a work in progress that demonstrates proposed features that should belong in the atom and electron projects.

To try them out run these commands...
```
$ apm i -g atom-cli
$ atom-cli-fixupInstalledAtomAndElectron
``` 
To remove the features run...
```
atom-cli-fixupInstalledAtomAndElectron -r
```
While installed, the electron default_app will be modified to support different electron command line options. Also, the a new command called atom-cli will be available to run scripts in the atom environment


## Electron features
* adds electron-esm that allows executing an extensionless js script command as an esm module with a #!/usr/lib/env electon-esm shebang on any supported platform
* honor the NODE_PATH environment variable. On slack, someone suggested without explanation that electron does not honor NODE_PATH because the host's environment should not change how the electron application runs, but I do not understand why this is necessary. It seems to me that if an electron application bundles all of its dependencies in the typical way by listing them in package.json and using npm to install them into node_modules sub-folder, that NODE_PATH will never come into play. Only if the application attempts to require/import a module that is not a dependency would NODE_PATH come into play. My use-case for NODE_PATH is to provide single file electron commands distrubuted via an OS package manager like rpm or deb that relies on host installed node_modules of a particular version managed by the host OS package system.
* /usr/lib/node_modues is in the NODE_PATH by default
* support the --win and --url options which create a BrowserWindow to run a jsmodule in and load a htmlcontent is. Either or both can be specified.
* support the --win-interactive option which runs a repl in the BrowserWindow's renderer process instead of the main process.
* -i | --interactive | --repl can be used in conjunction which launching a user electon application so that the launching terminal can be used to interact with the application for experimenting or debugging.

## Atom Features
* adds atom-cli, a command that runs js files similar to node but with some of the atom environment. It was created to allow running simple unit tests and examples for js modules meant to be used inside atom packages.

It does this my looking at the electronVersion in /usr/share/atom/package.json, downloading that version into /usr/share/atom-cli and  replacing its default_app. It will work the same as the modified global electron described above except 1) its the version compatible with the installed atom, 2) it has the installed atom app in the NODE_PATH so that modules from it can be loaded and 3) the 'atom' global is created (although not all of its features will work)

## Features

* atom-cli launches the version of electron bundled with atom
* esm is loaded so that the js file specified on the command line can use import or require to include dependencies
* global modules from in /usr/lib/node_modules and /usr/share/atom/resources/app.asar/exports can be imported

## Requirements

* electron should be installed globally before this package is installed.
* atom should be installed globally before the package is installed.


## Older Docs...

* electron-v4.2.7-linux-x64.zip taken from atom repo 
  * (atom runs on an old electron)
  * to import the atom package ecosystem, we must use an elctron version with the same abi (4.2.7 is v69)
* the [electron-v4.2.7-linux-x64.zip]/resources/default_app.asar/main.js file needs to be patched so that electron respects the NODE_PATH env var
  * add this in main.js after the options processing block
  ```
  // respect NODE_PATH
  var extraPaths = (process.env.NODE_PATH || '').split(':');
  Module.globalPaths.push(...extraPaths);
  ```

Installing:

run
```
$ sudo ./install.sh [-f] [dev]
```
the install.sh script...
1. unzips electron into /usr/share/atom-cli (with th patched main.js in default_app.asar)
1. copies atom-cli script to /usr/bin
