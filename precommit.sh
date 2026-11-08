#!/bin/sh

set -e

echo "[Precommit]: schlagzaehler-web - lint"
npm -prefix schlagzaehler-web run lint
echo "[Precommit]: schlagzaehler-web - format"
npm -prefix schlagzaehler-web run format
echo "[Precommit]: schlagzaehler-web - test"
npm -prefix schlagzaehler-web run test -- --watch=false

echo "[Precommit]: schlagzaehler-pico - run tests"
./schlagzaehler-pico/tests/run_tests.sh

echo "[Precommit]: Successful!"
