# Railway deploy notes

## Required service variables

```env
NODE_ENV=production
DEVICE_API_KEY=<long-random-secret>
CORS_ORIGIN=*
DATA_RETENTION_DAYS=30
DEVICE_OFFLINE_SECONDS=60
PLUG_STALE_SECONDS=90
LOG_LEVEL=info
```

Railway injects `PORT`, so do not hardcode it for production.

## SQLite persistence

Attach a Railway Volume to the service and mount it at:

```text
/app/data
```

Then either set:

```env
DB_PATH=/app/data/mushroom.db
```

or leave `DB_PATH` unset. When a volume is attached, Railway provides
`RAILWAY_VOLUME_MOUNT_PATH`, and the app will use:

```text
$RAILWAY_VOLUME_MOUNT_PATH/mushroom.db
```

Because Railway mounts volumes as root, set this service variable when using the
current Docker image:

```env
RAILWAY_RUN_UID=0
```

## Healthcheck

`railway.json` configures Railway to check:

```text
/healthz
```

The deployment becomes active only after this endpoint returns a 2xx response.
