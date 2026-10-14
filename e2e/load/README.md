# k6 scale scripts (T-55-3)

Scripts for the `scale-test` playbook. They run inside the pinned container, never on the host:

```
docker run --rm --add-host=host.docker.internal:host-gateway \
  -v /tmp/invai-w55-T-55-3:/w:ro -v "$PWD/e2e/load":/s:ro -w /s \
  -e CREDS_FILE=/w/creds.json -e BASE_URL=http://host.docker.internal:3155 \
  grafana/k6:1.3.0 run dashboard.k6.js
```

| Script | What | Thresholds (2xx only) |
|---|---|---|
| `dashboard.k6.js` | `today.summary` + `orders.list` with cursor paging, office session; `MODE=breakpoint` ramps the rate | p95 < 400 ms, non-5xx > 99.5% |
| `floor-scan.k6.js` | 20 stations x 1 scan / 3 s (`STATIONS`, `STATION_INTERVAL`), station logins once in `setup()` at <= 15/min | p95 < 300 ms, non-5xx > 99.5% |
| `label-batch.k6.js` | `shipping.batchBuy` on the mock carrier, polls the job | job p95 < 60 s |

Rules: arrival-rate executors only; 429 (`RATE_LIMITED`) is counted in `<name>_429`, never bypassed;
no more than 3 password sign-ins per run (20/min/IP). The creds file is `SEED_OUTPUT_FILE` from
`pnpm db:seed:scale` (mode 0600, delete it after the run). Point the API at a scratch database only.
Playwright, Vitest and the Vite build ignore this folder.
