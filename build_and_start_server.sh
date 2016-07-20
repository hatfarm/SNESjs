#!/usr/bin/env bash
webpack
if [ $? -eq 0 ]; then
	node index.js
else
	echo Failed build...
fi