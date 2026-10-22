let handlerPromise;

module.exports = async function handler(request, response) {
  handlerPromise ||= import("../dist/serverless/index.mjs");
  const { default: bundledHandler } = await handlerPromise;
  await bundledHandler(request, response);
};
