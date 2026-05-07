const util = require("util");
const process = require("process");
const childProcess = require("child_process");
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

async function removeTemp(tempPath = "/tmp", exec = execAsync) {
    await runCmd(`rm -rf ${tempPath}`, exec);
    console.warn(`Removed ${tempPath} directory`);
}

async function removeHomeCache(homeCachePath = "~/.cache", exec = execAsync) {
    await runCmd(`rm -rf ${homeCachePath}`, exec);
    console.warn(`Removed ${homeCachePath} directory`);
}

async function removeHomeColony(homeColonyPath = "~/.colony", exec = execAsync) {
    await runCmd(`rm -rf ${homeColonyPath}`, exec);
    console.warn(`Removed ${homeColonyPath} directory`);
}

async function removeTools(toolsEnv = "AGENT_TOOLSDIRECTORY", exec = execAsync) {
    const toolsPath = process.env[toolsEnv];
    if (toolsPath === undefined) {
        console.warn(`Skipping tools removal, ${toolsEnv} env does not exist`);
        return;
    }
    await runCmd(`rm -rf "${toolsPath}"`, exec);
    console.warn(`Removed tools directory using $${toolsEnv} (${toolsPath})`);
}

async function removeAll(getInput = core.getInput, exec = execAsync) {
    if (getInput("remove-temp") === "true") await removeTemp(undefined, exec);
    if (getInput("remove-home-cache") === "true") await removeHomeCache(undefined, exec);
    if (getInput("remove-home-colony") === "true") await removeHomeColony(undefined, exec);
    if (getInput("remove-tools") === "true") await removeTools(undefined, exec);
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
    removeTemp,
    removeHomeCache,
    removeHomeColony,
    removeTools,
    removeAll,
    action
};
