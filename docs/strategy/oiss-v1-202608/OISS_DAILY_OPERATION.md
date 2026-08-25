# Daily operation

OISS mirrors OIIS official slots: 09:30 and every 30 minutes through 15:00 IST. It polls for a newly completed immutable OIIS source run and idempotently materializes one independent OISS run. Scheduler defaults off. Enable only `OISS_V1_202608_SCHEDULER_ENABLED=1` after shadow acceptance. Paper, assisted and live-candidate remain separately disabled. The container records duration, stock count, actionable count and rejection count.
