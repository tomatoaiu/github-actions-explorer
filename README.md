# GitHub Actions Explorer

A Chrome Manifest V3 extension that upgrades the GitHub Actions workflow
sidebar with fuzzy search, prefix grouping, and repository-specific history.

## Features

- Fuzzy workflow search powered by Fuse.js
- Character-level highlighting of fuzzy search matches
- Recursive hierarchy grouping with `-`, `_`, and `/` as equivalent separators
- Groups-first alphabetical sorting and compact intermediate hierarchy paths
- Prefix-trimmed workflow labels in groups while YAML file names stay unchanged
- Up to 10 recent searches and 10 recently opened workflows per repository
- Per-item history removal in addition to clearing all history
- One-click switching between Explorer and GitHub's original workflow list
- Five-minute workflow cache with a clearly labeled seven-day stale fallback
- Runtime validation of all persisted data with Valibot
- Shadow DOM styles and GitHub SPA navigation support through WXT
- Safe fallback to GitHub's original workflow list when fetching or parsing fails

History and cache data are stored locally with WXT Storage's
`local:` area (`chrome.storage.local`). They are not synced between browsers or
sent anywhere. The **Clear history** button removes search and viewing history
for the current repository while preserving collapsed groups.

## Development

```sh
mise install
pnpm install
pnpm dev
```

Build the production extension and load `.output/chrome-mv3` as an unpacked
extension from `chrome://extensions`:

```sh
pnpm build
```

Run every required quality check with:

```sh
pnpm fmt:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The workflow list comes from GitHub's unofficial same-origin
`actions/workflows_partial` endpoint. Its parser is isolated and covered by
HTML fixtures so a markup change cannot silently turn a parse failure into an
empty workflow list.
