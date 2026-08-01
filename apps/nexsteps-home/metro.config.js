const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.extraNodeModules = {
  "@expo/metro-runtime": path.resolve(
    projectRoot,
    "node_modules/@expo/metro-runtime",
  ),
  react: path.resolve(projectRoot, "node_modules/react"),
  "react/jsx-runtime": path.resolve(
    projectRoot,
    "node_modules/react/jsx-runtime.js",
  ),
  "react/jsx-dev-runtime": path.resolve(
    projectRoot,
    "node_modules/react/jsx-dev-runtime.js",
  ),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};
config.transformer.babelTransformerPath = require.resolve(
  "react-native-svg-transformer/expo",
);
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = config;
