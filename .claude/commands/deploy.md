---
description: Deploy Exploding Sats to production via Docker
---

Deploy the application to production via Docker. Follow these steps in order:

## 1. Run Tests
First, run the full test suite to ensure everything passes:
```bash
npm run test
```
If tests fail, stop and fix the issues before proceeding.

## 2. Commit and Push (if needed)
Check for uncommitted changes:
```bash
git status
```
If there are changes, commit them with a descriptive message and push to GitHub.

## 3. Build Docker Image
Build the new Docker image. Use `--no-cache` if you suspect Docker is using stale cached layers:
```bash
cd /mnt/raid1/GitHub/black-panther/apps-stack
docker compose build exploding-sats
```

## 4. Deploy Container
Stop the old container, remove it, and start the new one:
```bash
docker stop exploding-sats && docker rm exploding-sats
cd /mnt/raid1/GitHub/black-panther/apps-stack
docker compose up -d exploding-sats
```

## 5. Verify Score Service
Check that the score service started successfully:
```bash
docker logs exploding-sats --tail 5
```
Should show: "Score service listening on port 3002"

If it shows "GAME_NSEC environment variable is required", the `.env` file in apps-stack is missing the GAME_NSEC variable.

## 6. Verify Deployment
Check both local and production are responding:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004
curl -s -o /dev/null -w "%{http_code}" https://explodingsats.com
```
Both should return 200.

## 7. Check GitHub Actions
Remind the user to check GitHub Actions at: https://github.com/NiniMonk05/exploding-sats/actions

Report success or any failures encountered during deployment.
