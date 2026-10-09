---
name: storys-video-production
description: Produce or revise a video in a configured local project by following that project's production rules, creating each stage's artifact, rendering a real video, and using Storys Checker for progress and gate feedback. Use for requests to make a video; use the checker commands alone for inspection-only requests.
---

# Produce a video with project rules

Storys Checker is the workflow and feedback companion. The Agent performs the creative and technical work in a configured production project. Use the project's own rules as the authority for content, tools, stage order, and deliverables. The bundled `examples/demo-project` illustrates the structure but has stub generation scripts and non-playable media.

1. Resolve the target project in the active checker config (`--config` → `STORYS_CHECKER_CONFIG` → `config.local.json` → `config.json` → `config.example.json`). Confirm its `root` and `videoDir`. If only the bundled demo is configured, explain that a real production project must be connected before a real render is possible.
2. Read the target project's `AGENTS.md`, account or editorial rules, workflow document, current episode brief, relevant skills, and available production scripts. Treat the project's actual required outputs and gates as authoritative. If a rule document is missing, identify the missing constraint before making irreversible content decisions.
3. Work through the project's required stages. Typically this means topic and source verification → script → storyboard and asset plan → licensed/local assets → narration, music, captions, and timing → scenes and covers → key frames → short preview → full preview → final render → playback/technical checks → local delivery package. Use the project's commands and formats; do not assume the demo's dates, brand, voice, aspect ratio, or P0–P12 gates apply elsewhere.
4. At each gate, inspect the artifact and evidence before advancing. Keep facts traceable to sources, record asset rights, and apply the latest user feedback to the affected script, shots, and review record. Render and review actual media rather than inferring quality from file existence or hash checks.
5. Use Storys Checker from its repository root for `node scan.mjs` and `node checks.mjs` as work progresses. Read `check-report.json`; decide on fixes from the project's rules and the finding details. Run `node gate.mjs` near local delivery and report the score, findings, and exit code. A passing checker score covers only the checks implemented and enabled in the config.
6. Complete the project's own render and delivery verification. Return the playable video, covers, sources, and review evidence in the project's required location. State which gates were verified and which remain unresolved. Do not treat a placeholder demo file or dashboard snapshot as a generated video.

The user can ask for a finished local video without asking for every production command separately. Keep creation, review, and repair moving within the authority they granted. Uploading or publishing to an external platform requires that action to be part of the user's request or prior authorization.
