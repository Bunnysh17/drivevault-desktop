exports.default = async function customSign(configuration) {
  // Custom sign hook that skips signtool to avoid hanging on machines without certificates
  return Promise.resolve();
};
