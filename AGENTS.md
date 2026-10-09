# Storys Checker agent instructions

This repository is a local video production checker. It scans a separately configured project, reports findings, and previews a dashboard. The demo project contains sample rules and placeholder media; do not treat them as a production video workflow or a finished video.

## Before running

- Use Node.js 22 or later. Run commands from this repository root. The checker itself needs no `npm install`.
- Read `README.md` and `docs/AGENT_APP.md`. Inspect the selected configuration and target paths before acting. Configuration priority is `--config`, `STORYS_CHECKER_CONFIG`, `config.local.json`, `config.json`, then `config.example.json`.
- Preserve existing local configuration. Never overwrite `config.json` or `config.local.json` to try the demo. Use `npm run demo` for the synthetic example.
- Read the target project's own `AGENTS.md`, workflow documents, and applicable skills before changing its content or running its production commands. This repository does not supply those project-specific instructions.

## Check a configured project

1. Run `node scan.mjs`, then `node checks.mjs`.
2. Read `check-report.json` (or the same file under `STORYS_CHECKER_STATE_DIR`). Report the health score and all error, warning, and information findings. A zero exit from `checks.mjs` only means the check ran.
3. If a finding has a `fixId` and the corresponding configured command is appropriate, run `node checks.mjs --fix <fixId>`, inspect `fix-result.json`, then rerun the checks. Review the configured command before executing it.
4. Run `node gate.mjs` when a health threshold decision is needed. Report its exit code and score. A passing score does not establish factual accuracy, rights to assets, creative quality, or playable video output.
5. For a static preview, run `npm run build` and open `panel.html`. For the local interactive panel, run `npm start` and open `http://127.0.0.1:8787`.

To produce a video, work in the separately configured production project using its own rules, assets, render tooling, and required credentials. This checker can assess selected artifacts after that work; it does not create a finished video or install a production skill.
