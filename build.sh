#!/bin/bash

set -e

cd apps/api
rm -rf dist
pnpm run build
cd ../..
