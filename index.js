"use strict";

var stackTrace = require("stack-trace"),
    sourceMap = require("source-map"),
    fs = require("fs"),
    path = require("path");

var maps = {};
var rootUrl, logger;

// fixes watch firing twice
// https://github.com/joyent/node/issues/2054#issuecomment-9707892
var blocked = {};

function wch(fn) {
    return function(event, path) {
        if (path in blocked) { return; }
        blocked[path] = true;
        setTimeout(function() { delete blocked[path]; }, 25);
        fn(event, path);
    };
}

var setupMap = function(file, map) {
    var loadMap = function(cb) {
        logger.info("Loading source map " + path.basename(map));

        setTimeout(function() {
            try {
                var data;
                data = JSON.parse(fs.readFileSync(map));
                maps[path.basename(file)] = new sourceMap.SourceMapConsumer(data);
                cb();
            } catch (e) {
                cb(e);
            }
        }, 1000);
    };

    var startWatch = function() {
        fs.watch(map, {persistent: false}, wch(function(ev, file) {
            loadMap(function(err) {
                if (err) {
                    logger.error(err);
                }
            });
        }));
        loadMap(function(err) {
            if (err) {
                logger.error(err);
                startWatch();
            }
        });
    };

    logger.info("Configuring source map " + map);
    setTimeout(startWatch, 2000);
};

var setupInlineMap = function(file) {
    var loadInlineMap = function() {
        logger.info("Configuring source map " + path.basename(file));

        var data, data64, iFile, match;

        iFile = fs.readFileSync(file, "utf8");
        match = iFile.match(/\/\/@ sourceMappingURL=data:application\/json;base64,(.*)\n/);

        if (match === null) {
            logger.error("no sourcemap in file");
        }

        data64 = match[1];
        data = new Buffer(data64, "base64").toString("utf8");
        data = JSON.parse(data);

        maps[path.basename(file)] = new sourceMap.SourceMapConsumer(data);
    };
    fs.watch(file, {persistent: false}, loadInlineMap);
    loadInlineMap();
};


// load source maps
function loadMapsFromConfig(config) {
    logger = config.logger || {
        info: console.log,
        error: console.error
    };

    rootUrl = config.srcUrl;

    config.src.forEach(function(src) {
        var srcFile = src.src;
        var inline = src.inline;

        if (inline) {
            setupInlineMap(rootUrl + srcFile);
        } else {
            var mapFile = src.map || src.src + ".map";
            setupMap(srcFile, rootUrl + mapFile);
        }
    });
}

function deobfuscateTrace(errorStack) {
    // decode stack trace
    var trace = stackTrace.parse({
        stack: errorStack
    });

    trace.forEach(function(t) {
        var file = path.basename(t.fileName);
        if (file in maps) {
            var file = path.basename(t.fileName);
            if (file in maps) {
                var orig = {};
                try {
                    orig = maps[file].originalPositionFor({
                        line: t.getLineNumber(),
                        column: t.getColumnNumber()
                    });
                } catch (e) {
                }

                if (orig.source !== null && orig.line !== null && orig.column !== null) {
                    t.fileName = orig.source;
                    t.lineNumber = orig.line;
                    t.columnNumber = orig.column;
                }
                if (orig.name !== undefined && orig.name !== null) {
                    t.functionName = orig.name;
                }
            }
        }
    });

    return trace.map(function(t) {
        return "  at " +
            (t.functionName === null ? "(anonymous function)" : t.functionName) +
            " (" + t.fileName + ":" + t.lineNumber + ":" + t.columnNumber + ")";
    }).join("\n");
}

module.exports = {

    /**
     * Takes an original stack-trace string, parses it,
     * maps it via source-maps, and returns a new formatted
     * string of the trace.
     * 
     * @param  {string} stack Original trace
     * @return {string}       De-obfuscated trace
     */
    deobfuscate: function(stack) {
        return deobfuscateTrace(stack);
    },

    error: function(config) {
        loadMapsFromConfig(config);

        return function(req, res) {
            var error = req.body;
            var deobfuscatedTrace = deobfuscateTrace(error.stack);

            logger.error(error.message + " [" + error.url + "]\n" + deobfuscatedTrace);

            res.header("Cache-Control", "no-cache, no-store, must-revalidate");
            res.header("Pragma", "no-cache");
            res.header("Expires", 0);
            res.send({
                logged: true
            });
        };
    },

    log: function(config) {

        var logger = config.logger || {
            info: console.info,
            debug: console.debug,
            warn: console.warn,
            error: console.error
        };

        return function(req, res) {
            if (config.hideLogs) { return; }
            var hdlr = logger[req.body.level.name.toLowerCase()],
                messages = req.body.message;

            res.header("Cache-Control", "no-cache, no-store, must-revalidate");
            res.header("Pragma", "no-cache");
            res.header("Expires", 0);
            res.send({
                logged: true
            });

            for (var message in messages) {
                if (messages.hasOwnProperty(message)) {
                    hdlr.call(logger, messages[message]);
                }
            }
        };
    }
};