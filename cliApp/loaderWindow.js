const tty = require('tty');
const fs = require('fs');
const Module = require('module')

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Process command line.
const option = {modules:[]};
const argv = process.argv.slice(1);
while (argv.length > 0) {
	const arg = argv.shift();
	function re(regex) {return regex.test(arg) ? arg : 'NO MATCH'}
	function getOptValue() {var a=arg.split('='); return (a.length>1) ? a[1] : argv.shift();}
	switch (arg) {
		case re(/^--repl\b/):              option.repl       = getOptValue();  break;
		case re(/^--scriptName\b/):        option.scriptName = getOptValue();  break;
		case re(/^(--require(=|$)|-r)\b/): option.modules.push(getOptValue()); break;
		case re(/^(--atom-environment)$/): option.atomEnvironment = true;      break;
	}
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Main Script

// respect NODE_PATH
var extraPaths = (process.env.NODE_PATH || '').split(':');
Module.globalPaths.push(...extraPaths);

// Set up preload modules
for (const moduleName of option.modules) {
	require(moduleName);
	// Module._preloadModules in renderer caused a weird module not found error for an @electron/internal.. mod that exists
	//Module._preloadModules(option.modules)
}

// initialize the atom environment if called for
if (option.atomEnvironment) {
	const AtomEnvironment = require('atom-environment');
	window.atom = new AtomEnvironment();
	// const ApplicationDelegate = require('application-delegate');
	// global.atom = new AtomEnvironment({
	//   applicationDelegate: new ApplicationDelegate(),
	//   enablePersistence: false
	// });

	//require('initialize-application-window.js')
}


// setup the repl environment and start it.
if (option.repl) {
	// add some global variables for things that the REPL user may find useful
	window.electron = require('electron');
	window.mainProcess = electron.remote;
	window.mainWindow = window.mainProcess.getGlobal('mainWindow');
	window.consoleWin = console;

	// create the streams for the tty of the main process. We can read and write to the tty device directly
	// without doing IPC back to the main process. 
	// the construction of the ttyRead and ttyWrite streams is copied from stdin/stdout in is_main_thread.js in the node project.
	ttyFD = fs.openSync(option.repl, 'as+');
	ttyRead = new tty.ReadStream(ttyFD, {
		highWaterMark: 0,
		readable: true,
		writable: false
	});
	ttyWrite = new tty.WriteStream(ttyFD);
	ttyWrite._type = 'tty';
	ttyWrite.fd = ttyFD;
	ttyWrite._isStdio = true;

	// make the console use the same output stream as the repl
	const { Console } = require('console');
	console = new Console(ttyWrite, ttyWrite);
	window.consoleMain = console;

	// give the user a hint about where they are and where to find more information
	console.log('Starting REPL on the BrowserWindow renderer process. Use .list to see what globals are available to use.')

	// start the repl
	window.repl = require('repl').start({
		prompt: 'winProc> ',
		input:  ttyRead,
		output: ttyWrite,
		useGlobal: true,
		ignoreUndefined: true
	});

	// work-a-round for electron issue [#18872](https://github.com/electron/electron/issues/18872)
	// we dont use the completer: ... function option because we dont want to reimplement the whole thing
	let myGlobals = ['global','window','console','electron','mainProcess','mainWindow','consoleWin','consoleMain'];
	let builtinCompleter = repl.completer;
	repl.completer = (line, callback)=>{
		if (/^[^ .]*$/.test(line))
			callback(null, [myGlobals.filter((word)=>{return word.indexOf(line)==0}), line]);
		else {
			builtinCompleter(line, callback)
		}
	};


	// when the user ends the repl, close the window, which will also end the app.
	repl.on('exit', () => {
		mainWindow.close();
		// Note: process.exit(0) did not work -- not sure why.
	})

	// when the user closes the window, we need to close the repl to give it a chance to return the tty state back to normal.
	mainWindow.on('close', ()=>{
		consoleMain.log('');
		repl.close();
	});

	// add a command to list the globals setup by this repl
	repl.defineCommand('list', {
		help: 'These avariables are available in the BrowserWindow REPL',
		action: function() {
			this.outputStream.write(
`mainWindow  : the BrowserWindow created by the default electron application (alias for remote.getCurrentWindow()).
mainProcess : the default application's main electron process. (alias for electron.remote)
consoleMain : Console that writes to the terminal that launched the electron.
consoleWin  : Console that writes to the Dev Tools of the mainWindow.
console     : the default console is consoleMain
repl        : this repl instance.
electron    : the electron module.
domcument, window, etc.. : the standard browser environment
global, module, require, ... : the standard node environment
`
			);
			this.displayPrompt();
		}.bind(repl)
	});
}

// load the user provided jsmodule if provided
if (option.scriptName) {
	require(option.scriptName)
}
