# Strategy-lab rollback runbook

Rollback is an application rollback. Keep the seven additive strategy-lab
tables so older and newer application images remain compatible. Do not drop
tables, restore the database, remove a volume or use `docker compose down -v`.

1. Record current container images and health.
2. Retag or select the previously verified dashboard/analytics images.
3. Recreate only the affected application services with project name
   `trading-stack-novius2`.
4. Recreate Nginx only if its application route configuration changed.
5. Verify the existing dashboards and the data-preservation manifest.

The runtime file recovery archive for this batch is:

```text
/home/novius2/backups/trading-stack-runtime/20260809T163000Z/
```

Example service rollback after restoring the prior source/image tags:

```bash
cd /home/novius2/trading-stack
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml up -d --no-deps nse-analytics-worker n50-dashboard
docker compose -p trading-stack-novius2 --env-file .env \
  -f docker-compose.yml stop nse-strategy-lab-worker n50-dashboard-stage
```

Stopping the lab worker leaves queued/running evidence durable in PostgreSQL.
A future redeploy can resume work without creating a duplicate run.
