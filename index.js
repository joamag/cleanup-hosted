const util = require("util");
const process = require("process");
const core = require("@actions/core");

const exec = util.promisify(require("child_process").exec);

async function runCmd(cmd) {
    const { err, stdout, stderr } = await exec(cmd);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    if (err) console.error(`There was an error: ${err}`);
}

async function removeTemp(tempPath = "/tmp") {
    await runCmd(`rm -rf ${tempPath}`);
    console.warn(`Removed ${tempPath} directory`);
}

async function removeHomeCache(homeCachePath = "~/.cache") {
    await runCmd(`rm -rf ${homeCachePath}`);
    console.warn(`Removed ${homeCachePath} directory`);
}

async function removeTools(toolsEnv = "AGENT_TOOLSDIRECTORY") {
    if (process.env[toolsEnv] === undefined) {
        console.warn(`Skipping tools removal, ${toolsEnv} env does not exist`);
    }
    await runCmd(`rm -rf $${toolsEnv}`);
    console.warn(`Removed tools directory using $${toolsEnv} (${process.env[toolsEnv]})`);
}

async function removeAll() {
    if (core.getInput("remove-temp") === "true") await removeTemp();
    if (core.getInput("remove-home-cache") === "true") await removeHomeCache();
    if (core.getInput("remove-tools") === "true") await removeTools();
}

async function action() {
    try {
        await removeAll();
    } catch (error) {
        core.setFailed(error.message);
    }
}

action();
