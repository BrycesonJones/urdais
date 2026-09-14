# DeepSeek

**Status: internal research artifact. Not a methodology page, not routed publicly, not registered in the docs catalog.** Retrieved 14 September 2026 from https://api-docs.deepseek.com/quick_start/pricing (HTTP 200 via curl; WebFetch 409).

1. Official pricing: https://api-docs.deepseek.com/quick_start/pricing
2. Official docs: https://api-docs.deepseek.com/ (OpenAI- and Anthropic-compatible base URLs), changelog https://api-docs.deepseek.com/updates
3. Model names: call `deepseek-flash` (version DeepSeek-V4.1-Flash) and `deepseek-v4-pro` (DeepSeek-V4-Pro-0813). Legacy `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are accepted but retired, served and billed as Flash.
4–7. No batch table. Cache **hit vs miss** on input; output; each split **peak vs off-peak**. Off-peak is half of peak. Peak hours: 01:00–04:00 and 06:00–10:00 UTC Monday–Friday. Flash cache-miss input $0.15 off-peak / $0.30 peak; output $0.60 / $1.20; cache-hit $0.003 / $0.006. Pro is higher ($0.66 / $1.32 miss input; $1.98 / $3.96 output).
8. Context length 1M; no separate long-context surcharge on this table. Max output 384k.
9. Currency: **USD as published** (`$` on the English docs). No official conversion step required for this surface.
10. Denominator: per 1M tokens.
11. Region: none on the table (global API `https://api.deepseek.com`).
12. Effective dates: changelog cites peak/off-peak from 16 Aug 2026 16:00 UTC and V4.1-Flash price cut 10 Sep 2026 04:00 UTC. 14 Sep 2026 V4 Pro continues at unchanged billing after a previously announced routing plan.
13. Old pricing: recoverable as dated changelog events, not as a dense series.
14. Machine-readable pricing API: **no**.
15. Automation: no usable robots.txt; ToS retrieved from the Open Platform CDN; scrape/index clauses **not isolated** — unclear.
16. Attribution: none isolated.

Never blend cache-hit with cache-miss or peak with off-peak. Thinking mode is not a separate price.
