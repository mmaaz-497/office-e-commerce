# PostgreSQL Public-Network Verification (T132)

**Satisfies**: Constitution deployment constraints — PostgreSQL must never be publicly
reachable, "including temporarily during debugging."

## Status: not yet performed

No VPS has been provisioned yet — this project is still at the pre-deployment stage, so there
is no live server to check. This document is the runbook to run for real once one exists, and
the record of having done so; it is a release-checklist item
(`docs/release-checklist.md`), not something completable from a workstation.

## The two independent controls

Two controls, not one, precisely so that loosening one during debugging (a common, easy
mistake) does not expose the database:

1. **`listen_addresses = 'localhost'`** in `postgresql.conf` — PostgreSQL itself never binds a
   socket any process outside the VPS could reach, regardless of firewall state.
2. **A firewall rule blocking port 5432** from anything but localhost — even if
   `listen_addresses` were ever loosened to `*` by mistake, the port is still closed at the
   network layer.

`docker-compose.yml` already applies the narrower form of control 1 for local development:
`ports: ["127.0.0.1:5432:5432"]` binds the published port to loopback only, never
`0.0.0.0:5432:5432`. The production VPS runs PostgreSQL directly (not via this compose file), so
control 1 there means editing `postgresql.conf` directly.

## Verification procedure

Run on the VPS, as root or with sudo:

```bash
# Control 1 — PostgreSQL's own bind address
grep -E "^\s*listen_addresses" /etc/postgresql/16/main/postgresql.conf
# Expected: listen_addresses = 'localhost'

# Control 2 — the firewall rule (ufw shown; adapt to whatever firewall the VPS uses)
sudo ufw status | grep 5432
# Expected: either no rule allowing 5432, or an explicit deny/reject
```

Then, from a **different machine** — a laptop, another server, anything off this VPS, because a
check run from the VPS itself proves nothing about what the internet can reach:

```bash
nc -zv tokoshopee.com 5432
```

**Expected result: connection refused or timed out.** A successful connection here is a release
blocker — stop and fix before doing anything else.

## Verification log

| Date | Operator | `listen_addresses` value | Firewall rule confirmed | `nc -zv` result (off-server) | Pass? |
|---|---|---|---|---|---|
| _(none yet — no VPS provisioned)_ | | | | | |
