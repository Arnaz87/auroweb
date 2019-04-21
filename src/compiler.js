
const parse = require("./parse.js")
const Writer = require("./writer.js")
const Code = require("./code.js")
const macros = require("./macros.js")
const state = require("./state.js")

const macro_modules = macros.modules
const macro = macros.macro

const Auro = require("./auro.js")

var modLoader = function () { return null }

function escape (_str) {
  var str = ""
  for (var j = 0; j < _str.length; j++) {
    var code = _str.charCodeAt(j)
    var char = _str[j]
    if (char == '"') char = "\\\""
    else if (char == '\\') char = "\\\\"
    else if (char == "\n") char = "\\n"
    else if (char == "\t") char = "\\t"
    else if (code < 32 || code == 127) {
      var s = code.toString(16)
      while (s.length < 2) s = "0" + s
      char = "\\x" + s
    }
    str += char
  }
  return '"' + str + '"'
}

var findName = state.findName

function tryPush (item, itemtype) {
  var index = state.toCompile.indexOf(item)
  if (index < 0) {
    if (!item.name)
      item.name = findName((itemtype || "item") + state.toCompile.length)
    state.toCompile.push(item)
  }
  return item
}

var fnCount = 0, tpCount = 0, modCount = 0, cnsCount = 0

function getModule (data, moduleName) {
  var parsed = parse(data)
  var sourcemap = {};

  function Item (line, name) {
    if (!name) name = "item" + state.toCompile.length

    this.name = name
    this.compile = function (writer) { writer.write("var " + name + " = " + line + ";") }

    // For modules
    this.get = function (iname) { return new Item(name + ".get(" + escape(iname) + ")", findName(iname, name)) }
    this.build = function (arg) { return new Item(name + ".build(" + arg.name + ")") }

    // For functions
    this.use = function (args) { return name + "(" + args.join(", ") + ")" }

    state.toCompile.push(this)
  }

  var modcache = {};
  function get_module (n) {
    if (modcache[n]) {
      var m = modcache[n]
      return m
    }
    function save (m) { modcache[n] = m; return m }
    var mdata = parsed.modules[n-1]
    if (mdata.type == "build") {
      var base = get_module(mdata.base)
      var arg = get_module(mdata.argument)
      if (!base.build) console.log(parsed.modules[mdata.base-1])
      var mod = base.build(arg)
      if (mod instanceof Item) mod.name = findName(base.name)
      return save(mod)
    }
    if (mdata.type == "import") {
      var mod = macro_modules[mdata.name]
      if (!mod) mod = modLoader(mdata.name)
      if (!mod) mod = new Item("Auro.$import(" + escape(mdata.name) + ")", findName(mdata.name))
      return save(mod)
    }
    if (mdata.type == "define") {
      return save({
        name: "mod" + ++modCount,
        get: function (iname) {
          var iparts = iname.split("\x1d")
          var exact = false
          var matches = []
          var item

          // Match item name with auro name matching rules (Complicated rules)
          mdata.items.forEach(function (it) {
            // Exact names have the biggest preference
            if (exact) return

            var parts = it.name.split("\x1d")

            // Main parts must match
            if (iparts[0] == parts[0]) {
              parts.splice(0, 1)

              // All parts in the given name must exist at least once
              // in this item's name
              for (var i = 1; i < iparts.length; i++) {
                var ix = parts.indexOf(iparts[i])

                // Not in item's name, fail
                if (ix < 0) return

                parts.splice(ix, 1)
              }

              if (parts.length == 0) exact = true
              matches.push(it.name)
              item = it
            }
          })

          if (!exact && matches.length > 1) {
            throw new Error("Name not specific enough: " +
              escape(iname) + " matches " +
              matches.map(escape).join(", ") +
              " in module " + moduleName)
          }

          if (!item) return null
          if (!item.value) {
            if (item.type == "function")
              item.value = get_function(item.index)
            else if (item.type == "type")
              item.value = get_type(item.index)
            else if (item.type == "module")
              item.value = get_module(item.index)
          }
          return item.value
        }
      })
    }
    if (mdata.type == "use") {
      var mod = get_module(mdata.module)
      var item = mod.get(mdata.item)
      if (!item) throw new Error("Module", mdata.item, "not found in", mod)
      return save(item)
    }
    throw new Error(mdata.type + " modules not yet supported");
  }

  var funcache = {};
  function get_function (n) {
    if (funcache[n]) return funcache[n];
    var fn = parsed.functions[n];
    var f;
    if (fn.type == "import") {
      var mod = get_module(fn.module)
      f = mod.get(fn.name)
      if (f instanceof Item) {
        f.name = findName("fn" + ++fnCount)
        f.ins = fn.ins
        f.outs = fn.outs
      }
      if (!f) console.log(mod)
      tryPush(f)
    } else if (fn.type == "code") {
      f = new Code(fn, get_function);
      if (sourcemap[n] && sourcemap[n].name) {
        f.name = findName(sourcemap[n].name, moduleName)
      } else {
        f.name = findName("fn" + ++fnCount)
      }
      f.fnName = f.name
    } else if (fn.type == "int") {
      f = macro(String(fn.value), 0, 1);
    } else if (fn.type == "bin") {
      var str = "\"";
      for (var j = 0; j < fn.data.length; j++) {
        var code = fn.data[j]
        var char = String.fromCharCode(code)
        if (char == '"') {char = "\\\""}
        else if (char == "\n") {char = "\\n"}
        else if (char == "\t") {char = "\\t"}
        else if (code < 32) {
          var s = code.toString(16)
          while (s.length < 2) s = "0" + s
          char = "\\x" + s
        }
        str += char;
      }
      str += "\"";
      f = macro(str, 0, 1);
      f.bytes = fn.data
    } else if (fn.type == "call") {
      var cfn = get_function(fn.index);
      if (cfn == macro_modules["auro\x1fstring"].data["new"]) {
        var bytes = get_function(fn.args[0]).bytes
        if (bytes instanceof Array) {
          // This is necessary to correctly read multi-byte characters
          var _str = String(Buffer.from(bytes))
          var str = ""
          for (var j = 0; j < _str.length; j++) {
            var code = _str.charCodeAt(j)
            var char = _str[j]
            if (char == '"') char = "\\\""
            else if (char == '\\') char = "\\\\"
            else if (char == "\n") char = "\\n"
            else if (char == "\t") char = "\\t"
            else if (code < 32 || code == 127) {
              var s = code.toString(16)
              while (s.length < 2) s = "0" + s
              char = "\\x" + s
            }
            str += char;
          }
          f = macro('"'+str+'"', 0, 1);
        }
      } else {
        var args = fn.args.map(function (ix) {
          return get_function(ix).use([]);
        });
        var expr = cfn.use(args);
        if (cfn.pure) {
          f = macro(expr, 0, 1);
        } else {
          var name = "cns" + ++cnsCount;
          state.toCompile.push({
            compile: function (writer) {
              writer.write("var " + name + " = " + expr)
            }
          });
          f = {ins: [], outs: [-1], use: function () {return name}};
        }
      }
    } else {
      throw new Error("Unsupported function kind " + fn.type);
    }
    funcache[n] = f;
    if (f instanceof Code) {
      f.build()
      state.toCompile.push(f)
    }
    return f;
  }

  var tpcache = {};
  function get_type (n) {
    if (tpcache[n]) return tpcache[n]
    var tp = parsed.types[n]
    var mod = get_module(tp.module)
    var t = mod.get(tp.name)
    tpcache[n] = t
    if (!t.name) t.name = "tp" + ++tpCount
    tryPush(t, "type")
    return t
  }

  function getNode (node, name) {
    if (node instanceof Object) {
      for (k in node) {
        var x = node[k];
        if (x instanceof Object && x[0] === name) {
          return x;
        }
      }
    }
  }

  var srcnode = getNode(parsed.metadata, "source map");
  if (srcnode) {
    var file_node = getNode(srcnode, "file")
    var file = file_node ? file_node[1] : "file"
    for (var i = 1; i < srcnode.length; i++) {
      var item = srcnode[i]
      if (item[0] == "function") {
        var index = item[1];
        var name_node = getNode(item, "name")
        var line_node = getNode(item, "line")
        if (getNode(item, "name")) name = 
        sourcemap[index] = {
          file: file,
          name: name_node ? name_node[1] : "",
          line: line_node ? line_node[1] : "",
        }
      }
    }
  }

  return get_module(1)
}

exports.setModuleLoader = function (fn) { modLoader = fn }
exports.escape = escape
exports.getModule = getModule