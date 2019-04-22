# Auro Web

An implementation of [Auro](https://github.com/Arnaz87/aurovm) that comilpes module files to javascript.

Published under the [MIT](https://mit-license.org/) license.

# Usage

To compile a file run `node main.js [<output format>] [-o <output_file>] <module>`. You can use any of these output formats.

- `--node`: node executable, the default choice
- `--nodelib`: node module, outputs module items as exports
- `--browser`: browser script
- `--browserlib <libname>`: browser script that puts the module in `window[libname]`

## Browser compiler

The compiler itself can also be used in the browser.

The compiler can also be used in the browser, first install browserify with `npm install -g browserify`, then run `browserify browser.js -o bundle.js`, it will output a file *bundle.js* wich does the same as *auro.js* but additionally, adds a *compile* method to the *Auro* global.

~~~
// should contain a valid auro module binary data
var buffer = new Uint8Array()

// then you can use everything almost the same way
var js = Auro.compile(buffer, modulename)
eval(js)
Auro.$import(modulename).get("main")()
~~~