#!/bin/sh
# Container entrypoint: runs the score service (scores + Lightning API) and nginx
# side by side. If either one exits, stop the other and exit non-zero so Docker's
# restart policy brings the whole container back, instead of nginx carrying on
# with a dead /api behind it.

cd /score-service || exit 1
node index.js &
node_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

shutdown() {
  kill -TERM "$node_pid" "$nginx_pid" 2>/dev/null
  wait
}

trap 'shutdown; exit 0' TERM INT

# `sleep & wait` keeps the shell responsive to signals and reaps exited children,
# so kill -0 stops succeeding as soon as a process has died.
while kill -0 "$node_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 2 &
  wait $!
done

if kill -0 "$node_pid" 2>/dev/null; then
  echo "nginx exited - stopping container" >&2
else
  echo "score service exited - stopping container" >&2
fi
shutdown
exit 1
