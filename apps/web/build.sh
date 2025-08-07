#!/bin/bash

set -e

rm -rf .next
NODE_ENV=production pnpm run build
