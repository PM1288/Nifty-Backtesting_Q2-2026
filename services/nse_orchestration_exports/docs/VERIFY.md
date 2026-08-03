# Verification checklist

- [ ] SQL objects created under `nse_ops`
- [ ] API starts and `/health` returns `ok`
- [ ] Scheduler starts and loads enabled jobs
- [ ] Manual job trigger creates a row in `nse_ops.job_run`
- [ ] Latest dashboard snapshot row exists
- [ ] At least 6 system watchlists exist
- [ ] Export manifest rows are created after export run
- [ ] Old export files are removed after retention run
- [ ] Footer disclaimer is rendered in the UI
- [ ] No unapproved UI color tokens are introduced
