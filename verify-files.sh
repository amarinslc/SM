#!/usr/bin/env bash
NODE_PATH=. tsx -e "import { runFullVerification } from './server/file-verification.ts'; runFullVerification().then(console.log).catch(console.error);"
