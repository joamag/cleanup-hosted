# joamag/cleanup-hosted

Simple GitHub action to cleanup an hosted GitHub Runner environment.

Runs on Linux, macOS and Windows runners, the paths being the ones of the platform (eg: the temporary directory of the system and the home of the user), and the steps that do not apply to a platform being skipped with a warning.

## Build

```bash
npm install
npm run build
```

## Test

```bash
npm test
```

## Usage

```yaml
- uses: joamag/cleanup-hosted@master
  with:
    remove-temp: true
    remove-home-cache: true
    remove-home-colony: true
    remove-tools: true
    remove-git-locks: true
    recover-package-manager: true
```

The `recover-package-manager` step completes an operation of the package manager of the runner that was interrupted (eg: a job cancelled during an `apt-get install`), which would make every later installation on that runner fail. It runs `dpkg --configure -a` (with `sudo -n` when not running as root) on the Linux runners whose dpkg was interrupted, and is skipped on the other platforms and package managers. A failed recovery is reported as a warning, not failing the job.
