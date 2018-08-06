/**
 * Helpers for varios tasks
 *
 */

// Dependencies
const crypto = require('crypto');
const https = require('https');
const config = require('./config');

// Container for all the helpers

const helpers = {};

// Create a SHA256 hash
helpers.hash = (str) => {
  if (typeof (str) === 'string' && str.length > 0) {
    const hash = crypto.createHmac('sha256', config.hashingSecret).update(str).digest('hex');
    return hash;
  }
  return false;
};

// Parse a JSON string to an object in all cases, without throwing
helpers.parseJsonToObject = (str) => {
  try {
    const obj = JSON.parse(str);
    return obj;
  } catch (err) {
    console.log(err);
    return {};
  }
};

// Trim the string and check if typeof of str equals typeOfString && checkLength is true
helpers.checkString = (str, typeOfString, checkLength) => {
  const trimmedStr = typeof (str) === 'string' ? str.trim() : str;
  return typeof (str) === typeOfString && checkLength(trimmedStr) ? str : false;
};

// Create a string of random alphanumeric characters, of a given length
helpers.createRandomString = (len) => {
  const strLength = typeof (len) === 'number' && len > 0 ? len : false;
  if (strLength) {
    // Define all the possible characters that could go into a string
    const possibleCharacters = 'abcdefghijklmnopqrstuvwxyz0123456789';

    // Start the final string
    let str = '';
    for (let i = 0; i < strLength; i += 1) {
      // Get a random character from the possibleCharacters string
      const randomCharacter = possibleCharacters.charAt(Math.floor(Math.random() * possibleCharacters.length));
      // Append this characters to the final string
      str += randomCharacter;
    }

    // Return the final string
    return str;
  }
  return false;
};


// Send an SMS message via Twilio
helpers.sendTwilioSms = (phoneVal, msgVal, callback) => {
  const phone = typeof (phoneVal) === 'string' && phoneVal.trim().length === 10 ? phoneVal.trim() : false;
  const msg = typeof (msgVal) === 'string' && msgVal.trim().length > 0 && msgVal.trim().length <= 1600 ? msgVal.trim() : false;

  if (phone && msg) {
    // Configure the request payload
    const payload = {
      From: config.twilio.fromPhone,
      To: `+1${phone}`,
      Body: msg,
    };
    // Stringify the payload
    const stringPayload = JSON.stringify(payload);
    // Configure the request details
    const requestDetails = {
      protocol: 'https:',
      hostname: 'api.twilio.com',
      method: 'post',
      path: `/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
      auth: `${config.twilio.accountSid}:${config.twilio.authToken}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(stringPayload),
      },
    };

    // Instantiate the request object
    const req = https.request(requestDetails, (res) => {
      // Grab the status of the sent request
      const status = res.statusCode;
      // Callback successfully if the request went through
      if (status === 200 || status === 201) {
        callback(false);
      } else {
        callback(`Status code returned was ${status}`);
      }
    });
    // Bind to the error event so it doesn't get thrown
    req.on('error', (e) => {
      callback(e);
    });

    // Add the payload
    req.write(stringPayload);

    // End the request
    req.end();
  } else {
    callback('Given parameters were missing or invalid');
  }
};


// Export the module
module.exports = helpers;
