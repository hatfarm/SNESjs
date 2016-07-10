#!/usr/bin/env bash
webpack
if [ $? -eq 0 ]; then
	./launch_test_server.py
else
	echo Failed build...
fi