#!/bin/sh

# Ensure BACKEND_URL has a protocol (http:// or https://)
case "$BACKEND_URL" in
    http://*|https://*) ;;
    *) 
        if [ -n "$BACKEND_URL" ]; then
            echo "Warning: BACKEND_URL does not have a protocol. Prepending https://"
            export BACKEND_URL="https://$BACKEND_URL"
        fi
        ;;
esac

# Set default backend URL if not provided (internal Railway hostname)
export BACKEND_URL=${BACKEND_URL:-"http://agentbuilder.railway.internal:8080"}

echo "Configuring Nginx proxy to: $BACKEND_URL"

# Replace the placeholder with the actual value
sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" /etc/nginx/conf.d/default.conf


# Start nginx
exec nginx -g 'daemon off;'
