const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    runCmd,
    removeTemp,
    removeHomeCache,
    removeHomeColony,
    removeTools,
    removeGitLocks,
    removeAll
} = require("../index.js");

function makeFakeExec(result = { stdout: "", stderr: "" }) {
    const calls = [];
    const fake = async cmd => {
        calls.push(cmd);
        if (result instanceof Error) throw result;
        return result;
    };
    fake.calls = calls;
    return fake;
}

function captureConsole() {
    const original = { log: console.log, warn: console.warn, error: console.error };
    const captured = { log: [], warn: [], error: [] };
    console.log = (...args) => captured.log.push(args.join(" "));
    console.warn = (...args) => captured.warn.push(args.join(" "));
    console.error = (...args) => captured.error.push(args.join(" "));
    return {
        captured,
        restore: () => {
            console.log = original.log;
            console.warn = original.warn;
            console.error = original.error;
        }
    };
}

test("runCmd executes the command and prints stdout/stderr", async () => {
    const exec = makeFakeExec({ stdout: "out", stderr: "warn" });
    const cap = captureConsole();
    try {
        await runCmd("echo hi", exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, ["echo hi"]);
    assert.deepEqual(cap.captured.log, ["out"]);
    assert.deepEqual(cap.captured.error, ["warn"]);
});

test("runCmd rethrows when exec rejects", async () => {
    const exec = makeFakeExec(new Error("boom"));
    const cap = captureConsole();
    try {
        await assert.rejects(() => runCmd("bad", exec), /boom/);
    } finally {
        cap.restore();
    }
    assert.equal(cap.captured.error.length, 1);
    assert.match(cap.captured.error[0], /boom/);
});

test("removeTemp uses default /tmp path", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    try {
        await removeTemp(undefined, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, ["rm -rf /tmp"]);
});

test("removeTemp respects a custom path", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    try {
        await removeTemp("/var/tmp", exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, ["rm -rf /var/tmp"]);
});

test("removeHomeCache uses default ~/.cache path", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    try {
        await removeHomeCache(undefined, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, ["rm -rf ~/.cache"]);
});

test("removeHomeColony uses default ~/.colony path", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    try {
        await removeHomeColony(undefined, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, ["rm -rf ~/.colony"]);
});

test("removeTools skips when env var is unset", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const varName = "TEST_TOOLS_DIR_UNSET";
    delete process.env[varName];
    try {
        await removeTools(varName, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, []);
    assert.equal(cap.captured.warn.length, 1);
    assert.match(cap.captured.warn[0], /Skipping tools removal/);
});

test("removeTools removes the path when env var is set", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const varName = "TEST_TOOLS_DIR_SET";
    process.env[varName] = "/opt/hostedtoolcache";
    try {
        await removeTools(varName, exec);
    } finally {
        cap.restore();
        delete process.env[varName];
    }
    assert.deepEqual(exec.calls, ['rm -rf "/opt/hostedtoolcache"']);
});

test("removeGitLocks skips when env var is unset", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const varName = "TEST_WORKSPACE_UNSET";
    delete process.env[varName];
    try {
        await removeGitLocks(varName, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, []);
    assert.equal(cap.captured.warn.length, 1);
    assert.match(cap.captured.warn[0], /Skipping git locks removal/);
});

test("removeGitLocks skips when the path does not exist", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const varName = "TEST_WORKSPACE_MISSING";
    process.env[varName] = path.join(os.tmpdir(), "cleanup-hosted-missing");
    try {
        await removeGitLocks(varName, exec);
    } finally {
        cap.restore();
        delete process.env[varName];
    }
    assert.deepEqual(exec.calls, []);
    assert.equal(cap.captured.warn.length, 1);
    assert.match(cap.captured.warn[0], /Skipping git locks removal, .* does not exist/);
});

test("removeGitLocks removes the git lock files when env var is set", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const varName = "TEST_WORKSPACE_SET";
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-hosted-"));
    process.env[varName] = workspace;
    try {
        await removeGitLocks(varName, exec);
    } finally {
        cap.restore();
        delete process.env[varName];
        fs.rmSync(workspace, { recursive: true, force: true });
    }
    assert.deepEqual(exec.calls, [
        `find "${workspace}" -path "*/.git/*" -name "*.lock" -type f -delete`
    ]);
});

test("removeGitLocks removes only the lock files of the git directories", async () => {
    const cap = captureConsole();
    const varName = "TEST_WORKSPACE_REAL";
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-hosted-"));
    const files = {
        ".git/index.lock": true,
        ".git/refs/heads/master.lock": true,
        ".git/modules/libs/pushi/index.lock": true,
        ".git/HEAD": false,
        ".git/modules/libs/pushi/config": false,
        "libs/pushi/.git": false,
        "libs/pushi/yarn.lock": false,
        "yarn.lock": false
    };
    for (const name of Object.keys(files)) {
        fs.mkdirSync(path.dirname(path.join(workspace, name)), { recursive: true });
        fs.writeFileSync(path.join(workspace, name), "");
    }
    process.env[varName] = workspace;
    try {
        await removeGitLocks(varName);
        for (const [name, removed] of Object.entries(files)) {
            assert.equal(fs.existsSync(path.join(workspace, name)), !removed, name);
        }
    } finally {
        cap.restore();
        delete process.env[varName];
        fs.rmSync(workspace, { recursive: true, force: true });
    }
});

test("removeAll runs only the steps whose input is 'true'", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const inputs = {
        "remove-temp": "true",
        "remove-home-cache": "false",
        "remove-home-colony": "true",
        "remove-tools": "false"
    };
    const getInput = name => inputs[name];
    try {
        await removeAll(getInput, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, ["rm -rf /tmp", "rm -rf ~/.colony"]);
});

test("removeAll runs nothing when all inputs are 'false'", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const getInput = () => "false";
    try {
        await removeAll(getInput, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, []);
});

test("removeAll removes the git locks of the workspace when its input is 'true'", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-hosted-"));
    const previous = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = workspace;
    const getInput = name => (name === "remove-git-locks" ? "true" : "false");
    try {
        await removeAll(getInput, exec);
    } finally {
        cap.restore();
        if (previous === undefined) delete process.env.GITHUB_WORKSPACE;
        else process.env.GITHUB_WORKSPACE = previous;
        fs.rmSync(workspace, { recursive: true, force: true });
    }
    assert.deepEqual(exec.calls, [
        `find "${workspace}" -path "*/.git/*" -name "*.lock" -type f -delete`
    ]);
});
