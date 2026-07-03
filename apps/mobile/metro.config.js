// Metro config for the Stackr Wallet Expo app inside the pnpm monorepo.
// Lets Metro resolve the workspace packages (@stackr/*) and the deps hoisted
// to the repo-root node_modules. See:
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The workspace packages (@stackr/*) and Tamagui expose their entry points via
// the package.json "exports" field rather than a legacy "main", so Metro must
// resolve via package exports.
config.resolver.unstable_enablePackageExports = true;

// A few transitive deps of the auth stack publish "exports" maps that break
// under Metro's package-exports resolution (they resolve to browser/node
// builds with no react-native condition). Resolve just those by legacy "main".
const legacyMainPackages = new Set(['isows', 'zustand', 'jose']);
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const packageName = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];
  if (legacyMainPackages.has(packageName)) {
    return context.resolveRequest(
      { ...context, unstable_enablePackageExports: false },
      moduleName,
      platform,
    );
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
