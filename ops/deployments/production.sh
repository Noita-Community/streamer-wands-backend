# The live site. Sourced by ops/config.sh.

# Names the Docker image and container.
NAME=onlywands

# Origin the site is reached at. The Twitch application whose id is in secrets/twitch_client_id
# must have $PUBLIC_URL/auth/twitch/callback registered as a redirect URL.
PUBLIC_URL=https://onlywands.com

# Port on 127.0.0.1 that nginx proxies to. Each deployment on a host needs its own.
HOST_PORT=3000
