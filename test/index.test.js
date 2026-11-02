const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
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

function makeFakeRemove(failures = []) {
    const calls = [];
    const fake = async targetPath => {
        calls.push(targetPath);
        if (failures.includes(targetPath)) throw new Error("busy");
    };
    fake.calls = calls;
    return fake;
}

function makeTree(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-hosted-"));
    for (const name of files) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), "");
    }
    return root;
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

test("removePath removes a directory with its contents", async () => {
    const root = makeTree(["a/b/c.txt", "d.txt"]);
    try {
        await removePath(root);
        assert.equal(fs.existsSync(root), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("removePath ignores a path that does not exist", async () => {
    await removePath(path.join(os.tmpdir(), "cleanup-hosted-missing"));
});

test("removePath removes recursively and with force", async () => {
    const calls = [];
    const rm = async (...args) => calls.push(args);
    await removePath("/some/path", rm);
    assert.deepEqual(calls, [["/some/path", { recursive: true, force: true }]]);
});

test("removeTemp uses the temp directory of the system by default", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    try {
        await removeTemp(undefined, remove);
    } finally {
        cap.restore();
    }
    for (const targetPath of remove.calls) {
        assert.equal(path.dirname(targetPath), os.tmpdir());
    }
    assert.equal(cap.captured.warn.at(-1), `Removed the contents of ${os.tmpdir()} directory`);
});

test("removeTemp removes the contents of a custom path, keeping the path", async () => {
    const root = makeTree(["a/b.txt", "c.txt"]);
    const cap = captureConsole();
    try {
        await removeTemp(root);
        assert.equal(fs.existsSync(root), true);
        assert.deepEqual(fs.readdirSync(root), []);
    } finally {
        cap.restore();
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("removeTemp keeps going when an entry can not be removed", async () => {
    const root = makeTree(["a.txt", "b.txt"]);
    const remove = makeFakeRemove([path.join(root, "a.txt")]);
    const cap = captureConsole();
    try {
        await removeTemp(root, remove);
    } finally {
        cap.restore();
        fs.rmSync(root, { recursive: true, force: true });
    }
    assert.deepEqual(remove.calls.sort(), [path.join(root, "a.txt"), path.join(root, "b.txt")]);
    assert.equal(cap.captured.warn.length, 2);
    assert.match(cap.captured.warn[0], /a\.txt, it could not be removed \(Error: busy\)/);
});

test("removeTemp skips when the path does not exist", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    try {
        await removeTemp(path.join(os.tmpdir(), "cleanup-hosted-missing"), remove);
    } finally {
        cap.restore();
    }
    assert.deepEqual(remove.calls, []);
    assert.match(cap.captured.warn[0], /Skipping temp removal, .* does not exist/);
});

test("removeHomeCache uses the .cache directory of the home by default", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    try {
        await removeHomeCache(undefined, remove);
    } finally {
        cap.restore();
    }
    assert.deepEqual(remove.calls, [path.join(os.homedir(), ".cache")]);
});

test("removeHomeColony uses the .colony directory of the home by default", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    try {
        await removeHomeColony(undefined, remove);
    } finally {
        cap.restore();
    }
    assert.deepEqual(remove.calls, [path.join(os.homedir(), ".colony")]);
});

test("removeHomeColony propagates a failure of the removal", async () => {
    const remove = makeFakeRemove(["/home/.colony"]);
    await assert.rejects(() => removeHomeColony("/home/.colony", remove), /busy/);
});

test("removeTools skips when env var is unset", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    const varName = "TEST_TOOLS_DIR_UNSET";
    delete process.env[varName];
    try {
        await removeTools(varName, remove);
    } finally {
        cap.restore();
    }
    assert.deepEqual(remove.calls, []);
    assert.equal(cap.captured.warn.length, 1);
    assert.match(cap.captured.warn[0], /Skipping tools removal/);
});

test("removeTools removes the path when env var is set", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    const varName = "TEST_TOOLS_DIR_SET";
    process.env[varName] = path.join(os.tmpdir(), "hostedtoolcache");
    try {
        await removeTools(varName, remove);
    } finally {
        cap.restore();
        delete process.env[varName];
    }
    assert.deepEqual(remove.calls, [path.join(os.tmpdir(), "hostedtoolcache")]);
});

test("findGitLocks finds only the lock files of the git directories", () => {
    const root = makeTree([
        ".git/index.lock",
        ".git/refs/heads/master.lock",
        ".git/modules/libs/pushi/index.lock",
        ".git/HEAD",
        ".git/modules/libs/pushi/config",
        "libs/pushi/.git",
        "libs/pushi/yarn.lock",
        "yarn.lock"
    ]);
    try {
        assert.deepEqual(findGitLocks(root).sort(), [
            path.join(root, ".git", "index.lock"),
            path.join(root, ".git", "modules", "libs", "pushi", "index.lock"),
            path.join(root, ".git", "refs", "heads", "master.lock")
        ]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("findGitLocks does not follow symbolic links", { skip: process.platform === "win32" }, () => {
    const root = makeTree([".git/index.lock"]);
    const other = makeTree([".git/index.lock"]);
    fs.symlinkSync(other, path.join(root, "linked"));
    fs.symlinkSync(root, path.join(root, ".git", "loop"));
    try {
        assert.deepEqual(findGitLocks(root), [path.join(root, ".git", "index.lock")]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(other, { recursive: true, force: true });
    }
});

test("removeGitLocks skips when env var is unset", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    const varName = "TEST_WORKSPACE_UNSET";
    delete process.env[varName];
    try {
        await removeGitLocks(varName, remove);
    } finally {
        cap.restore();
    }
    assert.deepEqual(remove.calls, []);
    assert.equal(cap.captured.warn.length, 1);
    assert.match(cap.captured.warn[0], /Skipping git locks removal/);
});

test("removeGitLocks skips when the path does not exist", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    const varName = "TEST_WORKSPACE_MISSING";
    process.env[varName] = path.join(os.tmpdir(), "cleanup-hosted-missing");
    try {
        await removeGitLocks(varName, remove);
    } finally {
        cap.restore();
        delete process.env[varName];
    }
    assert.deepEqual(remove.calls, []);
    assert.equal(cap.captured.warn.length, 1);
    assert.match(cap.captured.warn[0], /Skipping git locks removal, .* does not exist/);
});

test("removeGitLocks removes only the lock files of the git directories", async () => {
    const cap = captureConsole();
    const varName = "TEST_WORKSPACE_REAL";
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
    const workspace = makeTree(Object.keys(files));
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

test("isDpkgInterrupted is false without an updates directory", () => {
    const root = makeTree(["status"]);
    try {
        assert.equal(isDpkgInterrupted(root), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("isDpkgInterrupted is false for an updates directory with no journal file", () => {
    const root = makeTree(["status"]);
    fs.mkdirSync(path.join(root, "updates"));
    try {
        assert.equal(isDpkgInterrupted(root), false);
        fs.writeFileSync(path.join(root, "updates", "tmp.i"), "");
        assert.equal(isDpkgInterrupted(root), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("isDpkgInterrupted is true with a journal file in the updates directory", () => {
    const root = makeTree(["updates/0000"]);
    try {
        assert.equal(isDpkgInterrupted(root), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("recoverPackageManager skips on the platforms other than linux", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const root = makeTree(["updates/0000"]);
    try {
        await recoverPackageManager("win32", root, exec);
        await recoverPackageManager("darwin", root, exec);
    } finally {
        cap.restore();
        fs.rmSync(root, { recursive: true, force: true });
    }
    assert.deepEqual(exec.calls, []);
    assert.match(cap.captured.warn[0], /not supported on win32/);
    assert.match(cap.captured.warn[1], /not supported on darwin/);
});

test("recoverPackageManager skips when there's no dpkg", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    try {
        await recoverPackageManager("linux", path.join(os.tmpdir(), "cleanup-hosted-missing"), exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(exec.calls, []);
    assert.match(cap.captured.warn[0], /no supported package manager found/);
});

test("recoverPackageManager skips when dpkg was not interrupted", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const root = makeTree(["status"]);
    try {
        await recoverPackageManager("linux", root, exec);
    } finally {
        cap.restore();
        fs.rmSync(root, { recursive: true, force: true });
    }
    assert.deepEqual(exec.calls, []);
    assert.match(cap.captured.warn[0], /dpkg was not interrupted/);
});

test("recoverPackageManager configures the pending packages of an interrupted dpkg", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const root = makeTree(["updates/0000"]);
    const sudo = process.getuid && process.getuid() !== 0 ? "sudo -n " : "";
    try {
        await recoverPackageManager("linux", root, exec);
    } finally {
        cap.restore();
        fs.rmSync(root, { recursive: true, force: true });
    }
    assert.deepEqual(exec.calls, [`${sudo}env DEBIAN_FRONTEND=noninteractive dpkg --configure -a`]);
    assert.match(cap.captured.warn[0], /Recovered the interrupted dpkg/);
});

test("recoverPackageManager warns and does not fail when the recovery fails", async () => {
    const exec = makeFakeExec(new Error("sudo: a password is required"));
    const cap = captureConsole();
    const root = makeTree(["updates/0000"]);
    try {
        await recoverPackageManager("linux", root, exec);
    } finally {
        cap.restore();
        fs.rmSync(root, { recursive: true, force: true });
    }
    assert.equal(exec.calls.length, 1);
    assert.match(
        cap.captured.warn[0],
        /Failed to recover the interrupted dpkg \(Error: sudo: a password is required\)/
    );
});

test("removeAll runs only the steps whose input is 'true'", async () => {
    const remove = makeFakeRemove();
    const exec = makeFakeExec();
    const cap = captureConsole();
    const inputs = {
        "remove-temp": "false",
        "remove-home-cache": "true",
        "remove-home-colony": "true",
        "remove-tools": "false",
        "remove-git-locks": "false",
        "recover-package-manager": "false"
    };
    const getInput = name => inputs[name];
    try {
        await removeAll(getInput, remove, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(remove.calls, [
        path.join(os.homedir(), ".cache"),
        path.join(os.homedir(), ".colony")
    ]);
    assert.deepEqual(exec.calls, []);
});

test("removeAll runs nothing when all inputs are 'false'", async () => {
    const remove = makeFakeRemove();
    const exec = makeFakeExec();
    const cap = captureConsole();
    const getInput = () => "false";
    try {
        await removeAll(getInput, remove, exec);
    } finally {
        cap.restore();
    }
    assert.deepEqual(remove.calls, []);
    assert.deepEqual(exec.calls, []);
    assert.deepEqual(cap.captured.warn, []);
});

test("removeAll removes the git locks of the workspace when its input is 'true'", async () => {
    const remove = makeFakeRemove();
    const cap = captureConsole();
    const workspace = makeTree([".git/index.lock", "yarn.lock"]);
    const previous = process.env.GITHUB_WORKSPACE;
    process.env.GITHUB_WORKSPACE = workspace;
    const getInput = name => (name === "remove-git-locks" ? "true" : "false");
    try {
        await removeAll(getInput, remove);
    } finally {
        cap.restore();
        if (previous === undefined) delete process.env.GITHUB_WORKSPACE;
        else process.env.GITHUB_WORKSPACE = previous;
        fs.rmSync(workspace, { recursive: true, force: true });
    }
    assert.deepEqual(remove.calls, [path.join(workspace, ".git", "index.lock")]);
});

test("removeAll recovers the package manager when its input is 'true'", async () => {
    const exec = makeFakeExec();
    const cap = captureConsole();
    const getInput = name => (name === "recover-package-manager" ? "true" : "false");
    try {
        await removeAll(getInput, makeFakeRemove(), exec);
    } finally {
        cap.restore();
    }
    assert.equal(cap.captured.warn.length, 1);
    assert.match(cap.captured.warn[0], /package manager recovery|interrupted dpkg/);
});
