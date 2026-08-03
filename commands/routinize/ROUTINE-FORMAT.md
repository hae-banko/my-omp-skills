# Routine format

Every routine in `scripts/routines/` follows this shape so routines are
predictable to fetch, run, and extend.

## File shape

- **One routine per file**, named after the pattern: kebab-case, `.sh` for
  shell, the natural extension for other languages.
- **Header doc block**: purpose in one line, the parameters (name + meaning),
  and a usage example.
- **Parameters at the top** as variables with defaults. The variance between
  occurrences becomes parameters — never hardcode what varies between uses.
  Cluster-specific values (partition, node names) are defaults, overridable.
- **Single responsibility**: one routine does one kind of job (launch a
  training job, not launch-and-plot).
- **Safe to re-run** where sensible (idempotent: overwrite its own outputs,
  skip already-done steps).

## Example skeleton

```bash
#!/usr/bin/env bash
# Routine: launch a slurm job
# Usage: ./launch_slurm_job.sh --gpus 4 --ram 64G
# Parameters: the variance between job launches.

set -euo pipefail

GPUS="${GPUS:-4}"
RAM="${RAM:-64G}"
CPUS="${CPUS:-16}"
PARTITION="${PARTITION:-gpu}"

sbatch \
  --gres=gpu:"${GPUS}" \
  --mem="${RAM}" \
  --cpus-per-task="${CPUS}" \
  --partition="${PARTITION}" \
  "$@"
```

## Extending

To extend a routine: add a parameter or mode at the top, keep existing
behavior working (defaults preserve it), and note the addition in the doc
block. **Never fork a copy for a special case — that is bloat.** If a new use
fits an existing routine with a parameter, extend it; only a genuinely novel
pattern becomes a new file.
