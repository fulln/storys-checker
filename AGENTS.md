# Storys video production workspace

This repository gives a local Agent a production workflow entry point and a checker dashboard. The Agent creates video in a configured project; Storys Checker scans its artifacts and reports selected production gates. The bundled demo illustrates the data model with placeholder media and stub scripts.

## Route the request

- For a request to produce or revise a video, use `.codex/skills/storys-video-production/SKILL.md`. Read the chosen project's own `AGENTS.md`, editorial rules, workflow, and applicable skills before making its content. Those project rules determine the actual stages and acceptance criteria.
- For a request to inspect or monitor a project, use the checker commands below.
- Run the checker with Node.js 22 or later from this repository root. It has no third-party npm dependencies. The configured production project may have its own toolchain and dependencies.
- Inspect the selected config and project paths first. Priority: `--config`, `STORYS_CHECKER_CONFIG`, `config.local.json`, `config.json`, `config.example.json`. Preserve existing local config; `npm run demo` does not require overwriting it.

## Inspect production progress

1. Run `node scan.mjs` and `node checks.mjs` from this repository root. Read `check-report.json` or the corresponding file under `STORYS_CHECKER_STATE_DIR`; a zero exit from `checks.mjs` only means the check ran.
2. Inspect each finding and the configured fix command before using `node checks.mjs --fix <fixId>`. Read `fix-result.json` and rerun the check after a fix.
3. Run `node gate.mjs` for a health threshold decision. Report the exit code, score, and remaining findings. The score covers implemented checks; assess the project's other rule gates from their own evidence.
4. Run `npm run build` for a static `panel.html`, or `npm start` for the interactive panel at `http://127.0.0.1:8787`.

Do not claim a playable or publishable video from the demo placeholders or a passing checker score alone. Verify the actual rendered file and every required project gate. Publishing to a platform is a separate action from preparing a local deliverable.
