#!/bin/sh

# ---------------------------------------------------------------------------
# Normalise BACKEND_URL
# If the value has no scheme, detect internal vs public and prepend correctly.
# ---------------------------------------------------------------------------
case "$BACKEND_URL" in
    http://*|https://*) ;;
    *)
        if [ -n "$BACKEND_URL" ]; then
            if echo "$BACKEND_URL" | grep -q "\.internal"; then
                echo "Info: Internal Railway address detected — using http://"
                export BACKEND_URL="http://$BACKEND_URL"
            else
                echo "Info: Public address detected — using https://"
                export BACKEND_URL="https://$BACKEND_URL"
            fi
        fi
        ;;
esac

# Default: Railway private network (HTTP, no TLS overhead, no bandwidth cost).
# Override with BACKEND_URL env var in Railway dashboard if needed.
export BACKEND_URL=${BACKEND_URL:-"http://agentbuilder.railway.internal:8080"}

# ---------------------------------------------------------------------------
# Set proxy_ssl_server_name based on whether upstream is HTTPS or HTTP.
# "on"  → nginx sends SNI when establishing a TLS connection to the upstream.
# "off" → plain HTTP upstream; directive is a no-op but set explicitly for clarity.
# ---------------------------------------------------------------------------
case "$BACKEND_URL" in
    https://*) PROXY_SSL="on"  ;;
    *)         PROXY_SSL="off" ;;
esac

# Handle Railway dynamic PORT environment variable
CONTAINER_PORT=${PORT:-80}
echo "Configuring Nginx: port=${CONTAINER_PORT} backend=${BACKEND_URL} ssl_sni=${PROXY_SSL}"

sed -i "s|listen 80;|listen ${CONTAINER_PORT};|g"               /etc/nginx/conf.d/default.conf
sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g"                      /etc/nginx/conf.d/default.conf
sed -i "s|__PROXY_SSL_SERVER_NAME__|${PROXY_SSL}|g"              /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
