# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

* Unit tests using `node:test`
* Module exports for `index.js` to enable testing

### Changed

* Bumped Node.js action runtime to 24
* Bumped `@actions/core` to ^1.11.1
* Bumped `@vercel/ncc` to ^0.38.4
* Bumped `nodemon` to ^3.1.14
* Removed unused `@actions/github` dependency

### Fixed

* `removeTools` now returns early when `AGENT_TOOLSDIRECTORY` is unset (previously warned but still ran `rm -rf` on an empty path)
* `runCmd` now correctly handles errors thrown by promisified `exec` and rethrows them so failures propagate to `core.setFailed`

## [0.3.0] - 2024-02-24

### Changed

* Bumped Node.js version to 20

## [0.2.0] - 2021-08-30

### Added

* Support for home colony directory removal

### Changed

* Bumped packages
