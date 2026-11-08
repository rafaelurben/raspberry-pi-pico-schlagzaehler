#!/bin/sh

set -e

npm -prefix schlagzaehler-web run lint
npm -prefix schlagzaehler-web run format
npm -prefix schlagzaehler-web run test --watch=false

./schlagzaehler-pico/test/run_tests.sh
