# 09 Integrator Checklist

## Before build
- [ ] confirm which backend tables/views are canonical
- [ ] confirm minute refresh cadence
- [ ] confirm which indices and stock universe are in scope
- [ ] confirm whether charts should be generated server-side only
- [ ] confirm Discord channel / thread routing plan
- [ ] confirm test vs production webhook handling
- [ ] confirm acceptable alert frequency per hour
- [ ] confirm quiet hours / holiday behavior

## Before staging
- [ ] `.env` secrets configured
- [ ] test webhook configured locally
- [ ] dispatch preview working
- [ ] chart renderer working
- [ ] root route renders
- [ ] machine facts block parses
- [ ] health and quality routes pass

## Before shadow mode
- [ ] replay sessions selected
- [ ] operator QA rubric ready
- [ ] suppression logging enabled
- [ ] event audit table enabled

## Before canary
- [ ] duplicates low in shadow mode
- [ ] noise budget acceptable
- [ ] stale-source suppression verified
- [ ] options and FII labels accurate
- [ ] close summary reviewed manually

## Before production
- [ ] rotate test webhook if needed
- [ ] production webhook stored in secret manager
- [ ] rollback switch documented
- [ ] on-call / incident notes documented
- [ ] alert routing approved
- [ ] data quality board visible
