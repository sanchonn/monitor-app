/**
 * Worker-related tasks
 *
 * 1. Read all checks from 'checks'
 * 2. For each check - validateCheckData (check if all params are correct)
 * 3. Perform check - check if available domain and make new checkOutcome
 * 4. processCheckOutcome - update check with new checkOutcome status
 */

/* eslint no-underscore-dangle: 0, no-console: 0 */

// Dependencies
const http = require('http');
const https = require('https');
const url = require('url');
const util = require('util');
const helpers = require('./helpers');
const _data = require('./data');
const _logs = require('./logs');

// Debug log for workers
const debug = util.debuglog('workers');

// Instantiate the workers object
const workers = {};

// Lookup all the checks, get their data, send to a validator
workers.gatherAllChecks = () => {
  // Get all the checks
  _data.list('checks', (err, checks) => {
    if (!err && checks && checks.length > 0) {
      checks.forEach((check) => {
        // Read in the check data
        _data.read('checks', check, (errCheck, originalCheckData) => {
          if (!errCheck && originalCheckData) {
            // Pass it to the check validator, and let that function continue or log error as needed
            workers.validateCheckData(originalCheckData);
          } else {
            debug('Error: could not read one of the check\'s data');
          }
        });
      });
    } else {
      debug('Error: could not find any checks to process');
    }
  });
};


// Sanity-check the check data
workers.validateCheckData = (checkData) => {
  const originalCheckData = typeof (checkData) === 'object' && checkData !== null ? checkData : {};
  originalCheckData.id = typeof (checkData.id) === 'string' && checkData.id.trim().length === 20 ? checkData.id.trim() : false;
  originalCheckData.userPhone = typeof (checkData.userPhone) === 'string' && checkData.userPhone.trim().length === 10 ? checkData.userPhone.trim() : false;
  originalCheckData.protocol = typeof (checkData.protocol) === 'string' && ['http', 'https'].indexOf(checkData.protocol) > -1 ? checkData.protocol : false;
  originalCheckData.url = typeof (checkData.url) === 'string' && checkData.url.trim().length > 0 ? checkData.url.trim() : false;
  originalCheckData.method = typeof (checkData.method) === 'string' && ['get', 'post', 'put', 'delete'].indexOf(checkData.method) > -1 ? checkData.method : false;
  originalCheckData.successCodes = typeof (checkData.successCodes) === 'object' && checkData.successCodes instanceof (Array) && checkData.successCodes.length > 0 ? originalCheckData.successCodes : false;
  originalCheckData.timeoutSeconds = typeof (checkData.timeoutSeconds) === 'number' && checkData.timeoutSeconds % 1 === 0 && checkData.timeoutSeconds >= 1 && originalCheckData.timeoutSeconds <= 5 ? originalCheckData.timeoutSeconds : false;

  // Set the keys that that may not be set (if the workers have never seen this check before)
  originalCheckData.state = typeof (originalCheckData.state) === 'string' && ['up', 'down'].indexOf(originalCheckData.state) > -1 ? originalCheckData.state : 'down';
  originalCheckData.lastChecked = typeof (originalCheckData.lastChecked) === 'number' && originalCheckData.lastChecked > 0 ? originalCheckData.lastChecked : false;

  // If all the checks pass, pass the data along to the next step in the process
  if (
    originalCheckData.id
    && originalCheckData.userPhone
    && originalCheckData.protocol
    && originalCheckData.url
    && originalCheckData.method
    && originalCheckData.successCodes
    && originalCheckData.timeoutSeconds
  ) {
    workers.performCheck(originalCheckData);
  } else {
    debug('Error: one of the checks is not properly formatted. Skipping it');
  }
};

// Perform the check, send the originalCheckData and the outcome of the check process,
// to the next step in the process
workers.performCheck = (originalCheckData) => {
  // Prepare the initial state outcome
  const checkOutcome = {
    error: false,
    responseCode: false,
  };

  // Mark that outcome has not be sent yet
  let outcomeSent = false;

  // Parse the hostname and the path out of the original check data
  const parsedUrl = url.parse(`${originalCheckData.protocol}://${originalCheckData.url}`, true);
  // Using path and not 'pathname' becouse we want the query string
  const { hostname, path } = parsedUrl;

  // Construct the request
  const requestDetails = {
    hostname,
    path,
    protocol: `${originalCheckData.protocol}:`,
    method: originalCheckData.method.toUpperCase(),
    timeout: originalCheckData.timeoutSeconds * 1000,
  };

  // Instantiate the request object (neither using http or https module)
  const _moduleToUse = originalCheckData.protocol === 'http' ? http : https;
  const req = _moduleToUse.request(requestDetails, (res) => {
    // Grab the status of the sent request
    const status = res.statusCode;
    // Update the checkoutcome and pass the date along
    checkOutcome.responseCode = status;
    if (!outcomeSent) {
      workers.processCheckOutcome(originalCheckData, checkOutcome);
      outcomeSent = true;
    }
  });

  // Bind to the error event so it doesn't get thrown
  req.on('error', (err) => {
    // Update the checkoutcome and pass the date along
    checkOutcome.error = {
      error: true,
      value: err,
    };
    if (!outcomeSent) {
      workers.processCheckOutcome(originalCheckData, checkOutcome);
      outcomeSent = true;
    }
  });

  // Bind to the timeout event
  req.on('timeout', (err) => {
    // Update the checkoutcome and pass the date along
    checkOutcome.error = {
      error: true,
      value: 'timeout',
    };
    if (!outcomeSent) {
      workers.processCheckOutcome(originalCheckData, checkOutcome);
      outcomeSent = true;
    }
  });

  // End the request
  req.end();
};


// Process the check outcome, update the check data as needed, trigger an alert if needed
// Special logic for accomodating a check that has never been tested before
// (don't alert on that one)
workers.processCheckOutcome = (originalCheckData, checkOutcome) => {
  // Decide if the check is considered up or down
  const state = !checkOutcome.error && checkOutcome.responseCode && originalCheckData.successCodes.indexOf(checkOutcome.responseCode) > -1 ? 'up' : 'down';
  // Decide if an alert is warranted
  const alertWarranted = originalCheckData.lastChecked && originalCheckData.state !== state;

  // Log the outcome
  const timeOfCheck = Date.now();
  workers.log(originalCheckData, checkOutcome, state, alertWarranted, timeOfCheck);

  // Update the check data
  const newCheckData = originalCheckData;
  newCheckData.state = state;
  newCheckData.lastChecked = timeOfCheck;

  // Save the updates
  _data.update('checks', newCheckData.id, newCheckData, (err) => {
    if (!err) {
      // Send the new check data to the next phase in the process if needed
      if (alertWarranted) {
        workers.alertUserToStatusChange(newCheckData);
      } else {
        debug('Check outcome has not changed, no alert needed');
      }
    } else {
      debug('Error: trying to save update to one of the checks');
    }
  });
};

// Alert the user as to a change in their check status
workers.alertUserToStatusChange = (newCheckData) => {
  const msg = `Alert: Your check for ${newCheckData.method.toUpperCase()} ${newCheckData.protocol}://${newCheckData.url} is currently ${newCheckData.state}`;
  helpers.sendTwilioSms(newCheckData.userPhone, msg, (err) => {
    if (!err) {
      debug('Success: User was alerted to a change status change in their check, via sms');
    } else {
      debug('Error: Could not send sms alert to user who had a state change in their check');
    }
  });
};

// Log to the file
workers.log = (originalCheckData, checkOutcome, state, alertWarranted, timeOfCheck) => {
  // Form the log data
  const logData = {
    state,
    check: originalCheckData,
    outcome: checkOutcome,
    alert: alertWarranted,
    time: timeOfCheck,
  };
  // Convert data to a string
  const logString = JSON.stringify(logData);

  // Determine the name of the lof file
  const logFileName = originalCheckData.id;

  // Append the log string to the log file
  _logs.append(logFileName, logString, (err) => {
    if (!err) {
      debug('Logging to file succeeded');
    } else {
      debug('Logging to file failed');
    }
  });
};

// Timer to execute the worker-process once per minute
workers.loop = () => {
  setInterval(() => {
    workers.gatherAllChecks();
  }, 1000 * 5);
};

// Rotate (compress) the log files
workers.rotateLogs = () => {
  // List all the (non compressed) log files
  _logs.list(false, (err, logs) => {
    if (!err && logs && logs.length > 0) {
      logs.forEach((logName) => {
        // Compress the date to a different file
        debug(logName);
        const logId = logName.replace('.log', '');
        const newFileId = `${logId}-${Date.now()}`;
        _logs.compress(logId, newFileId, (errCompress) => {
          if (!errCompress) {
            // Truncate the log
            _logs.truncate(logId, (errTruncate) => {
              if (!errTruncate) {
                debug('Success truncating logFile');
              } else {
                debug('Error truncating logFile');
              }
            });
          } else {
            debug('Error compressing one of the log files', errCompress);
          }
        });
      });
    } else {
      debug('Error: could not find any logs to rotate');
    }
  });
};

// Timer to execute the log-rotation process once per day
workers.logRotationLoop = () => {
  setInterval(() => {
    workers.rotateLogs();
  }, 1000 * 60 * 60 * 24);
};

// Init scripts
workers.init = () => {
  // Send to console, in yellow
  debug('\x1b[33m%s\x1b[0m', 'Background workers are running');

  // Execute all the checks immediately
  workers.gatherAllChecks();

  // Call the loop so the checks will execute later on
  workers.loop();

  // Compress all the logs immediately
  workers.rotateLogs();

  // Call the compression loop so logs will be compressed later on
  workers.logRotationLoop();
};

// Export the module
module.exports = workers;
