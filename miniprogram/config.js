// Set this to true only in the WeChat developer tool for a local backend run.
const USE_LOCAL_BACKEND = false;
const LOCAL_BACKEND_URL = 'http://127.0.0.1:3000';
const PRODUCTION_BACKEND_URL = 'https://xuediner.xyz';

module.exports = {
  backendUrl: USE_LOCAL_BACKEND ? LOCAL_BACKEND_URL : PRODUCTION_BACKEND_URL,
};
