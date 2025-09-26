#!/bin/sh
set -eu

# Default PORT if not provided
: "${PORT:=8080}"

# Render nginx conf from template with runtime PORT
envsubst '${PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Quiet logs to save I/O
exec nginx -g 'daemon off; error_log /dev/stderr warn;'


