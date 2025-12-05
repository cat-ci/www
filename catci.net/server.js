const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const publicDir = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain',
};

const compressibleTypes = new Set([
  '.html', '.css', '.js', '.json', '.svg', '.txt'
]);

const fileCache = Object.create(null);

function generateETag(buffer) {
  return (
    '"' +
    crypto
      .createHash('sha1')
      .update(buffer)
      .digest('base64')
      .replace(/=+$/, '') +
    '"'
  );
}

function serveError(res, statusCode, defaultMessage = '') {
  const errorFile = path.join(publicDir, `${statusCode}.html`);
  fs.readFile(errorFile, (err, data) => {
    if (err) {
      res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
      res.end(defaultMessage || `${statusCode} Error`);
    } else {
      res.writeHead(statusCode, { 'Content-Type': 'text/html' });
      res.end(data);
    }
  });
}

function serveFile(filePath, ext, res, req, stats) {
  let cacheEntry = fileCache[filePath];
  if (
    cacheEntry &&
    cacheEntry.mtime.getTime() === stats.mtime.getTime() &&
    cacheEntry.size === stats.size
  ) {
    return sendCachedFile(cacheEntry, res, req, ext);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      serveError(res, 500, 'Internal Server Error');
      return;
    }
    const etag = generateETag(data);

    let cacheControl =
      ext === '.html'
        ? 'no-store'
        : 'public, max-age=31536000, immutable';

    const headers = {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Last-Modified': stats.mtime.toUTCString(),
      ETag: etag,
      'Cache-Control': cacheControl,
    };
    fileCache[filePath] = {
      data,
      etag,
      mtime: stats.mtime,
      size: stats.size,
      headers,
    };
    sendCachedFile(fileCache[filePath], res, req, ext);
  });
}

function sendCachedFile(cacheEntry, res, req, ext) {
  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];
  if (
    (ifNoneMatch && ifNoneMatch === cacheEntry.etag) ||
    (ifModifiedSince &&
      new Date(ifModifiedSince).getTime() >= cacheEntry.mtime.getTime())
  ) {
    res.writeHead(304, cacheEntry.headers);
    res.end();
    return;
  }

  const acceptEncoding = req.headers['accept-encoding'] || '';
  let stream = null;
  let encoding = null;

  if (compressibleTypes.has(ext)) {
    if (/\bbr\b/.test(acceptEncoding)) {
      encoding = 'br';
      stream = zlib.createBrotliCompress();
    } else if (/\bgzip\b/.test(acceptEncoding)) {
      encoding = 'gzip';
      stream = zlib.createGzip();
    }
  }

  const headers = { ...cacheEntry.headers };
  if (encoding) {
    headers['Content-Encoding'] = encoding;
    delete headers['Content-Length']; 
    headers['Vary'] = 'Accept-Encoding';
  }

  res.writeHead(200, headers);

  if (stream) {
    stream.pipe(res);
    stream.end(cacheEntry.data);
  } else {
    res.end(cacheEntry.data);
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/clearcache') {
    Object.keys(fileCache).forEach((key) => delete fileCache[key]);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Cache cleared');
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = path.join(publicDir, reqPath);

  if (!filePath.startsWith(publicDir)) {
    serveError(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      serveFile(filePath, ext, res, req, stats);
    } else if (!err && stats.isDirectory()) {
      serveError(res, 404, 'Not Found');
    } else {
      const htmlPath = path.join(publicDir, reqPath + '.html');
      fs.stat(htmlPath, (errHtml, statsHtml) => {
        if (!errHtml && statsHtml.isFile()) {
          serveFile(htmlPath, '.html', res, req, statsHtml);
        } else {
          serveError(res, 404, 'Not Found');
        }
      });
    }
  });
});

const PORT = 14000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});