#!/bin/bash

# kill any previously running chrome processes
# https://peter.sh/experiments/chromium-command-line-switches/
ps -ef | grep google | grep -v grep | awk '{print $2}' | xargs kill -9

# /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --disable-web-security --user-data-dir --safebrowsing-disable-download-protection http://35.211.152.60:8080
google-chrome --disable-gpu --disable-web-security --headless --remote-debugging-port=9222 --safebrowsing-disable-download-protection