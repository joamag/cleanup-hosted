const util = require("util");
const process = require("process");
const core = require("@actions/core");

const exec = util.promisify(require("child_process").exec);

async function removeTemp(tempPath = "/tmp") {
    const { stdout, stderr } = await exec(`rm -rf ${tempPath}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.warn(`Removed ${tempPath} directory`);
}

async function removeHomeCache(homeCachePath = "~/cache") {
    const { stdout, stderr } = await exec(`rm -rf ${homeCachePath}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.warn(`Removed ${homeCachePath} directory`);
}

async function removeTools(toolsEnv = "AGENT_TOOLSDIRECTORY") {
    if (process.env[toolsEnv] === undefined) {
        console.warn(`Skipping tools removal, ${toolsEnv} env does not exist`);
    }
    const { stdout, stderr } = await exec(`rm -rf $${toolsEnv}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    console.warn(`Removed directory from ${toolsEnv} env`);
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
