const util = require("util");
const core = require("@actions/core");
const github = require("@actions/github");

const exec = util.promisify(require("child_process").exec);

async function removeTools(toolsEnv = "AGENT_TOOLSDIRECTORY") {
    const { stdout, stderr } = await exec(`rm -rf $${toolsEnv}`);
    console.log(stdout);
    console.error(stderr);
}

async function action() {
    try {
        await removeTools();
        const time = (new Date()).toTimeString();
        core.setOutput("time", time);
        const payload = JSON.stringify(github.context.payload, undefined, 2)
        console.log(`The event payload: ${payload}`);
    } catch (error) {
        core.setFailed(error.message);
    }
}

action();
