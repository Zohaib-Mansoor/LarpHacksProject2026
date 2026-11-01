#!/bin/sh
set -eu

# Free Render services do not support pre-deploy commands. This single-instance
# test deployment applies the committed migrations before accepting requests.
node dist/db/migrate.js
exec node dist/server.js
