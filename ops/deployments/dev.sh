# The development site, on the same host as production. Sourced by ops/config.sh.
#
# It has its own secrets, so a mod downloaded from production cannot connect here, nor the
# other way round, and its own Twitch application.

# Names the Docker image and container.
NAME=onlywands-dev

# Origin the site is reached at. The Twitch application whose id is in secrets/twitch_client_id
# must have $PUBLIC_URL/auth/twitch/callback registered as a redirect URL.
PUBLIC_URL=https://dev.onlywands.com

# Port on 127.0.0.1 that nginx proxies to. Each deployment on a host needs its own.
HOST_PORT=3001
