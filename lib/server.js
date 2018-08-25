/**
 * Server-related tasks
 */

// Dependencies
const http = require('http');
const https = require('https');
const url = require('url');
const { StringDecoder } = require('string_decoder');
const path = require('path');
const fs = require('fs');
const util = require('util');
const config = require('./config');
const _data = require('./data');
const handlers = require('./handlers');
const helpers = require('./helpers');

// Debug log for server
const debug = util.debuglog('server');

// @TODO GET RID OF THIS
// helpers.sendTwilioSms('4151234567', 'Hello', (err) => {
//    console.log('this was the error', err);
// });

// Instantiate the server module object
const server = {};

// Instantiate the HTTP server
server.httpServer = http.createServer((req, res) => {
  server.unifiedServer(req, res);
});


// Instantiate the HTTPS server
server.httpsServerOptions = {
  key: fs.readFileSync(path.join(__dirname, '/../https/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '/../https/cert.pem')),
};

server.httpsServer = https.createServer(server.httpsServerOptions, (req, res) => {
  server.unifiedServer(req, res);
});

// All the service logic for both the http and https server
server.unifiedServer = (req, res) => {
  // Get the URL and parse it
  const parsedUrl = url.parse(req.url, true);
  // Get the path
  const { pathname } = parsedUrl;
  const trimmedPath = pathname.replace(/^\/+|\/+$/g, '');

  // Get the query string as an object
  const queryStringObject = parsedUrl.query;

  // Get the HTTP Method
  const method = req.method.toLowerCase();

  // Get the Headers as an object
  const { headers } = req;

  // Get the payload, if any
  const decoder = new StringDecoder('utf-8');
  let buffer = '';
  req.on('data', (data) => {
    buffer += decoder.write(data);
  });

  req.on('end', () => {
    buffer += decoder.end();

    // Choose the handler this request should go to. If one is not found return notFound handler
    let chosenHandler = typeof (server.router[trimmedPath]) !== 'undefined' ? server.router[trimmedPath] : handlers.notFound;

    // If the request is within the public directory, use the public handler instead
    chosenHandler = trimmedPath.indexOf('public/') > -1 ? handlers.public : chosenHandler;

    // Construct the data object to send to the handler
    const data = {
      trimmedPath,
      queryStringObject,
      method,
      headers,
      payload: helpers.parseJsonToObject(buffer),
    };

    // Route the request to the handler specified in the router
    chosenHandler(data, (statusCode, payload, contentType) => {
      // Determine the type of response (fallback to JSON)
      contentType = typeof (contentType) === 'string' ? contentType : 'json';

      // Use the status code called back by the handler, or default to 200
      statusCode = typeof (statusCode) === 'number' ? statusCode : 200;
      if (statusCode === 200) {
        debug('\x1b[32m%s\x1b[0m', `${method}:${trimmedPath}`);
      } else {
        debug('\x1b[31m%s\x1b[0m', `${method}:${trimmedPath}`);
      }
      // Return the response-parts that are content-specific
      let payloadString = '';
      if (contentType === 'json') {
        res.setHeader('Content-Type', 'application/json');
        // Use the payload called back by the handle, or default to {}
        payload = typeof (payload) === 'object' ? payload : {};
        // Convert the payload to a string
        payloadString = JSON.stringify(payload);
      }
      if (contentType === 'html') {
        res.setHeader('Content-Type', 'text/html');
        payloadString = typeof (payload) === 'string' ? payload : '';
      }
      if (contentType === 'favicon') {
        res.setHeader('Content-Type', 'image/x-icon');
        payloadString = typeof (payload) !== 'undefined' ? payload : '';
      }
      if (contentType === 'css') {
        res.setHeader('Content-Type', 'text/css');
        payloadString = typeof (payload) !== 'undefined' ? payload : '';
      }
      if (contentType === 'png') {
        res.setHeader('Content-Type', 'image/png');
        payloadString = typeof (payload) !== 'undefined' ? payload : '';
      }
      if (contentType === 'jpg') {
        res.setHeader('Content-Type', 'image/jpg');
        payloadString = typeof (payload) !== 'undefined' ? payload : '';
      }
      if (contentType === 'js') {
        res.setHeader('Content-Type', 'text/javascript');
        payloadString = typeof (payload) !== 'undefined' ? payload : '';
      }
      if (contentType === 'plain') {
        res.setHeader('Content-Type', 'text/plain');
        payloadString = typeof (payload) !== 'undefined' ? payload : '';
      }

      // Return the response-parts that are common to all content-types
      res.writeHead(statusCode);
      res.end(payloadString);
    });
  });
};

// Define a request router
server.router = {
  sample: handlers.sample,
  ping: handlers.ping,
  '': handlers.index,
  'account/create': handlers.accountCreate,
  'account/edit': handlers.accountEdit,
  'account/deleted': handlers.accountDeleted,
  'session/create': handlers.sessionCreate,
  'session/deleted': handlers.sessionDeleted,
  'checks/all': handlers.checksList,
  'checks/create': handlers.checksCreate,
  'checks/edit': handlers.checksEdit,
  'api/users': handlers.users,
  'api/tokens': handlers.tokens,
  'api/checks': handlers.checks,
  'favicon.ico': handlers.favicon,
  public: handlers.public,
};

// Init script
server.init = () => {
  // Start http server
  server.httpServer.listen(config.httpPort, () => {
    console.log('\x1b[36m%s\x1b[0m', `The server is listening on port ${config.httpPort} in ${config.envName} mode`);
  });

  // Start https server
  server.httpsServer.listen(config.httpsPort, () => {
    console.log('\x1b[35m%s\x1b[0m', `The https server is listening on port ${config.httpsPort} in ${config.envName} mode`);
  });
};

// Export the module
module.exports = server;
