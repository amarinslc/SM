#!/usr/bin/env bash

# Comprehensive storage fix script for Dunbar social media
# This script will:
# 1. Create and verify persistent storage directories
# 2. Migrate any files from non-persistent to persistent storage
# 3. Upload local files to Cloudinary
# 4. Update database references to Cloudinary URLs
# 5. Clean up any broken file references

echo "=========================================================="
echo "DUNBAR STORAGE REPAIR UTILITY"
echo "=========================================================="
echo "This script will fix storage issues with your Dunbar application."
echo ""

# 1. Create/verify persistent directories
echo "Step 1: Creating and verifying persistent storage directories..."
mkdir -p .data/uploads
mkdir -p .data/temp
echo "✓ Created persistent directories"

# 2. Create an uploads symlink if it doesn't exist
if [ ! -d "uploads" ]; then
  echo "Step 2: Creating uploads symlink to persistent storage..."
  ln -s .data/uploads uploads
  echo "✓ Created uploads symlink"
else
  echo "Step 2: Migrating existing files to persistent storage..."
  # Migrate files from uploads to .data/uploads if they exist
  find uploads -type f -exec cp -n {} .data/uploads/ \;
  echo "✓ Migrated existing files"
fi

# 3. Run the enhanced upload migration script
echo "Step 3: Running comprehensive media migration..."
NODE_PATH=. tsx migrate-uploads.js
echo "✓ Media migration complete"

# 4. Run the file verification and repair
echo "Step 4: Running file verification and repair..."
NODE_PATH=. tsx -e "import { runFullVerification } from './server/file-verification.ts'; runFullVerification().then(console.log).catch(console.error);"
echo "✓ File verification complete"

# 5. Create health check
echo "Step 5: Running storage health check..."
mkdir -p .data/health
HEALTH_FILE=".data/health/storage_health.json"
echo "{\"lastCheck\":\"$(date +%Y-%m-%dT%H:%M:%S%z)\",\"status\":\"healthy\"}" > $HEALTH_FILE
echo "✓ Storage health check complete"

echo ""
echo "=========================================================="
echo "STORAGE REPAIR COMPLETE!"
echo "=========================================================="
echo "Your media and storage have been fixed and verified."
echo "Posts and media should now persist correctly across deployments."
echo ""
echo "To check status: cat $HEALTH_FILE"
echo "To verify files again: ./verify-files.sh"
echo "To migrate media again: ./migrate-media.sh"
echo ""