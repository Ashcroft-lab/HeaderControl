# Changelog

All notable changes to HeaderControl are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.21] - 2026-07-17

### Fixed
- Apply request headers on document navigations (`main_frame`). Chrome skips `main_frame` when `resourceTypes` is omitted; empty lists are now expanded to all resource types.

### Added
- Show the extension version on the Manage page header.

## [0.1.20] - 2026-07-13

### Added
- CI packing workflow and Chrome Web Store draft upload on `v*` tags.
