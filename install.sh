#!/usr/bin/env bash

srcFolder="$(cd ${0%/*}; pwd)"

# change into the scrFolder of the script so that paths are relative to it.
cd "$srcFolder"

##################################################################################################################################
### Local Functions

function assertError() {
	echo "$*" >&2
	exit 2
}

function makeFilenameHidden() {
	local folder="${1%/*}"
	local name="${1##*/}"
	echo "${folder}/.${name}"
}

function backupFile() {
	local file="$1"
	local fileHid="$(makeFilenameHidden "${file}")"
	if [ ! -e "${fileHid}.orig" ] && [ ! -e "${fileHid}.none" ]; then
		[ -w "${file%/*}" ] || assertError "must run as admin(root0) to install into system folders"
		if [ -e "${file}" ]; then
			cp -P "${file}" "${fileHid}.orig"
		else
			touch "${fileHid}.none"
		fi
	fi
}

function restoreFile() {
	local file="$1"
	local fileHid="$(makeFilenameHidden "${file}")"
	if [ -e "${fileHid}.orig" ]; then
		[ -w "${file}" ] || assertError "must run as admin(root0) to install into system folders"
		cp -P "${fileHid}.orig" "${file}"
		rm -f "${fileHid}.orig"
		echo "restored '${file}' to its original value"
	elif [ -e "${fileHid}.none" ]; then
		rm -f "${file}"
		rm -f "${fileHid}.none"
		echo "removed '${file}'"
	else
		echo "no original version of '${file}' to restore"
	fi
}

function installCmd() {
	local cmd="$1"
	local destination="$2"

	# save the original file for uninstall to use
	backupFile "${destination}/${cmd}"

	if [ "$uninstallFlag" ]; then
		restoreFile "${destination}/${cmd}"

	elif [ "$devFlag" ]; then
		if [ "$forceFlag" ] || [ ! -h ${destination}/"${cmd}" ]; then
			[ -w ${destination} ] || assertError "must run as admin(root1) to install into system folders"
			rm -f ${destination}/"${cmd}"
			ln -s "$srcFolder/${cmd}" "${destination}/${cmd}"
			#chmod a+x "${cmd}"
			echo "symlinked '${destination}/${cmd}' to '$srcFolder/${cmd}'"
		fi
	else
		if [ "$forceFlag" ] || [ ! -f ${destination}/"${cmd}" ] || ! cmp -s "${cmd}" ${destination}/"${cmd}"; then
			[ -w ${destination} ] || assertError "must run as admin(root2) to install into system folders"
			rm -f ${destination}/"${cmd}"
			cp "${cmd}" ${destination}/"${cmd}"
			#chmod a+x ${destination}/"${cmd}"
			if [ -e "${destination}/.${cmd}.none" ]; then
				echo "installed '${destination}/${cmd}'"
			else
				echo "replaced '${destination}/${cmd}'"
			fi
		fi
	fi
}

##################################################################################################################################
### Input Processing

while [ $# -gt 0 ]; do case "$1" in
	--dev)          devFlag="--dev" ;;
	-f|--force)     forceFlag="-f"  ;;
	-u|--uninstall) uninstallFlag="-u"  ;;
esac; shift; done


##################################################################################################################################
### Main Script

# Only tested on linux
[ "$(expr substr $(uname -s) 1 5)" == 'Linux' ] || assertError "This package is only a demonstration of a proposal for a change to electron and atom packages and this script has only been tested in linux. Your platform ($(uname -a)) is not supported."

if which asar &>/dev/null; then
	asar p cliApp/ default_app.asar
fi

# is node installed?
if which node &>/dev/null; then
	installCmd node-esm /usr/bin
else
	echo "warning: 'node' not found in path so node-esm will not be installed."
fi

# if electron is installed.
if which electron &>/dev/null; then
	elCmdPath="$(which electron)"
	elRealPath='/usr/lib/node_modules/electron/cli.js'
	[ ! -e "$elRealPath" ] && elRealPath='/usr/local/lib/node_modules/electron/cli.js'
	[ ! -e "$elRealPath" ] && assertError "unexpected folder layout. Is this runnig on a new distro or version? looked for electron's cli.js in /usr/[local/]lib/node_modules"

	# replace the electron symlink with our script that makes /usr/lib/node_modules in NODE_PATH by default
	if [ "$uninstallFlag" ]; then
		restoreFile "${elCmdPath}"
	elif [ -h "$elCmdPath" ]; then
		backupFile "${elCmdPath}"
		[ "${elRealPath}" == "$(realpath "$elCmdPath")" ] || assertError "unexpected path. expected '$(realpath "$elCmdPath")' to be '${elRealPath}'"
		rm -f "${elCmdPath}" || assertError "rm '$elCmdPath' failed"
		sed -e 's|%elRealPath%|'"$elRealPath"'|g' ./electron > "$elCmdPath"
		chmod a+x "$elCmdPath"
		echo "replaced '$elCmdPath' symlink with our script. target='$elRealPath'"
	fi

	# install several versions of electron to support shebang scripts of several types.
	installCmd electron-esm /usr/bin
	installCmd electron-win /usr/bin
	installCmd electron-win-esm /usr/bin

	# replace the default_app with ours that adds various features including respect for NODE_PATH and being able to create a
	# BrowserWindow directly
	installCmd default_app.asar ${elRealPath%/*}/dist/resources
else
	echo "warning: electron not found in path so electron integration will not be installed."
fi


# if atom is installed.
if which atom &>/dev/null; then
	# find out where atom is. The USR_DIRECTORY logic is taken from the atom script
	atomPath="$(which atom)"
	USR_DIRECTORY=$(readlink -f $(dirname $atomPath)/..)

	# install the electron version that atom is using into /usr/share/atom-cli
	if [ "$forceFlag" == "full" ] || [ ! -d "${USR_DIRECTORY}/share/atom-cli" ]; then
		[ -w "${USR_DIRECTORY}/share" ] || assertError "must run as admin(root3) to install into system folders"
		tmpDir="$(mktemp -d)"
		elVersion="$(
			cd "$tmpDir" || assertError "cd $tmpDir failed"
			asar ef $USR_DIRECTORY/share/atom/resources/app.asar package.json
			elVersion="$(grep -o "electronVersion[^,]*" package.json)"
			elVersion="${elVersion%\"*}"
			echo "${elVersion##*\"}"
		)"
		[[ "$elVersion" =~ ^[0-9]+[.][0-9]+[.][0-9]+$ ]] || assertError "expected 1.2.3 style version number but got '${elVersion}'"
		echo "found that atom is using electron-${elVersion}"

		# download the zip file for this version
		os="linux"  # TODO: detect
		arch="x64"  # TODO: detect
		dlFrom="https://github.com/electron/electron/releases/download/v${elVersion}/electron-v${elVersion}-${os}-${arch}.zip"
		elZipName="electron-v${elVersion}-${os}-${arch}.zip"

		curl -L "${dlFrom}" --output "${tmpDir}/${elZipName}" || assertError "failed to download from '${dlFrom}' "

		[ -e "${USR_DIRECTORY}/share/atom-cli" ] && rm -rf "${USR_DIRECTORY}/share/atom-cli"
		mkdir -p "${USR_DIRECTORY}/share/atom-cli"
		unzip -q -o ${tmpDir}/${elZipName} -d "${USR_DIRECTORY}/share/atom-cli"

		echo "installed '${elZipName}' into '${USR_DIRECTORY}/share/atom-cli'"
	fi

	installCmd default_app.asar "${USR_DIRECTORY}/share/atom-cli/resources"
	installCmd atom-cli "${USR_DIRECTORY}/bin"
else
	echo "warning: atom not found in path so atom-cli will not be installed."
fi
