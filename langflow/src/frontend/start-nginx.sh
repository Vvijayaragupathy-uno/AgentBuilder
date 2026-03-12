#!/bin/sh

# Ensure BACKEND_URL has a protocol (http:// or https://)
case "$BACKEND_URL" in
    http://*|https://*) ;;
    *) 
        if [ -n "$BACKEND_URL" ]; then
            # If it's a Railway internal address, it should be http and usually port 7860
            if echo "$BACKEND_URL" | grep -q ".internal"; then
                echo "Info: Internal address detected. Prepending http://"
                export BACKEND_URL="http://$BACKEND_URL"
                # Add port 7860 if no port is specified
                if ! echo "$BACKEND_URL" | grep -q ":[0-9]*$"; then
                    echo "Info: No port detected. Adding default port :7860"
                    export BACKEND_URL="$BACKEND_URL:7860"
                fi
            else
                echo "Info: Public address assumed. Prepending https://"
                export BACKEND_URL="https://$BACKEND_URL"
            fi
        fi
        ;;
esac

# Set default backend URL if not provided (internal Railway hostname)
export BACKEND_URL=${BACKEND_URL:-"http://agentbuilder.railway.internal:8080"}

# Handle Railway dynamic PORT environment variable
CONTAINER_PORT=${PORT:-80}
echo "Configuring Nginx to listen on port: $CONTAINER_PORT"
sed -i "s|listen 80;|listen ${CONTAINER_PORT};|g" /etc/nginx/conf.d/default.conf

echo "Configuring Nginx proxy to: $BACKEND_URL"

# Replace the placeholder with the actual value in the config file
sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'
