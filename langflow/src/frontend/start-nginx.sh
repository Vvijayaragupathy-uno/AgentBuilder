#!/bin/sh

# Set default backend URL if not provided (internal Railway hostname)
export BACKEND_URL=${BACKEND_URL:-"http://agentbuilder.railway.internal:8080"}

echo "Configuring Nginx proxy to: $BACKEND_URL"

# Replace the placeholder with the actual value
sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" /etc/nginx/conf.d/default.conf


# Start nginx
exec nginx -g 'daemon off;'
