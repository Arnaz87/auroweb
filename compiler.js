
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

function findName (orig, modname) {
  function normalize (name) {
    name = name.replace(/[^$\w]+/g, "_")
    if (name.match(/^\d/)) name = "_"+name
    return name
  }
  var name = normalize(orig)
  if (state.nameSet[name] && modname)
    name = normalize(modname + "$" + orig)
  var i = 1
  while (state.nameSet[name]) {
    name = normalize(orig + "$" + i++)
  }
  state.nameSet[name] = true
  return name
}

function tryPush (item, itemtype) {
  var index = state.toCompile.indexOf(item)
  if (index < 0) {
    if (!item.name)
      item.name = findName((itemtype || "item") + state.toCompile.length)
    state.toCompile.push(item)
  }
  return item
}

function getModule (data, moduleName) {
  var parsed = parse(data)
  var sourcemap = {};

  var fnCount = 0, tpCount = 0, modCount = 0, cnsCount = 0

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
      tryPush(m)
      return m
    }
    function save (mod) {
      modcache[n] = mod
      return mod
    }
    var mdata = parsed.modules[n-1]
    if (mdata.type == "build") {
      var base = get_module(mdata.base)
      var arg = get_module(mdata.argument)
      if (!base.build) console.log(base)
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
      var name = "mod" + ++modCount
      var items = {}
      for (var i = 0; i < mdata.items.length; i++) {
        var item = mdata.items[i]
        items[item.name] = {
          type: item.type,
          index: item.index,
          value: null
        }
      }
      function getItem (name) {
        var item = items[name]
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
      var mod = {
        name: name,
        get: function (iname) { return getItem(iname, findName(iname, name)) },
        build: function () { throw new Error("module is not a functor"); },
        compile: function (writer) {
          writer.write("var " + name + " = new Auro.Module({")
          writer.indent()
          for (var nm in items) {
            var item = getItem(nm)
            writer.write(escape(nm), ": ", item.name, ",")
          }
          writer.dedent()
          writer.write("});")
        }
      }
      return save(mod)
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
              writer.write("var " + name + " = Auro.Lazy(function () { return " + expr + "});")
            }
          });
          f = {ins: [], outs: [-1], use: function () {return name + "()";}};
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