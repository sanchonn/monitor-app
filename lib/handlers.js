/**
 * Request handlers
 *
 */

/* eslint no-underscore-dangle: 0, no-console: 0 */

// Dependencies
const _data = require('./data');
const helpers = require('./helpers');
const config = require('./config');


// Define the handlers
const handlers = {};

// Sample handler
handlers.sample = (data, callback) => {
  // Callback a http status codem and a payload object
  // 406 'Not Acceptable'
  callback(406, { name: 'sample handler' });
};

// Ping service handler
handlers.ping = (data, callback) => {
  // Service ping
  callback(200, { service: 'ping' });
};

// Users
handlers.users = (data, callback) => {
  const acceptableMethods = ['post', 'get', 'put', 'delete'];
  if (acceptableMethods.indexOf(data.method) > -1) {
    /* eslint no-underscore-dangle: ["error", { "allow": ["_users"] }] */
    handlers._users[data.method](data, callback);
  } else {
    callback(405);
  }
};

// Container for the users submethods
handlers._users = {};

// Users - post
// Required data: fistname, lastname, phone, password, tosAgreement
// Optional data: none
handlers._users.post = (data, callback) => {
  // Check that all required fields are filled out
  console.log('Data:', data.payload);
  const firstName = helpers.checkString(data.payload.firstName, 'string', str => str.length > 0);
  const lastName = helpers.checkString(data.payload.lastName, 'string', str => str.length > 0);
  const phone = helpers.checkString(data.payload.phone, 'string', str => str.length === 10);
  const password = helpers.checkString(data.payload.password, 'string', str => str.length > 0);
  const tosAgreement = helpers.checkString(data.payload.tosAgreement, 'boolean', str => str);

  if (firstName && lastName && phone && password && tosAgreement) {
    // Make sure that the user doesn't already exist
    _data.read('users', phone, (err, data) => {
      if (err) {
        // Hash the password
        const hashedPassword = helpers.hash(password);
        // Create the user object
        if (hashedPassword) {
          const userObject = {
            firstName,
            lastName,
            phone,
            hashedPassword,
            tosAgreement,
          };

          // Store the user
          _data.create('users', phone, userObject, (errCreate) => {
            if (!errCreate) {
              callback(200);
            } else {
              console.log(err);
              callback(500, { Error: 'Could not create the new user' });
            }
          });
        } else {
          callback(500, { Error: 'Could not hash the user password' });
        }
      } else {
        // User already exists
        callback(400, { Error: 'A user with that phone number already exists' });
      }
    });
  } else {
    callback(400, { Error: 'Missing required fields' });
  }
};

// Users - get
// Required data: phone
// Optional data: none
handlers._users.get = (data, callback) => {
  // Check that the phone number is valid
  const phone = helpers.checkString(data.queryStringObject.phone, 'string', str => str.length === 10);
  if (phone) {
    // Get the token from the headers
    const token = typeof (data.headers.token) === 'string' ? data.headers.token : false;
    // Verify that the given token is valid for the phone number
    handlers._tokens.verifyToken(token, phone, (tokenIsValid) => {
      if (tokenIsValid) {
        // Lookup the user
        _data.read('users', phone, (err, dataUser) => {
          if (!err && dataUser) {
            // Remove the hashed password from the user object before returning it to the requester
            delete dataUser.hashedPassword;
            callback(200, data);
          } else {
            callback(404);
          }
        });
      } else {
        callback(403, { Error: 'Missing required token in header, or token is invalid' });
      }
    });
  } else {
    callback(400, { Error: 'Missing required field' });
  }
};

// Users - put
// Required data: phone
// Optional data: firstName, lastName, password (at least one must be specified)
handlers._users.put = (data, callback) => {
  // Check for the required field
  console.log('data=', data);
  const phone = helpers.checkString(data.payload.phone, 'string', str => str.length === 10);
  console.log('phone=', phone);

  // Check for the optional fields
  const firstName = helpers.checkString(data.payload.firstName, 'string', str => str.length > 0);
  const lastName = helpers.checkString(data.payload.lastName, 'string', str => str.length > 0);
  const password = helpers.checkString(data.payload.password, 'string', str => str.length > 0);
  // Error if the phone is invalid
  if (phone) {
    // Error if nothing is sent to update
    if (firstName || lastName || password) {
      // Get the token from the headers
      const token = typeof (data.headers.token) === 'string' ? data.headers.token : false;
      // Verify that the given token is valid for the phone number
      handlers._tokens.verifyToken(token, phone, (tokenIsValid) => {
        if (tokenIsValid) {
          // Lookup the user
          _data.read('users', phone, (err, userData) => {
            if (!err && userData) {
              // Update the fields necessary
              // store new values in updatedUserData for clear function
              const updatedUserData = { ...userData };
              if (firstName) {
                updatedUserData.firstName = firstName;
              }
              if (lastName) {
                updatedUserData.lastName = lastName;
              }
              if (password) {
                updatedUserData.hashedPassword = helpers.hash(password);
              }
              // Store the new updates
              _data.update('users', phone, updatedUserData, (errUser) => {
                if (!errUser) {
                  callback(200);
                } else {
                  console.log(err);
                  callback(500, { Error: 'Could not update the user' });
                }
              });
            } else {
              callback(400, { Error: 'The specified user does not exist' });
            }
          });
        } else {
          callback(403, { Error: 'Missing required token in header, or token is invalid' });
        }
      });
    } else {
      callback(400, { Error: 'Missing fields to update' });
    }
  } else {
    callback(400, { Error: 'Missing required field' });
  }
};

// Users - delete
// Required field : phone
// @TODO Only let an authenticated user delete their object. Dont let them delete anyone else's
handlers._users.delete = (data, callback) => {
  // Check that phone number is valid
  const phone = helpers.checkString(data.queryStringObject.phone, 'string', str => str.length === 10);
  if (phone) {
    // Get the token from the headers
    const token = typeof (data.headers.token) === 'string' ? data.headers.token : false;
    // Verify that the given token is valid for the phone number
    handlers._tokens.verifyToken(token, phone, (tokenIsValid) => {
      if (tokenIsValid) {
        // Lookup the user
        _data.read('users', phone, (err, userData) => {
          if (!err && userData) {
            _data.delete('users', phone, (err) => {
              if (!err) {
                // Delete each of the check associated with the user
                const userChecks = typeof (userData.checks) === 'object' && userData.checks instanceof (Array) ? userData.checks : [];
                const checksToDelete = userChecks.length;
                if (checksToDelete > 0) {
                  let checksDeleted = 0;
                  let deletionError = false;
                  // Loop through the checks
                  userChecks.forEach((checkId) => {
                    // Delete the check with checkId
                    _data.delete('checks', checkId, (errCheck) => {
                      if (errCheck) {
                        deletionError = true;
                      }
                      checksDeleted += 1;
                      if (checksDeleted === checksToDelete) {
                        if (!deletionError) {
                          callback(200);
                        } else {
                          callback(500, { Error: 'Errors encountered while attempting to delete all of the user\'s checks. All checks may not have deleted from the system successfully' })
                        }
                      }
                    });
                  });
                } else {
                  callback(200);
                }
              } else {
                callback(500, { Error: 'Could not delete the specified user' });
              }
            });
          } else {
            callback(400, { Error: 'Could not find the specified user' });
          }
        });

      } else {
        callback(403, { Error: 'Missing required token in header, or token is invalid' });
      }
    });
  } else {
    callback(400, { Error: 'Missing required field' });
  }
};

// Tokens
handlers.tokens = (data, callback) => {
  const acceptableMethods = ['post', 'get', 'put', 'delete'];
  if (acceptableMethods.indexOf(data.method) > -1) {
    handlers._tokens[data.method](data, callback);
  } else {
    callback(405);
  }
};

// Container for the tokens submethods
handlers._tokens = {};

// Tokens - post
// Required data : phone, password
// Optional data : none
handlers._tokens.post = (data, callback) => {
  const phone = helpers.checkString(data.payload.phone, 'string', str => str.length === 10);
  const password = helpers.checkString(data.payload.password, 'string', str => str.length > 0);
  if (phone && password) {
    // Lookup the user who mathes that phone number
    _data.read('users', phone, (err, userData) => {
      if (!err && userData) {
        // Hash the sent password, and compare it to the password stored in the user object
        const hashedPassword = helpers.hash(password);

        if (hashedPassword === userData.hashedPassword) {
          // If valid, create a new token with a random name. 
          // Set expiration date 1 hour in the future
          const tokenId = helpers.createRandomString(20);
          const expires = Date.now() + 1000 * 60 * 60;
          const tokenObject = {
            phone,
            expires,
            id: tokenId,
          };

          // Store the token
          _data.create('tokens', tokenId, tokenObject, (err) => {
            if (!err) {
              callback(200, tokenObject);
            } else {
              callback(500, { Error: 'Could not create the new token' });
            }
          });
        } else {
          callback(400, { Error: 'Password did not match the specified user\'s stored password' });
        }
      } else {
        callback(400, { Error: 'Could not find the specified user' });
      }
    });
  } else {
    callback(400, { Error: 'Missing required field' });
  }
};

// Tokens - get
// Required data : id
// Optional data : none
handlers._tokens.get = (data, callback) => {
  // Check that the id is valid
  const id = helpers.checkString(data.queryStringObject.id, 'string', str => str.length === 20);
  if (id) {
    // Lookup the token
    _data.read('tokens', id, (err, tokenData) => {
      if (!err && tokenData) {
        callback(200, tokenData);
      } else {
        callback(404);
      }
    });
  } else {
    callback(400, { Error: 'Missing required field' });
  }
};

// Tokens - put
// Required fields : id, extend
// Optional data : none


handlers._tokens.put = (data, callback) => {
  const id = helpers.checkString(data.payload.id, 'string', str => str.length === 20);
  const extend = helpers.checkString(data.payload.extend, 'boolean', str => str);

  if (id && extend) {
    // Lookup token
    _data.read('tokens', id, (err, tokenData) => {
      if (!err && tokenData) {
        // Check to the make sure the token isn't already expired
        if (tokenData.expires > Date.now()) {
          // Set the experation an hour from now
          tokenData.expires = Date.now() + 1000 * 60 * 60;

          // Store the new updates
          _data.update('tokens', id, tokenData, (err) => {
            if (!err) {
              callback(200);
            } else {
              callback(500, { Error: 'Could not update token\'s experataion' });
            }
          });


        } else {
          callback(400, { Error: 'The token has already expired, and cannot be extended' });
        }

      } else {
        callback(400, { Error: 'Specified token does not exit' });
      }
    });

  } else {
    callback(400, { Error: 'Missing required field(s) or field(s) are invalid' });
  }
};

// Tokens - delete
// Required field : id
// Optional field : none
handlers._tokens.delete = (data, callback) => {
  // Check that the id is valid
  const id = helpers.checkString(data.queryStringObject.id, 'string', str => str.length === 20);
  if (id) {
    // Lookup the token
    _data.read('tokens', id, (err, data) => {
      if (!err && data) {
        _data.delete('tokens', id, (err) => {
          if (!err) {
            callback(200);
          } else {
            callback(500, { Error: 'Could not delete the specified token' });
          }
        });
      } else {
        callback(400, { Error: 'Could not find the specified token' });
      }
    });
  } else {
    callback(400, { Error: 'Missing required field' });
  }

};

// Verify if a given token id is currently valid for a given user
handlers._tokens.verifyToken = (id, phone, callback) => {
  // Lookup the token
  _data.read('tokens', id, (err, tokenData) => {
    if (!err && tokenData) {
      // Check that the token is for the given user and has not expired
      if (tokenData.phone === phone && tokenData.expires > Date.now()) {
        callback(true);
      } else {
        callback(false);
      }
    } else {
      callback(false);
    }
  });
};

// Checks
handlers.checks = (data, callback) => {
  const acceptableMethods = ['post', 'get', 'put', 'delete'];
  if (acceptableMethods.indexOf(data.method) > -1) {
    handlers._checks[data.method](data, callback);
  } else {
    callback(405);
  }
};

// Container for all the checks methods
handlers._checks = {};

// Checks - post
// Required data : protocol, url, method, successCodes, timeoutSeconds
// Optional data : none
handlers._checks.post = (data, callback) => {
  // Validate inputs    
  const protocol = helpers.checkString(data.payload.protocol, 'string', str => ['http', 'https'].indexOf(str) > -1);
  const url = helpers.checkString(data.payload.url, 'string', str => str.length > 0);
  const method = helpers.checkString(data.payload.method, 'string', str => ['get', 'post', 'put', 'delete'].indexOf(str) > -1);
  const successCodes = helpers.checkString(data.payload.successCodes, 'object', str => str instanceof (Array) && str.length > 0);
  const timeoutSeconds = helpers.checkString(data.payload.timeoutSeconds, 'number', str => str % 1 === 0 && str >= 1 && str <= 5);

  if (protocol && url && method && successCodes && timeoutSeconds) {
    // Get the token from the header
    const token = helpers.checkString(data.headers.token, 'string', str => str.length === 20);

    // Lookup the user by reading the token
    _data.read('tokens', token, (err, tokenData) => {
      if (!err && tokenData) {
        const userPhone = tokenData.phone;

        // Lookup the user data
        _data.read('users', userPhone, (err, userData) => {
          if (!err && userData) {
            const userChecks = typeof (userData.checks) === 'object' && userData.checks instanceof (Array) ? userData.checks : [];
            // Verify that the user has less than the number of max-checks-per-user
            if (userChecks.length < config.maxChecks) {
              // Create a ranodm id for the checks
              const checkId = helpers.createRandomString(20);

              // Create the check object, and include the users's phone
              const checkObject = {
                userPhone,
                protocol,
                url,
                method,
                successCodes,
                timeoutSeconds,
                id: checkId
              };

              // Save the object
              _data.create('checks', checkId, checkObject, (err) => {
                if (!err) {
                  // Add the check id to the user's object
                  userData.checks = userChecks;
                  userData.checks.push(checkId);

                  // Save the new user data
                  _data.update('users', userPhone, userData, (err) => {
                    if (!err) {
                      // Return the data about the new check
                      callback(200, checkObject);

                    } else {
                      callback(500, { Error: 'Could not update the user with new check' });
                    }
                  });

                } else {
                  callback(500, { Error: 'Could not create the new check' });
                }
              });

            } else {
              callback(400, { Error: `'User already has maximum number of checks (${config.maxChecks})` });
            }
          } else {
            callback(403);
          }
        });

      } else {
        callback(403);
      }
    });


  } else {
    callback(400, { Error: 'Missing required inputs, or inputs are invalid' });
  }
};

// Checks - get
// Required field : id
// Optional field : none
handlers._checks.get = (data, callback) => {
  // Check that the id is valid
  const id = helpers.checkString(data.queryStringObject.id, 'string', str => str.length === 20);
  if (id) {
    // Lookup the check
    _data.read('checks', id, (err, checkData) => {
      if (!err && checkData) {
        // Get the token from the headers
        const token = typeof (data.headers.token) === 'string' ? data.headers.token : false;
        // Verify that the given token is valid and belongs to the user who created the check
        handlers._tokens.verifyToken(token, checkData.userPhone, (tokenIsValid) => {
          if (tokenIsValid) {
            // Return the check data
            callback(200, checkData);
          } else {
            callback(403);
          }
        });
      } else {
        callback(404);
      }
    });
  } else {
    callback(400, { Error: 'Missing required field' });
  }
};

// Checks - put
// Required data : id
// Optional data : protocol, url, method, successCodes, timeoutSeconds [one must be sent]
handlers._checks.put = (data, callback) => {
  const id = helpers.checkString(data.payload.id, 'string', str => str.length === 20);

  // Check for the optinals fields
  const protocol = helpers.checkString(data.payload.protocol, 'string', str => ['http', 'https'].indexOf(str) > -1);
  const url = helpers.checkString(data.payload.url, 'string', str => str.length > 0);
  const method = helpers.checkString(data.payload.method, 'string', str => ['get', 'post', 'put', 'delete'].indexOf(str) > -1);
  const successCodes = helpers.checkString(data.payload.successCodes, 'object', str => str instanceof (Array) && str.length > 0);
  const timeoutSeconds = helpers.checkString(data.payload.timeoutSeconds, 'number', str => str % 1 === 0 && str >= 1 && str <= 5);

  // Check the id is valid
  if (id) {
    if (protocol || url || method || successCodes || timeoutSeconds) {
      _data.read('checks', id, (err, checkData) => {
        if (!err && checkData) {
          // Get the token from the headers
          const token = typeof (data.headers.token) === 'string' ? data.headers.token : false;
          // Verify that the given token is valid and belongs to the user who created the check
          handlers._tokens.verifyToken(token, checkData.userPhone, (tokenIsValid) => {
            if (tokenIsValid) {
              // Update the check where neccessary
              const updatedCheckData = { ...checkData };
              if (protocol) {
                updatedCheckData.protocol = protocol;
              }
              if (url) {
                updatedCheckData.url = url;
              }
              if (method) {
                updatedCheckData.method = method;
              }
              if (successCodes) {
                updatedCheckData.successCodes = successCodes;
              }
              if (timeoutSeconds) {
                updatedCheckData.timeoutSeconds = timeoutSeconds;
              }

              // Store the new updates
              _data.update('checks', id, updatedCheckData, (err) => {
                if (!err) {
                  callback(200);
                } else {
                  callback(500, { Error: 'Could not update the check' });
                }
              });
            } else {
              callback(403);
            }
          });

        } else {
          callback(400, { Error: 'Check id did not exist' });
        }
      });

    } else {
      callback(400, { Error: 'Missing field to update' });
    }
  } else {
    callback(400, { Error: 'Missing required field' });
  }
};

// Checks - delete
// Required field : id
// Optional field : none
/**
 * 1. Get check id from queryString
 * 2. Read data from check with id
 * 3. Get tokem from header
 * 4. Verify if token phone equals check phone
 * 5. Delete the check with the id
 * 6. Remove check with the id from user list
 * 
 */


handlers._checks.delete = (data, callback) => {
  const id = helpers.checkString(data.queryStringObject.id, 'string', str => str.length === 20);
  if (id) {
    // Lookup the check
    _data.read('checks', id, (err, checkData) => {
      if (!err && checkData) {
        // Get the token from the headers
        const token = typeof (data.headers.token) === 'string' ? data.headers.token : false;
        // Verify that the given token is valid for the phone number
        handlers._tokens.verifyToken(token, checkData.userPhone, (tokenIsValid) => {
          if (tokenIsValid) {
            // Delete the check data
            _data.delete('checks', id, (err) => {
              if (!err) {
                // Lookup the check
                _data.read('users', checkData.userPhone, (err, userData) => {
                  if (!err && checkData) {
                    const userChecks = typeof (userData.checks) === 'object' && userData.checks instanceof (Array) ? userData.checks : [];

                    // Remove the deleted check from their list of checks
                    const checkPosition = userChecks.indexOf(id);
                    if (checkPosition > -1) {
                      userChecks.splice(checkPosition, 1);
                      // Re-save the users's dat
                      _data.update('users', checkData.userPhone, userData, (err) => {
                        if (!err) {
                          callback(200);
                        } else {
                          callback(500, { Error: 'Could not update the user' });
                        }
                      });
                    } else {
                      callback(500, { Error: 'Could not find the check on the users object, so could not remove it' });
                    }
                  } else {
                    callback(400, { Error: 'The specified check ID does not exist' });
                  }
                });
              } else {
                callback(500, { Error: 'Could not delete the check data' });
              }
            });
          } else {
            callback(403);
          }
        });

      } else {
        callback(403, { Error: 'Missing required token in the header, or token is invalid' });
      }
    });

  } else {
    callback(400, { Error: 'The specified check ID does not exist' });
  }
};

// Not found handler
handlers.notFound = (data, callback) => {
  // 404 'Not Found' status code
  callback(404);
};

//Export the module
module.exports = handlers;