const util = require("util");
const process = require("process");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const core = require("@actions/core");

const execAsync = util.promisify(childProcess.exec);

async function runCmd(cmd, exec = execAsync) {
    try {
        const { stdout, stderr } = await exec(cmd);
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
    } catch (err) {
        console.error(`There was an error: ${err}`);
        throw err;
    }
}

async function removePath(targetPath, rm = fs.promises.rm) {
    await rm(targetPath, { recursive: true, force: true });
}

async function removeTemp(tempPath = os.tmpdir(), remove = removePath) {
    if (!fs.existsSync(tempPath)) {
        console.warn(`Skipping temp removal, ${tempPath} does not exist`);
        return;
    }
    for (const name of fs.readdirSync(tempPath)) {
        try {
            await remove(path.join(tempPath, name));
        } catch (err) {
            console.warn(`Skipping ${path.join(tempPath, name)}, it could not be removed (${err})`);
        }
    }
    console.warn(`Removed the contents of ${tempPath} directory`);
}

async function removeHomeCache(
    homeCachePath = path.join(os.homedir(), ".cache"),
    remove = removePath
) {
    await remove(homeCachePath);
    console.warn(`Removed ${homeCachePath} directory`);
}

async function removeHomeColony(
    homeColonyPath = path.join(os.homedir(), ".colony"),
    remove = removePath
) {
    await remove(homeColonyPath);
    console.warn(`Removed ${homeColonyPath} directory`);
}

async function removeTools(toolsEnv = "AGENT_TOOLSDIRECTORY", remove = removePath) {
    const toolsPath = process.env[toolsEnv];
    if (toolsPath === undefined) {
        console.warn(`Skipping tools removal, ${toolsEnv} env does not exist`);
        return;
    }
    await remove(toolsPath);
    console.warn(`Removed tools directory using $${toolsEnv} (${toolsPath})`);
}

function findGitLocks(dirPath, inGit = false) {
    const locks = [];
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            locks.push(...findGitLocks(entryPath, inGit || entry.name === ".git"));
        } else if (inGit && entry.isFile() && entry.name.endsWith(".lock")) {
            locks.push(entryPath);
        }
    }
    return locks;
}

async function removeGitLocks(workspaceEnv = "GITHUB_WORKSPACE", remove = removePath) {
    const workspacePath = process.env[workspaceEnv];
    if (workspacePath === undefined) {
        console.warn(`Skipping git locks removal, ${workspaceEnv} env does not exist`);
        return;
    }
    if (!fs.existsSync(workspacePath)) {
        console.warn(`Skipping git locks removal, ${workspacePath} does not exist`);
        return;
    }
    for (const lockPath of findGitLocks(workspacePath)) {
        await remove(lockPath);
    }
    console.warn(`Removed git locks using $${workspaceEnv} (${workspacePath})`);
}

function isDpkgInterrupted(dpkgPath = "/var/lib/dpkg") {
    const updatesPath = path.join(dpkgPath, "updates");
    if (!fs.existsSync(updatesPath)) return false;
    return fs.readdirSync(updatesPath).some(name => /^[0-9]+$/.test(name));
}

async function recoverPackageManager(
    platform = process.platform,
    dpkgPath = "/var/lib/dpkg",
    exec = execAsync
) {
    if (platform !== "linux") {
        console.warn(`Skipping package manager recovery, not supported on ${platform}`);
        return;
    }
    if (!fs.existsSync(dpkgPath)) {
        console.warn("Skipping package manager recovery, no supported package manager found");
        return;
    }
    if (!isDpkgInterrupted(dpkgPath)) {
        console.warn("Skipping package manager recovery, dpkg was not interrupted");
        return;
    }
    const sudo = process.getuid && process.getuid() !== 0 ? "sudo -n " : "";
    try {
        await runCmd(`${sudo}env DEBIAN_FRONTEND=noninteractive dpkg --configure -a`, exec);
    } catch (err) {
        console.warn(`Failed to recover the interrupted dpkg (${err})`);
        return;
    }
    console.warn("Recovered the interrupted dpkg (dpkg --configure -a)");
}

async function removeAll(getInput = core.getInput, remove = removePath, exec = execAsync) {
    if (getInput("recover-package-manager") === "true") {
        await recoverPackageManager(undefined, undefined, exec);
    }
    if (getInput("remove-temp") === "true") await removeTemp(undefined, remove);
    if (getInput("remove-home-cache") === "true") await removeHomeCache(undefined, remove);
    if (getInput("remove-home-colony") === "true") await removeHomeColony(undefined, remove);
    if (getInput("remove-tools") === "true") await removeTools(undefined, remove);
    if (getInput("remove-git-locks") === "true") await removeGitLocks(undefined, remove);
}

async function action() {
    try {
        await removeAll();
    } catch (error) {
        core.setFailed(error.message);
    }
}

if (require.main === module) {
    action();
}

module.exports = {
    runCmd,
    removePath,
    removeTemp,
    removeHomeCache,
    removeHomeColony,
    removeTools,
    findGitLocks,
    removeGitLocks,
    isDpkgInterrupted,
    recoverPackageManager,
    removeAll,
    action
};
