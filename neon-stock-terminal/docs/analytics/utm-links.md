# Production UTM Links

All links in this file point to the live production app on `https://m.nifty50today.co.in`.

## How to use these

- Keep the URL exactly as written when posting in the named channel.
- Change only the `utm_content` or `utm_id` if you need a new creative/version.
- Do not send traffic to the root domain; use the `m.nifty50today.co.in` production host.

## YouTube

### Main video description

`https://m.nifty50today.co.in/n50/?utm_source=youtube&utm_medium=video_description&utm_campaign=market_story_launch&utm_content=channel_main_video&utm_id=yt_ms_001&utm_source_platform=youtube`

### Pinned comment for Option Chain

`https://m.nifty50today.co.in/n50/options?utm_source=youtube&utm_medium=pinned_comment&utm_campaign=option_chain_education&utm_content=channel_pinned_comment&utm_id=yt_oc_001&utm_source_platform=youtube`

### Live stream / Strategy Lab

`https://m.nifty50today.co.in/n50/analytics/learn?utm_source=youtube&utm_medium=live_stream_link&utm_campaign=strategy_lab_launch&utm_content=live_stream_description&utm_id=yt_sl_001&utm_source_platform=youtube`

## Reddit

### Reddit post to Market Hub

`https://m.nifty50today.co.in/n50/analytics?utm_source=reddit&utm_medium=post&utm_campaign=market_hub_launch&utm_content=india_investments_post&utm_id=rd_mh_001&utm_source_platform=reddit`

### Reddit comment to Backtesting Compare

`https://m.nifty50today.co.in/n50/backtesting/compare?utm_source=reddit&utm_medium=comment&utm_campaign=backtesting_compare_launch&utm_content=indianstreetbets_comment&utm_id=rd_bc_001&utm_source_platform=reddit`

## X

### X thread

`https://m.nifty50today.co.in/n50/?utm_source=x&utm_medium=thread_post&utm_campaign=market_story_launch&utm_content=thread_hook&utm_id=x_ms_001&utm_source_platform=x`

## Telegram

### Telegram channel post to Option Chain

`https://m.nifty50today.co.in/n50/options?utm_source=telegram&utm_medium=channel_post&utm_campaign=option_chain_education&utm_content=channel_alert&utm_id=tg_oc_001&utm_source_platform=telegram`

## WhatsApp

### Direct share to Simulator

`https://m.nifty50today.co.in/n50/analytics/simulator?utm_source=whatsapp&utm_medium=share&utm_campaign=simulator_launch&utm_content=direct_share&utm_id=wa_sim_001&utm_source_platform=whatsapp`

## Validation notes

- These URLs were generated with `node scripts/generate-utm.mjs`.
- The public tracker path is expected to be:
  - page: `https://m.nifty50today.co.in/n50/...`
  - Matomo JS: `https://m.nifty50today.co.in/n50/matomo/matomo.js`
  - Matomo collect: `https://m.nifty50today.co.in/n50/matomo/matomo.php`
