const { app, dialog, BrowserWindow } = require('electron')

const fs =     require('fs')
const Module = require('module')
const path =   require('path')
const url =    require('url')
const assert = require('assert')


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Local Functions

// Return a file://... url from the path parts to a local html file
function NormFilenameToURL(...pathParts) {
  return url.format({
    protocol: 'file:',
    slashes: true,
    pathname: path.resolve(...pathParts)
  })
}

// This determines if <filename> is html content that should be loaded into the BrowserWindow or a js module that should be imported
// It returns the normalize url if it is and returns undefined if it is not.
function IsHTMLContent(filename) {
  if (/^(http:|https:|file:|chrome:)$/.test(url.parse(filename).protocol))
    return filename;
  if (/^(.htm|.html)$/.test(path.extname(filename)))
    return NormFilenameToURL(filename);
  else
    return undefined;
}

// Show an error in a GUI dialog bog
function showErrorMessage(message) {
  app.focus()
  dialog.showErrorBox('Error launching app', message)
  process.exit(1)
}


// This will replace the information about the default app with the information about the user app that was specified on the cmdline
function setAppInfoForUserSpecifiedJSModule(packagePath) {
  // Add a flag indicating app is started from default app.
  Object.defineProperty(process, 'defaultApp', {
    configurable: false,
    enumerable: true,
    value: true
  })

  // Override app name and version.
  packagePath = path.resolve(packagePath)
  const packageJsonPath = path.join(packagePath, 'package.json')
  let appPath
  if (fs.existsSync(packageJsonPath)) {
    let packageJson
    try {
      packageJson = require(packageJsonPath)
    } catch (e) {
      showErrorMessage(`Unable to parse ${packageJsonPath}\n\n${e.message}`)
      return
    }

    if (packageJson.version) {
      app.setVersion(packageJson.version)
    }
    if (packageJson.productName) {
      app.name = packageJson.productName
    } else if (packageJson.name) {
      app.name = packageJson.name
    }
    app.setPath('userData', path.join(app.getPath('appData'), app.name))
    app.setPath('userCache', path.join(app.getPath('cache'), app.name))
    appPath = packagePath
  }

  try {
    const filePath = Module._resolveFilename(packagePath, module, true);
    appPath = appPath || path.dirname(filePath);
    app.setAppPath(appPath);
  } catch (e) {
    showErrorMessage(`Unable to find Electron app at ${packagePath}\n\n${e.message}`)
    return
  }
  return packagePath
}

// createWindow creates a BrowserWindow from information specified on the command line.
// Params:
//    <renedererModule> :  this is a js code module that will be launched in the render process of the new BrowserWindow
//    <contentHTML>   :  this is a URL or local html file that will be loaded into the new BrowserWindow. It may contain js
//                        code in addition to any that could be specified as the <renedererModule>.
// Options:
//    The param parameter is an object that can contain additional optional parameters
//    repl: true   : create a repl in the renderer process that uses the tty of the main process.
// Default Content:
//    If neither renedererModule nor contentHTML are specified, it uses the default window content which displays information
//    about the environment and electron. This content is in defaultWin.js, defaultWin.html, and defaultWin.css
async function createWindow(renedererModule, contentHTML, params) {
  await app.whenReady()
  params = params || {}

  let mainWindow = null
  let rendererPreloadJS = path.join(__dirname, 'loaderWindow.js');
  const additionalArguments = [];

  if (params.repl) {
    var tty = (""+require('child_process').spawnSync('tty', {stdio:['inherit','pipe','inherit']}).stdout).replace(/\n$/,'');
    additionalArguments.push('--repl='+tty);
  }

  if (params.modules) {
    for (var module of params.modules)
      additionalArguments.push('-r='+module);
  }

  if (renedererModule) {
    try {
      const packagePath = setAppInfoForUserSpecifiedJSModule(renedererModule);
      additionalArguments.push('--scriptName='+packagePath);
    } catch (e) {
      console.error('App threw an error during load')
      console.error(e.stack || e)
      throw e
    }
  }


  if (option.atomEnvironment)
    additionalArguments.push('--atom-environment');

  if (!renedererModule && !contentHTML && !params.repl) {
    rendererPreloadJS = path.join(__dirname, 'defaultWin.js')
    contentHTML = NormFilenameToURL(__dirname, './defaultWin.html');
  }

  // When the window we launch ends, exit the app
  app.on('window-all-closed', () => {
    process.stdout.write('\n');
    app.quit();
  })

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    autoHideMenuBar: true,
    backgroundColor: '#C0C0C0',
    icon: ((process.platform === 'linux') ? path.join(__dirname, 'electronIcon.png') : undefined),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: rendererPreloadJS,
      additionalArguments: additionalArguments,
      enableRemoteModule: true,
      webviewTag: false
    },
    useContentSize: true,
    show: false
  });

  if (option.atomEnvironment) {
    Object.defineProperty(mainWindow, 'loadSettingsJSON', {
      get: () =>
        JSON.stringify({
          devMode : false,
          safeMode : false,
          resourcePath: "/usr/share/atom/resources/app.asar",
          userSettings: {},
          projectSpecification: null
        })
    });
  }

  if (contentHTML) {
    mainWindow.loadURL(contentHTML);
  } else
    mainWindow.loadURL(NormFilenameToURL(__dirname, './empty.html'));

  if (!params.hideWin) {
    mainWindow.on('ready-to-show', () => mainWindow.show());
    mainWindow.focus();
  }

  global.mainWindow = mainWindow;
}




// Define the help text for the electron executable
const helpText = `
Electron ${process.versions.electron} - Build cross platform desktop apps with JavaScript, HTML, and CSS
Usage:
Form1: launch the electron application contained in <jsmodule>
       electron  [-r module ..[-r moduleN]] --app <jsmodule> 
       electron  [-r module ..[-r moduleN]] <jsmodule> 
Form2: use the default application to launch a BrowserWindow optionally specifying the <jsmodule> entry point or html content  
       electron  [-r module ..[-r moduleN]] [-win <jsmodule>] --url <htmlFileOrURL>
       electron  [-r module ..[-r moduleN]] [-win <jsmodule>] <htmlFileOrURL>
       electron  [-r module ..[-r moduleN]] [-win <jsmodule>]
form3: open an interactive REPL as the main process (does not execute the default app)
       electron  [-r module ..[-r moduleN]] [--url <htmlFileOrURL>] -i|--interactive|--repl 
form4: use the default application to launch a BrowserWindow running a REPL
       electron  [-r module ..[-r moduleN]] [--url <htmlFileOrURL>] --win-interactive 
form5: print information about the installed electron command and exit
       electron  -h|--help | -v|--version | -a|--abi
   

An electron application consists of a main process (aka the 'app') and zero or more BrowserWindows that the main process creates. 
Each BrowserWindow has their own renderer process which can execute a <jsmodule> and/or load html content. 

Running An Electron Application:
Form1 of the command line allows you to specify an app (main process) <jsmodule> which assumes full control. The builtin default
app will not be used.

Running a Default BrowserWindow:
Form2 uses the default app to create a BrowserWindow. By default that window will display the help text and information about the
host environment. You can also specify the <jsmodule> that the default window will execute and/or the html content that will be initially
loaded in the window. This can be useful for scripts to create simple election 'applications'.

Running REPLs to Experiment:
Form3 and Form4 opens a REPL interactive command line for the user to experiment with. Form3 makes the REPL the main process and Form4
uses the default application to create a REPL on a BrowserWindow renderer process. 

ESM vs CJS Parse Goals:
When a <jsmodule> has a .msj or .cjs extension, it will be parsed as ems and commonjs respectively. If it has no extension or the 
extension .js, the parse goal will be determines by the name of the electron executable used. electron will results in commonjs and
electon-esm will result in esm.  The executable name is used instead of a command line option to support cross platform extensionless
executable shebang scripts. #!/usr/share/env electron[-esm]

Params:
<jsmodule> can be one of the following:
   - a js file with or without an extension (.js .mjs .cjs) (See note on esm vs cjs parse goals)
   - Folder containing a package.json file.
   - Folder containing an index.js file.
<htmlFileOrURL> can be one of the following:
   - .html/.htm file.
   - http://, https://, or file:// URL.

Options:
-v, --version          Print the version.
-a, --abi              Print the Node ABI version.
-i, --interactive      Open a REPL to the main process.
                       This replaces the default app so none of the options related to the
                       window that the default app creates will have an effect.
-r, --require          Module to preload (option can be repeated).
--app <jsmodule>       Execute this module as the application (main process) entry point
                       This replaces the default app so none of the options related to the
                       window that the default app creates will have an effect.
--win <jsmodule>       Execute this module as the Window (renderer process) entry point 
                       in the Window that the default app creates
--url <htmlFile>       Load this content in the Window that the default app creates
--default-code-type=win|app 
                       When a <jsmodule> is specified on the command line without being preceeded by --win or --app this determines
                       how it is treated. If this is not specified, the <jsmodule> is an --app which maintains compatibility with
                       previous versions.
--win-interactive      Open a REPL to the renderer process of the windows that the default
                       app creates
--hide-win             If a BrowserWindow is created, leave it hidden until user code <jsmodule> or a repl command explicitly shows it
--show-win             Undoes the effect of --hide-win. This is useful if omething else has already put --show-win on the cmdline
--atom-environment     Initialize the BroswerWindow with the atom environment
`



/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Process command line.

const option = {modules: []}
const argv = process.argv.slice(1);
let defJSModType='app';
while (argv.length > 0) {
  let arg = argv.shift(), rematch;
  function re(regex) {rematch=regex.exec(arg); return (!!rematch) ? arg : 'NO MATCH'}
  function getOptValue() {var a=arg.split('='); return (a.length>1) ? a[1] : argv.shift();}
  switch (arg) {
    case re(/^(--help|-h)$/):                 option.help = true;                           break;
    case re(/^(--version|-v)$/):              option.version = true;                        break;
    case re(/^(--abi|-a)$/):                  option.abi = true;                            break;
    case re(/^(--require(=|$)|-r)\b/):        option.modules.push(getOptValue());           break;
    case re(/^(--interactive|-i|--repl)$/):   option.interactive = true;                    break;
    case re(/^--default-code-type=(win|app)$/):defJSModType = rematch[1];                   break;
    case re(/^(--hide-win|-h)$/):             option.hideWin = true;                        break;
    case re(/^(--show-win|-h)$/):             option.hideWin = false;                       break;
    case re(/^(--win-interactive)$/):         option.winInteractive = true;                 break;
    case re(/^--app\b/):                      option.appCode    = getOptValue();            break;
    case re(/^--win(=|$)/):                   option.winCode    = getOptValue();            break;
    case re(/^--url\b/):
      const tmp = getOptValue();
      option.winContent = IsHTMLContent(tmp);
      assert(!!option.winContent, `'${tmp} does not seem to be an html content url'`)
      break;
    case re(/^(--atom-environment)$/):        option.atomEnvironment = true;                break;
    case re(/^-/):                            assert(false, 'Unknown option '+arg);break;
    default:
      const fileResult = IsHTMLContent(arg);
      if (fileResult)
        option.winContent = fileResult;
      else if (defJSModType == 'win')
        option.winCode = arg;
      else
        option.appCode = arg;
      break;
  }
}

// quiet the warning in later electrons about the default value of allowRendererProcessReuse changing
app.allowRendererProcessReuse = false;

// uncomment to debug commandline processing
//console.log(option);

if (process.platform === 'win32' && (option.interactive || option.winInteractive)) {
  console.error('Electron REPL not currently supported on Windows')
  process.exit(1)
}



/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Main Script


// respect NODE_PATH
var extraPaths = (process.env.NODE_PATH || '').split(':');
Module.globalPaths.push(...extraPaths);


// Create default menu.
const { setDefaultApplicationMenu } = require('./menu')
app.once('ready', () => {
  setDefaultApplicationMenu()
})

// Set up preload modules
if (option.modules.length > 0) {
  Module._preloadModules(option.modules)
}

// Form 5 -- print requested info and exit
if (option.version || option.abi || option.help) {
  if (option.help)
    console.log(helpText);
  if (option.version)
    console.log('v' + process.versions.electron)
  if (option.abi)
    console.log(process.versions.modules)
  process.exit(0)

// Form 1 -- Start User App and get out of its way
} else if (option.appCode) {
  // Run the app.
  try {
    const packagePath = setAppInfoForUserSpecifiedJSModule(option.appCode);
    Module._load(packagePath, module, true)
  } catch (e) {
    console.error('App threw an error during load')
    console.error(e.stack || e)
    throw e
  }

// Form 2,3,4 --  create a BrowserWindow with optional content and optional REPL in the window process
} else {
  createWindow(option.winCode, option.winContent, {
    hideWin: option.hideWin,
    repl:    option.winInteractive,
    modules: option.modules
  });
}

// start a REPL in the main process if requested.
if (option.interactive) {
  const repl = require('repl').start('> ');

  repl.on('exit', () => {
    process.stdout.write('\n');
    process.exit(0);
  })

  // TODO: this block is not working. Tried 'will-quit' and 'quit' also and they do not get called either.
  // when the application ends, we need to close the repl to give it a chance to return the tty state back to normal.
  app.on('window-all-closed', () => {
    console.log('yoyo\n');
    repl.close();
  })
}
