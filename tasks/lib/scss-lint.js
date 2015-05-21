exports.init = function (grunt) {
  var _ = require('lodash'),
  chalk = require('chalk'),
  exec = require('child_process').exec,
  exports = {},
  compact = {},
  xmlBuilder = require('xmlbuilder'),
  writeReport;

  //  Add format to writeReport function
  writeReport = function (output, results, format) {
    var files = {},
    file,
    spec,
    xml;

    if (!output) {
      return;
    }

    // Conditional for xml parser
    if (format == 'xml') {
      // Auto add extension if none of incorrect extension specified
      if (output.indexOf('.xml') == -1) {
        output = output + '.xml';
      }
      
      results = (results.length !== 0) ? results.split('\n') : [];

      xml = xmlBuilder.create('testsuites');

      xml.ele('testsuite', {
        name: 'scss-lint',
        timestamp: (new Date()).toISOString().substr(0, 19)
      });

      xml.att('errors', results.length);

      _.forEach(results, function (result) {
        if (!result) {
          return;
        }

        file = result.match(/^([^:])+/)[0];

        if (!files[file]) {
          files[file] = [];
        }

        files[file].push(result);
      });

      _.forEach(files, function (fileErrors, fileName) {
        spec = xml.ele('testcase', {
          name: fileName
        });

        _.forEach(fileErrors, function (error) {
          spec.ele('failure', {}, error);
        });
      });

      grunt.file.write(output, xml.end());
    };
    
    // Auto add extension if none of incorrect extension specified
    if (format == 'json') {
      if (output.indexOf('.json') == -1) {
        output = output + '.json';
      }
    // Add a wrapper to output in case this file is concatenated in a config file
    results = '{"scsslint":' + results + '}';
    // JSON output engine outs a clean json so only a write is required here
    grunt.file.write(output, results);
  }
};

compact = {
  make: function (results) {
    var output = {},
    fileName = '',
    matchesRe = /^(.+?\.scss)\:(\d+?)\s(\[\w+?\])\s(.+)/,
    matches;

    results = chalk.stripColor(results);
    results = results.length !== 0 ? results.split('\n') : [];

    _.forEach(results, function (result) {
      if (result === '') {
        return false;
      }

      matches = matchesRe.exec(result);

      if (matches) {
        if (fileName !== matches[1]) {
          fileName = matches[1];
          output[fileName] = [];
        }

        output[fileName].push({
          line: matches[2],
          type: matches[3],
          description: matches[4].split(':')
        });
      }
    });

    return output;
  },
  output: function (results) {
    var str = '',
    iterateErrors;

    iterateErrors = function (errors) {
      var errorMsg = '';

      _.forEach(errors, function (error) {
        if (error.type === '[W]') {
          errorMsg += '  ' +
          chalk.magenta(error.line) + ': ' +
          chalk.yellow(error.type) + ' ' +
          chalk.green(error.description[0]) + ': ' +
          error.description[1] + '\n';
        } else {
          errorMsg += '  ' +
          chalk.magenta(error.line) + ': ' +
          chalk.red(error.type) + ' ' +
          chalk.green(error.description[0]) + ': ' +
          error.description[1] + '\n';
        }
      });

      return errorMsg;
    };

    results = compact.make(results);

    _.forEach(results, function (result, index, collection) {
      str += '\n';
      str += chalk.cyan.bold(index);
      str += '\n';
      str += iterateErrors(result);
    });

    return str;
  }
};

exports.lint = function (files, options, done) {
  var args = [],
  env = process.env,
  fileCount = _.isArray(files) ? files.length : 1,
  child;

  args.push('scss-lint');

  if (options.bundleExec) {
    args.unshift('bundle', 'exec');
  }

  if (options.gemVersion) {
    args.push('"_' + options.gemVersion + '_"');
  }

  if (options.config) {
    args.push('-c');
    args.push(options.config);
  }

  if (options.exclude) {
    args.push('-e');
    args.push(grunt.file.expand(options.exclude).join(','));
  }

  // Pass the Json argument to the linter if Json format is requested
  if(options.reporter == 'json') {
    args.push('-f JSON');
  }

  options.colorizeOutput = options.colorizeOutput || options.colouriseOutput;

  if (options.colorizeOutput) {
    env.CLICOLOR_FORCE = '1';
  }

  args = args.concat(files);

  if (grunt.option('debug') !== undefined) {
    grunt.log.debug('Run command: ' + args.join(' '));
  }

  child = exec(args.join(' '), {
    maxBuffer: options.maxBuffer,
    cwd: process.cwd(),
    env: env
  }, function (err, results, code) {
    var message,
    rawResults;

    if (err && err.code !== 1 && err.code !== 2 && err.code !== 65) {
      if (err.code === 127) {
        grunt.log.errorlns('1. Please make sure you have ruby installed: `ruby -v`');
        grunt.log.errorlns('2. Install the `scss-lint` gem by running:');
        grunt.log.errorlns('gem update --system && gem install scss-lint');
      } else {
        grunt.log.errorlns('scss-lint failed with error code: ' + err.code);
        grunt.log.errorlns('and the following message:' + err);
      }

      return done(false);
    }

    results = results.trim();
    rawResults = results;

    if (results && options.compact) {
      results = compact.output(results);
      if (!options.colorizeOutput) {
        results = chalk.stripColor(results);
      }
    }

    if (!results) {
      if (!options.emitSuccess) {
        message = fileCount + grunt.util.pluralize(fileCount, ' file is lint free/ files are lint free');
        grunt.log.oklns(message);
      } else {
        grunt.event.emit('scss-lint-success');
      }
    } else {
      if (!options.emitError) {
        grunt.log.writeln(results);
      } else {
        grunt.event.emit('scss-lint-error', results);
      }
      if (options.force) {
        grunt.log.writeln('scss-lint failed, but was run in force mode');
      }
    }

    if (options.reporterOutput) {
     writeReport(options.reporterOutput, grunt.log.uncolor(rawResults), options.reporter);
     // Align the log output to the write output by checking if correct format / extensions are used
      if (options.reporter == 'xml') {
        if (options.reporterOutput.indexOf('.xml') == -1) {
          options.reporterOutput = options.reporterOutput + '.xml';
        }
      }
      if (options.reporter == 'json') {
        if (options.reporterOutput.indexOf('.json') == -1) {
          options.reporterOutput = options.reporterOutput + '.json';
        }
      }
      grunt.log.writeln('Results have been written to: ' + options.reporterOutput);
    }
    done(results);
  });
};
  return exports;
};
