# Roadmap — where this goes next

v1 is a working, grounded, resilient prep-kit generator. These are the directions
that grow it from a product into a systems project. The theme: **extend the
primitives this app already has** (verify-in-code grounding, CAS optimistic
concurrency, background jobs, honest-none, per-call timeouts + watchdog) rather
than bolt on new ones.

## Cost & token efficiency
- **Content-hash caching** of the site fetch and LLM results — an identical JD or
  company site serves a cached kit, zero re-spend.
- **Model routing by task** — a cheap model for extraction/grounding, a stronger
  one only for generation. Safe here because the code verifies output regardless
  of which model produced it.
- **Prompt caching** for the static schema / system portions of each call.
- **Semantic dedup** — embed the JD; a near-duplicate reuses an existing kit.

## Scale
- **Job queue + workers** — move generation off the request lifecycle onto a
  durable queue (Redis / SQS); fan out the per-category question generation in
  parallel instead of running the steps in sequence.
- **Shared-store rate limiting** (e.g. Upstash Redis) for a globally exact limit
  across instances (today's limiter is in-memory / per-instance).
- **Idempotency keys** on generation so a retry can't double-run or double-charge.
- **DB scale** — indexes + pagination on the kit list as volume grows (the single
  embedded Kit doc is right for v1, not for millions).

## Distributed correctness
- **Multi-writer collaboration** on a kit — extend the existing CAS-on-`version`
  to real concurrent editing (conflict resolution, eventually CRDT / OT).
- **Durable pipeline execution** — a failed step *resumes* from where it stopped
  instead of restarting the whole run (sagas, retries, exactly-once semantics).
- **Multi-instance correctness testing** behind a load balancer.

---

*The through-line: CAS + idempotency + verify-in-code are the same primitives that
show up in correctness-under-contention systems — this app is a second place they
appear, which is the interesting part.*
