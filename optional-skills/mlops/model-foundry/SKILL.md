---
name: model-foundry
description: Design, train, evaluate, package, and serve models.
version: 0.1.0
author: Khaja Aijaz (@khajaaijaz26), Panergos Agent
license: Apache-2.0
platforms: [linux, macos, windows]
metadata:
  panergos:
    tags: [Models, Training, Evaluation, Serving, MLOps]
    category: mlops
    related_skills:
      [
        huggingface-tokenizers,
        torchtitan,
        peft,
        axolotl,
        trl-fine-tuning,
        unsloth,
        evaluating-llms-harness,
        huggingface-hub,
        llama-cpp,
        serving-llms-vllm
      ]
---

# Model Foundry Skill

Build or adapt a model through explicit data, training, evaluation, packaging, serving, and connection gates. The included smoke trainer proves the lifecycle on a CPU without downloads; it is educational validation, not a production language model.

## When to Use

- "Create a small model from my licensed corpus."
- "Fine-tune this open model and evaluate it before deployment."
- "Plan pretraining from scratch with checkpoints and a serving target."
- "Package our model and connect it to Panergos."

Don't use when prompting, retrieval, a rules engine, or an existing model meets the acceptance criteria more cheaply and safely.

## Prerequisites

- Confirm ownership or an applicable license for every dataset, tokenizer asset, base model, and evaluation set. Record privacy, consent, retention, export, and deletion constraints.
- Define the task, users, languages, risk class, target hardware, latency/context/quality goals, maximum compute and spend, and abort conditions.
- Keep held-out evaluation data separate before training. Remove secrets, unexpected personal data, duplicates, and train/evaluation leakage.
- Use `terminal` for training commands and `read_file` for reports. Use a configured artifact store or `huggingface-hub` only after publication approval.

## How to Run

Install with `panergos skills install official/mlops/model-foundry`. Start with the dependency-free CPU smoke path:

```bash
python "${PANERGOS_SKILL_DIR}/scripts/tiny_model_smoke.py" --output ./model-foundry-smoke
```

Pass `--corpus <utf8-text-file>` to train on an authorized local text sample. Inspect `model.json` and `metrics.json` with `read_file`; the same seed and corpus produce the same artifacts.

For a real model, select only the workflow needed:

| Goal                                 | Route                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Train a tokenizer                    | `huggingface-tokenizers`                                                  |
| Pretrain a transformer from scratch  | `torchtitan`                                                              |
| Parameter-efficient adaptation       | `peft`, `axolotl`, or `unsloth`                                           |
| Supervised/preference/RL fine-tuning | `trl-fine-tuning`                                                         |
| Reproducible model evaluation        | `evaluating-llms-harness`                                                 |
| Version and publish artifacts        | `huggingface-hub` or a configured private registry                        |
| Quantized local/CPU serving          | `llama-cpp`                                                               |
| Production GPU serving               | `serving-llms-vllm`                                                       |
| Connect the endpoint                 | `terminal` with `panergos model --quick --provider openai-compatible ...` |

## Quick Reference

### Scale guide

| Path                                           | Typical wall time           | Purpose                                                                  |
| ---------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Included character-bigram smoke                | Seconds to minutes on a CPU | Validate data-to-artifact plumbing only                                  |
| Educational tiny neural training               | Minutes to hours            | Learn and test a small architecture                                      |
| Fine-tune or preference-tune an existing model | Hours to days               | Specialize a capable base model                                          |
| Production pretraining from scratch            | Days to months              | Create a base model with substantial data and accelerator infrastructure |

These are planning bands, not promises. Dataset size, tokens, parameter count, precision, accelerators, parallelism, checkpoint cadence, failures, and evaluation depth determine actual time and cost.

### Required gates

`data rights -> clean split -> baseline -> smoke run -> budgeted training -> checkpoints -> held-out evaluation -> safety review -> package -> serve -> Panergos connection -> monitored rollout`

## Procedure

### 1. Decide whether training is necessary

Compare prompting, tools, retrieval, constrained decoding, and an existing model against the task. Define a measurable baseline and the improvement that justifies training. Done when training has a written success threshold, budget, and simpler alternatives were tested or ruled out.

### 2. Create the data card

Record sources, owners, licenses, consent, languages, time range, sampling, exclusions, personal/sensitive fields, preprocessing, deletion route, and known bias. Hash immutable source snapshots and keep raw data separate from derived data. Done when every training item is covered by a lawful use and retention decision.

### 3. Build leakage-resistant splits

Normalize and deduplicate before splitting by the real leakage unit such as document, author, customer, repository, or time window. Reserve validation and final test sets that training cannot read. Done when split hashes, counts, overlap checks, and contamination risks are recorded.

### 4. Choose tokenizer, model, and serving target together

Select vocabulary, context length, parameter budget, architecture, precision, license, and output format against languages, task, memory, latency, and deployment hardware. Train a custom tokenizer only when measured coverage or compression justifies it. Done when the planned artifact can be served on the named target within its resource envelope.

### 5. Prove the lifecycle cheaply

Run the included script through `terminal`, or use a tiny configuration of the selected training workflow. Confirm deterministic input handling, train/validation separation, metrics, artifact writing, reload, and sample inference before allocating accelerators. Done when a clean run creates inspectable artifacts and a repeated seeded run agrees.

### 6. Train with resumable checkpoints

Pin code, dependencies, data/tokenizer hashes, configuration, random seeds, and hardware. Save optimizer/scheduler/RNG state at a tested cadence; monitor loss, throughput, memory, gradient health, validation quality, cost, and abort thresholds. Resume a short run before scaling. Done when a preempted job can continue without silently restarting or changing inputs.

### 7. Evaluate against gates

Compare the candidate with the frozen baseline on held-out task quality, robustness, safety, privacy leakage, memorization, bias, latency, memory, and cost. Keep failures and raw results, not only aggregate wins. Done when every acceptance threshold has evidence and regressions have an owner or rejection decision.

### 8. Package a reproducible artifact

Store weights or adapters, tokenizer, inference config, model/data cards, license and notices, checksums, evaluation report, training manifest, supported inputs, limitations, and rollback version. Scan the package for secrets and unnecessary training data. Done when a new environment can verify and load the artifact from documented inputs.

### 9. Serve and connect

Choose `llama-cpp`, `serving-llms-vllm`, or another OpenAI-compatible server based on hardware and load. Protect non-loopback endpoints with authentication and transport security, then connect through `panergos model --quick --provider openai-compatible` without placing the key value in command history. Done when Panergos completes a health check and a version-identifying test request.

### 10. Roll out and monitor

Start with a bounded audience, log the model/version and outcome without retaining unnecessary prompt data, watch quality/latency/cost/safety signals, and keep rollback tested. Feed approved failures into the next data/evaluation version rather than modifying production invisibly. Done when ownership, alerts, rollback, retention, and review cadence are active.

## Pitfalls

- Training a model when retrieval or a tool would solve the task.
- Calling the included bigram smoke artifact a useful language model.
- Mixing evaluation examples into tokenizer fitting, training, tuning, or prompt selection.
- Downloading a model or dataset without checking its license, provenance, and code-execution settings.
- Scaling before checkpoint resume, artifact reload, and the smallest end-to-end path work.
- Reporting only a best run while hiding seeds, failures, regressions, hardware, latency, or cost.
- Assuming local inference is free of hardware, storage, energy, and maintenance costs.

## Verification

- [ ] Data/model rights, privacy, retention, provenance, and hashes are recorded.
- [ ] Baseline, held-out splits, leakage checks, metrics, thresholds, and abort conditions are explicit.
- [ ] A seeded CPU smoke run wrote reloadable model and metric artifacts.
- [ ] Checkpoint resume was tested before scaling training.
- [ ] Evaluation covers quality, safety, privacy, bias, latency, memory, and cost for the use case.
- [ ] The package contains config, tokenizer, license/notices, checksums, reports, limitations, and rollback version.
- [ ] The served version was health-checked and connected without exposing credentials.
