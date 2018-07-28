
var Cobre = require("./cobre.js")
var Compiler = require("./compiler.js")

Cobre.escape = Compiler.escape
Cobre.compile = Compiler.compile

if (typeof window === "undefined")
  throw new Error("Not running in a browser")

window.Cobre = Cobre
