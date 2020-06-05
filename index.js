const util = require("util");
const core = require("@actions/core");

const exec = util.promisify(require("child_process").exec);

async function removeTemp(tempPath = "/tmp") {
    const { stdout, stderr } = await exec(`rm -rf ${tempPath}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
}

async function removeTools(toolsEnv = "AGENT_TOOLSDIRECTORY") {
    const { stdout, stderr } = await exec(`rm -rf $${toolsEnv}`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
}

async function removeAll() {
    await removeTemp();
    await removeTools();
}

async function action() {
    try {
        await removeAll();
    } catch (error) {
        core.setFailed(error.message);
    }
}

action();
