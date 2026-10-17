// Node component tests exercise semantics; CSS is verified in the browser/build.
import { createRequire } from "node:module";

const testRequire = createRequire(`${process.cwd()}/package.json`);
testRequire.extensions[".css"] = (module) => {
  module.exports = new Proxy<Record<string, string>>(
    {},
    {
      get: (_target, key) => (key === "__esModule" ? false : String(key)),
    },
  );
};
