## Token-efficiency rules

Minimize token and context usage unless extra context is genuinely necessary.

Token efficiency must not come at the expense of correctness, necessary investigation, or verification.

* Default assumption: the current task is local, not repository-wide. Broaden scope only when necessary.
* Do not scan the whole repository by default.
* Read only files directly relevant to the current task.
* Prefer exact file paths and targeted searches over broad repository exploration.
* Do not reread files already inspected unless they may have changed or relevant details remain unclear.
* Do not load large logs, generated files, lockfiles, build outputs, assets, or unrelated documentation unless required.
* When inspecting logs or telemetry, extract or summarize only the relevant information before reasoning about it.
* Prefer deterministic scripts and existing tools for repetitive operations rather than repeatedly reasoning through the same steps.
* Stop exploring once there is enough evidence to make the change safely.
* For narrow bugs, identify the smallest likely set of files first and expand only if necessary.
* Do not perform broad architecture reviews unless explicitly requested.
* Use targeted tests when they can validate the change; avoid exhaustive test runs unless needed.
* Do not restate large amounts of project context in responses.
* Keep plans, summaries, and handoffs concise.

Before opening additional files, ask internally: "Will this materially affect the current task?"

At the end of an implementation task, report only the applicable items:

1. What changed.
2. Files changed.
3. Tests performed.
4. Remaining uncertainty.
