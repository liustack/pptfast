export { installNodePlatform } from "./platform/node"
export { installPlatform, type PptfastPlatform } from "./platform/registry"
// Internal consumer surface (no semver promise — the SDK is sealed): the DSH
// plugin layer (dsh/index.js) renders IR handed to it as a JSON object, so it
// needs the CLI's local-asset resolution step without spawning the CLI.
export { resolveLocalAssets } from "./cli/load-ir"
