
var state = require("./state.js")
var Compiler = require("./compiler.js")

var compiled_modules = {}

var Auro = {
  modules: {},
  compile: function (name) {
  }
}

if (typeof window === "undefined")
  throw new Error("Not running in a browser")

window.Auro = Auro
