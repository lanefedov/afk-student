#!/usr/bin/env bash

apt-get update
apt-get install -y wget gnupg ca-certificates fonts-liberation libappindicator3-1 xdg-utils lsb-release

wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -
sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list'

apt-get update
apt-get install -y google-chrome-stable
