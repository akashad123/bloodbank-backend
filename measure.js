const http = require('http');

const measure = (options, postData) => {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const end = performance.now();
        resolve({
          timeMs: (end - start).toFixed(2),
          status: res.statusCode,
          data: JSON.parse(data || '{}')
        });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
};

(async () => {
  console.log('--- WARMING UP ---');
  await measure({
    hostname: 'localhost',
    port: 5000,
    path: '/',
    method: 'GET'
  });

  console.log('--- TEST 1: Login ---');
  const postData = JSON.stringify({ phone: '9999999999' }); // Assume dummy phone doesn't exist, will get 404, but we measure execution
  const res1 = await measure({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);
  console.log('Login time:', res1.timeMs, 'ms (Status:', res1.status, ')');
  
  // Test B: repeat
  const res1b = await measure({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, postData);
  console.log('Login (repeat) time:', res1b.timeMs, 'ms (Status:', res1b.status, ')');
  
})();
