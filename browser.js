
var Auro = require("./auro.js")
var Compiler = require("./compiler.js")

Auro.escape = Compiler.escape
Auro.compile = Compiler.compile

if (typeof window === "undefined")
  throw new Error("Not running in a browser")

window.Auro = Auro
