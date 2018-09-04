# Auro Web

An implementation of [Auro](https://github.com/Arnaz87/aurovm) that comilpes module files to javascript.

Published under the [MIT](https://mit-license.org/) license.

# Usage

To compile a file run `node main.js [-o <out.js>] <module>`, more instructions are available with `node main.js --help`.

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
var Auro = require("./auro.js")

// somehow evaluate the output of the compiler
// the code doesn't contaminate any external namespace
eval(js)

var module = Auro.$import(modulename)
var main = module.get("main")
main()
~~~

## Browser usage

You can include the same *auro.js* script in the browser and use it the same way, the Auro object will be in the window object.

The compiler can also be used in the browser, first install browserify with `npm install -g browserify`, then run `browserify browser.js -o bundle.js`, it will output a file *bundle.js* wich does the same as *auro.js* but additionally, adds a *compile* method to the *Auro* global.

~~~
// should contain a valid auro module binary data
var buffer = new Uint8Array()

// then you can use everything almost the same way
var js = Auro.compile(buffer, modulename)
eval(js)
Auro.$import(modulename).get("main")()
~~~