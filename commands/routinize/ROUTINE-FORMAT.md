# Routine format

Every routine in `scripts/routines/` follows this shape so routines are
predictable to fetch, run, and extend.

## File shape

- **One routine per file**, named after the pattern: kebab-case, `.sh` for
  shell, the natural extension for other languages.
- **Header doc block**: purpose in one line, the parameters (name + meaning),
  and a usage example.
 - **Parameters at the top** as variables with defaults. The variance between
   occurrences becomes parameters — replace hardcoded parameters with env
   default overrides (e.g. `VAR="${VAR:-default}"`). Cluster-specific values
   (partition, node names) are defaults, overridable.
- **Single responsibility**: one routine does one kind of job (launch a
  training job, not launch-and-plot).
- **Safe to re-run** where sensible (idempotent: overwrite its own outputs,
  skip already-done steps).

 ## Manifest format (`scripts/routines/manifest.json`)

 Routine storage includes a manifest at `scripts/routines/manifest.json` that
 indexes all available routines and their metadata.

 ### JSON Schema

 `scripts/routines/manifest.json` contains an object with a `routines` array.
 Each routine entry has the following fields:

 - `id`: Unique string identifier for the routine (e.g. `"launch-slurm-job"`).
 - `name`: Human-readable display name (e.g. `"Launch Slurm Job"`).
 - `file`: Relative path to the routine script under `scripts/routines/`
   (e.g. `"launch_slurm_job.sh"`).
 - `description`: Brief description of what the routine does.
 - `parameters`: Array of parameter objects, each with:
   - `name`: Parameter/variable name (e.g. `"GPUS"`).
   - `default`: Default value.
   - `description`: Description of the parameter.
 - `tags`: Array of string keywords for categorization (e.g. `["slurm", "gpu"]`).

 ### Example `manifest.json`

 ```json
 {
   "routines": [
     {
       "id": "launch-slurm-job",
       "name": "Launch Slurm Job",
       "file": "launch_slurm_job.sh",
       "description": "Submits a Slurm job with customizable GPU, RAM, CPU, and partition settings.",
       "parameters": [
         {
           "name": "GPUS",
           "default": "4",
           "description": "Number of GPUs requested"
         },
         {
           "name": "RAM",
           "default": "64G",
           "description": "Memory requested"
         },
         {
           "name": "CPUS",
           "default": "16",
           "description": "Number of CPUs requested"
         },
         {
           "name": "PARTITION",
           "default": "gpu",
           "description": "Slurm partition name"
         }
       ],
       "tags": [
         "slurm",
         "cluster",
         "gpu"
       ]
     }
   ]
 }
 ```

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
