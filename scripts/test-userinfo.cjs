// Windows sandbox may deny uv_os_get_passwd; tsx only needs a temporary-directory identifier.
const os = require('node:os');
const original = os.userInfo;
os.userInfo = function(options) {
  try { return original.call(os, options); }
  catch (e) {
    if (e.code !== 'ERR_SYSTEM_ERROR') throw e;
    return { uid: -1, gid: -1, username: 'kairos-test', homedir: process.cwd(), shell: null };
  }
};
require('node:module').syncBuiltinESMExports();
