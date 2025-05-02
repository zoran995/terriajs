#!/bin/sh

set -e

GITHUB_BRANCH=${GITHUB_REF##*/}

# Don't run for greenkeeper branches; there are too many!
if [[ $GITHUB_BRANCH =~ ^greenkeeper/ ]]; then
  exit 0
fi

# A version of the branch name that can be used as a DNS name once we prepend and append some stuff.
SAFE_BRANCH_NAME=$(printf '%s' "${GITHUB_BRANCH:0:32}" | sed -e 's/./\L&/g' -e 's/[^-a-z0-9]/-/g' -e 's/-*$//')

[[ $SAFE_BRANCH_NAME != $GITHUB_BRANCH ]] && echo "::warning file=buildprocess/ci-deploy.sh::Branch name sanitised to '${SAFE_BRANCH_NAME}' for kubernetes resources. This may work, however using branch names less than 32 characters long with [a-z0-9] and hyphen separators are preferred"

# Install some tools we need from npm
# npm install -g https://github.com/terriajs/sync-dependencies
npm install -g yarn@^1.19.0
npm install -g yalc

# Clone and build TerriaMap, using this version of TerriaJS
TERRIAJS_COMMIT_HASH=$(git rev-parse HEAD)
TERRIAJS_VERSION=$(cat package.json | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[\",]//g' | tr -d '[[:space:]]')
sed -i -e 's@"version": ".*"@"version": "'$TERRIAJS_VERSION-$SAFE_BRANCH_NAME'"@g' package.json
yarn install
yarn gulp build
yalc publish --scripts=false

git clone -b test-build https://github.com/TerriaJS/TerriaMap.git
cd TerriaMap
TERRIAMAP_COMMIT_HASH=$(git rev-parse HEAD)
yalc add terriajs
# sync-dependencies --source terriajs --from .yalc/terriajs/package.json

git config --global user.email "info@terria.io"
git config --global user.name "GitHub Actions"
git commit -a -m 'temporary commit' # so the version doesn't indicate local modifications
git tag -a "TerriaMap-$TERRIAMAP_COMMIT_HASH--TerriaJS-$TERRIAJS_COMMIT_HASH" -m 'temporary tag'gi
yarn install
yarn gulp build --baseHref="/${SAFE_BRANCH_NAME}/"

