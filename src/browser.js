
var Compiler = require("./compiler.js")
var Writer = require("./writer.js")
var state = require("./state.js")

var macros = require("./macros.js")

for (var name in macros.modules) {
  state.modules[name] = macros.modules
}

var Auro = {
  modules: {},
  compile: function (name) {
    var main_mod = load_module(name, true)
    var main_fn = main_mod.get("main")

    var writer = new Writer()
    writer.write("var Auro = typeof Auro == 'undefined' ? {} : Auro;")

    state.toCompile.forEach(function (item) {
      if (item.compile) item.compile(writer)
    })

    writer.write(main_fn.use([]))
    return writer.text
  }
}

var compiled = {}

function load_module (name) {
  if (compiled[name]) return compiled[name]

  var mod = Auro.modules[name]
  if (mod) {
    return compiled[name] = Compiler.getModule(mod, name)
  }

  throw new Error("module " + name + " not found")
}

Compiler.setModuleLoader(load_module)

if (typeof window === "undefined")
  throw new Error("Not running in a browser")

window.Auro = Auro
