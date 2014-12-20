Press-corp provides Express.JS middleware that exposes an endpoint from your server that allows the client-side to send logging and error-messages back to the server to be captured and added to the server logs.

Exposes two methods that allow the middleware to be configured:

```
var pressCorp = require("press-corp");

express.post("/error", pressCorp.error({
	logger: (optional) {
		info: fn,
		error: fn
	},
	src: [
		{
			srcUrl: sourceFileDirectory,
			src: sourceFilename, 
			map: sourceMapFilename,
			inline: boolean
		}
	]
}));

express.post("/log", pressCorp.error({
	logger: (optional) {
		log: fn,
		warn: fn,
		info: fn,
		debug: fn
	}
}));
```

To use these, you just want to provide each JavaScript source file, along with the map file. You can also use inline maps, but for production purposes, you probably wouldn't have those in your files. You can use the logger property to connect to your own logging framework, or just leave it out to rely on the built-in console commands in Node.