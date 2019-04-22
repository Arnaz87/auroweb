
var Compiler = require("./compiler.js")

var Auro = {
  modules: {},
  state: require("./state.js"),
  macros: require("./macros"),
  Compiler: Compiler,
  compile: Compiler.compile_to_string,
}

Compiler.setModuleLoader(function load_module (name) {
  var mod = Auro.modules[name]
  if (mod) return Compiler.getModule(mod, name)
})

if (typeof window === "undefined")
  throw new Error("Not running in a browser")

window.Auro = Auro

window.addEventListener("load", function () {
  var scripts = document.getElementsByTagName("script")

  var toload = 0
  var main_mod

  function loadEnd () {
    if (main_mod) {
      jscode = Auro.compile(main_mod, 'browser')
      var fn = new Function(jscode)
      fn()
    }
  }

  for (var i = 0; i < scripts.length; i++) {
    var script = scripts[i]
    if (script.type != "application/auro") continue

    var mod_name = script.getAttribute("auro-name")
    
    if (!mod_name && script.src) {
      mod_name = script.src.match(/^(?:.*\/)?([^?]+)/)[1]
      if (mod_name) {
        mod_name = mod_name.replace(/\./g, "\x1f")
      }
    }

    if (!mod_name) {
      console.warn("auro script does not have attribute auro-name")
      return
    }

    if (script.getAttribute("auro-main") == "auro-main") {
      main_mod = mod_name
    }

    if (script.src) {
      var xhr = new XMLHttpRequest();
      window.myxhr = xhr

      xhr.addEventListener("load", function (e) {
        Auro.modules[mod_name] = new Uint8Array(xhr.response)
        if (--toload == 0) loadEnd()
      })

      xhr.responseType = "arraybuffer"
      xhr.open("GET", script.src)
      xhr.send()
      toload++
    } else if (script.textContent) {
      console.warn("TODO: Decode auro scripts as base64")
    }
  }
})
