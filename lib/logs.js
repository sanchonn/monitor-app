/**
 * Library for storing and rotating logs
 *
 */

// Dependecies
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Container for the module
const lib = {};

// Base directory of the logs folder
lib.baseDir = path.join(__dirname, '../.logs/');

// Append a string to a file. Create the file if it does not exist.
lib.append = (file, str, callback) => {
  // Open the file for appending
  fs.open(`${lib.baseDir}${file}.log`, 'a', (err, fileDescriptor) => {
    if (!err && fileDescriptor) {
      // Append to the file and close it
      fs.appendFile(fileDescriptor, `${str}\n`, (errAppend) => {
        if (!errAppend) {
          fs.close(fileDescriptor, (errClose) => {
            if (!errClose) {
              callback(false);
            } else {
              callback('Error closing file that was being appended');
            }
          });
        } else {
          callback('Error appending to a file');
        }
      });
    } else {
      callback('Could not open file for appending');
    }
  });
};

// List all the logs, and optionally include the compressed logs
lib.list = (includeCompressLogs, callback) => {
  fs.readdir(lib.baseDir, (err, data) => {
    if (!err && data && data.length > 0) {
      const trimmedFileNames = [];
      data.forEach((fileName) => {
        // Add the .log files
        if (fileName.indexOf('.log') > -1) {
          trimmedFileNames.push(fileName.replace('.log', ''));
        }

        // Add on the .gz files
        if (fileName.indexOf('.gz.b64') > -1 && includeCompressLogs) {
          trimmedFileNames.push(fileName.replace('.gz.b64', ''));
        }
      });
      callback(false, trimmedFileNames);
    } else {
      callback(err, data);
    }
  });
};

// Compress the contents of one .log file into a .gz.b64 file within the same directory
lib.compress = (logId, newFileId, callback) => {
  const sourceFile = `${logId}.log`;
  const destFile = `${newFileId}.gz.b64`;
  // Read the source file
  fs.readFile(`${lib.baseDir}${sourceFile}`, 'utf8', (errRead, inputString) => {
    if (!errRead && inputString) {
      // Compress the data using gzip
      zlib.gzip(inputString, (errZlib, buffer) => {
        if (!errZlib && buffer) {
          // Send the data to the destination file
          fs.open(lib.baseDir + destFile, 'wx', (errOpen, fileDescriptor) => {
            if (!errOpen && fileDescriptor) {
              // Write to the destination file
              fs.writeFile(fileDescriptor, buffer.toString('base64'), (errWrite) => {
                if (!errWrite) {
                  // Close the destination file
                  fs.close(fileDescriptor, (errClose) => {
                    if (!errClose) {
                      callback(false);
                    } else {
                      callback(errClose);
                    }
                  });
                } else {
                  callback(errWrite);
                }
              });
            } else {
              callback(errOpen);
            }
          });
        } else {
          callback(errZlib);
        }
      });
    } else {
      callback(errRead);
    }
  });
};

// Decompress the contents of a .gz.b64 file into a string variable
lib.decompress = (fileId, callback) => {
  const fileName = `${fileId}.gz.b64`;
  fs.readFile(lib.baseDir + fileName, 'utf8', (errRead, str) => {
    if (!errRead && str) {
      // Decompress the data
      const inputBuffer = Buffer.from(str, 'base64');
      zlib.unzip(inputBuffer, (errUnzip, outputBuffer) => {
        if (!errUnzip && outputBuffer) {
          // Callback
          const outputBufferString = outputBuffer.toString();
          callback(false, outputBufferString);
        } else {
          callback(errUnzip);
        }
      });
    } else {
      callback(errRead);
    }
  });
};

// Truncate a log file
lib.truncate = (logId, callback) => {
  fs.truncate(`${lib.baseDir}${logId}.log`, 0, (err) => {
    if (!err) {
      callback(false);
    } else {
      callback(err);
    }
  });
};

// Export the module
module.exports = lib;
