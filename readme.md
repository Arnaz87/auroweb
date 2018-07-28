# Cobre Web

An implementation of [Cobre](https://github.com/Arnaz87/cobrevm) that comilpes module files to javascript.

Published under the [MIT](https://mit-license.org/) license.

# Usage

To compile a file run `node main.js [-o <out-file>] <file>`, more instructions are available with `node main.js --help`.

## Compiler Library

~~~
var Compiler = require("./compiler.js")

// this must be an ArrayBuffer
var buffer = fs.readFileSync(filename)

// modulename is a string with the global name of the module
// Returns the javascript source
var js = Compiler.compile(buffer, modulename)
~~~

## Module usage

~~~
var Cobre = require("./cobre.js")

// somehow evaluate the output of the compiler
// the code doesn't contaminate any external namespace
eval(js)

var module = Cobre.$import(modulename)
var main = module.get("main")
main()
~~~

## Browser usage

You can include the same *cobre.js* script in the browser and use it the same way, the Cobre object will be in the window object.

The compiler can also be used in the browser, first install browserify with `npm install -g browserify`, then run `browserify browser.js -o bundle.js`, it will output a file *bundle.js* wich does the same as *cobre.js* but additionally, adds a *compile* method to the *Cobre* global.

~~~
// should contain a valid cobre module binary data
var buffer = new Uint8Array()

// then you can use everything almost the same way
var js = Cobre.compile(buffer, modulename)
eval(js)
Cobre.$import(modulename).get("main")()
~~~