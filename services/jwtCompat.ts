// jsonwebtoken's transitive jwa dependency still references SlowBuffer on
// bleeding-edge Node versions where that legacy alias was removed.
const bufferModule = require('node:buffer');
if (!bufferModule.SlowBuffer) bufferModule.SlowBuffer = bufferModule.Buffer;

export = require('jsonwebtoken');
