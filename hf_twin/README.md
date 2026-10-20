# hf_twin: heart-failure congestion twin

Code for the fluid-accumulation (congestion) plan. See `../journey.md` for decisions.

```
hf_twin/
  ml_training/          everything needed to train and test the congestion model (separate package)
    config.py           paths, channel lists, targets, exclusion rules
    data_io.py          read headers, slices and labels from the SCG-RHC download
    quality.py          signal sanity checks (heartbeat visible, sensors not flat)
    scripts/            runnable entry points (one task each)
    artifacts/          outputs: check tables, plots, trained model, metrics
```

The raw data lives outside the repo, in `D:/CardiacDigitalTwin_data/scg-rhc` (override with the
`SCG_RHC_ROOT` environment variable). Run scripts from the repo root with the project venv, for example:

```
python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.check_signals
```
