
const parse = require("./parse.js")
const Writer = require("./writer.js")
const Code = require("./code.js")
const macros = require("./macros.js")

const macro_modules = macros.modules
const macro = macros.macro

const Cobre = require("./cobre.js")

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

var reservedNames =  [
  // https://www.w3schools.com/js/js_reserved.asp
  "abstract", "await", "arguments", "boolean",
  "break", "byte", "case", "catch",
  "char", "class", "const", "continue",
  "debugger", "default", "delete", "do",
  "double", "else", "enum", "eval",
  "export", "extends", "false", "final",
  "finally", "float", "for", "function",
  "goto", "if", "implements", "import",
  "in", "instanceof", "int", "interface",
  "let", "long", "native", "new",
  "null", "package", "private", "protected",
  "public", "return", "short", "static",
  "super", "switch", "synchronized", "this",
  "throw", "throws", "transient", "true",
  "try", "typeof", "var", "void",
  "volatile", "while", "with", "yield",
  // Other keywords
  "undefined", "NaN", "Infinity",
  // Global Objects
  "Object", "Function", "Boolean", "Error", "Number", "Math", "String", "Array",
  // Browser specific
  "document", "window", "console",
  // NodeJS specific
  "global", "require", "module", "process", "Buffer",
  // Cobre
  "Cobre"
];

var nameSet = {}

reservedNames.forEach(function (name) {nameSet[name] = true})

function findName (orig, modname) {
  function normalize (name) {
    name = name.replace(/[^$\w]+/g, "_")
    if (name.match(/^\d/)) name = "_"+name
    return name
  }
  var name = normalize(orig)
  if (nameSet[name] && modname)
    name = normalize(modname + "$" + orig)
  var i = 1
  while (nameSet[name]) {
    name = normalize(orig + "$" + i++)
  }
  nameSet[name] = true
  return name
}


function compile (data, moduleName) {
  var parsed = parse(data)
  var toCompile = []
  var modcache = {};
  var sourcemap = {};

  function module_from_line (compile_line, name) {
    if (!name) name = "mod" + toCompile.length
    var mod = {
      name: name,
      get: function (iname) {
        return name + ".get(" + escape(iname) + ")"
      },
      build: function (arg) {
        return module_from_line(name + ".build(" + arg + ")")
      },
      compile: function (writer) {
        writer.write("var " + name + " = " + compile_line + ";")
      }
    }
    toCompile.push(mod)
    return mod
  }

  function get_module (n) {
    if (modcache[n]) return modcache[n];
    var mdata = parsed.modules[n-1];
    if (mdata.type == "build") {
      var base = get_module(mdata.base);
      var arg = get_module(mdata.argument);
      if (!base.build) console.log(base)
      var mod = base.build(arg);
      modcache[n] = mod;
      return mod;
    }
    if (mdata.type == "import") {
      var mod = macro_modules[mdata.name];
      if (!mod) {
        mod = module_from_line("Cobre.$import(" + escape(mdata.name) + ")", findName(mdata.name))
      }
      modcache[n] = mod;
      return mod;get_module
    }
    if (mdata.type == "define") {
      var name = "mod" + toCompile.length;
      var items = {};
      for (var i = 0; i < mdata.items.length; i++) {
        var item = mdata.items[i];
        var value
        if (item.type == "function")
          value = get_function(item.index)
        else if (item.type == "type")
          value = get_type(item.index)
        else if (item.type == "module")
          value = get_module(item.index)
          value.isModule = true
        items[item.name] = value;
      }
      var mod = {
        name: name,
        get: function (name) { return items[name] },
        build: function () { throw new Error("module is not a functor"); },
        compile: function (writer) {
          writer.write("var " + name + " = new Cobre.Module({")
          writer.indent()
          for (key in items) {
            var item = items[key]
            writer.write(escape(key), ": ", item.name, ",")
          }
          writer.dedent()
          writer.write("});")
        }
      }
      toCompile.push(mod);
      modcache[n] = mod;
      return mod;
    }
    if (mdata.type == "use") {
      var mod = get_module(mdata.module)
      var item = mod.get(mdata.item)
      if (typeof item === "string") item = module_from_line(item)
      if (!item) throw new Error("Module", mdata.item, "not found in", mod)
      modcache[n] = item
      return item
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
      if (typeof f == "string") {
        var compile_line = f
        var name = findName(fn.name)
        f = {
          name: name,
          ins: fn.ins,
          outs: fn.outs,
          use: function (args) { return name + "(" + args.join(", ") + ")" },
          compile: function (writer) { writer.write("var " + name + " = " + compile_line + ";") },
        }
        toCompile.push(f)
      }
    } else if (fn.type == "code") {
      f = new Code(fn, get_function);
      if (sourcemap[n] && sourcemap[n].name) {
        f.name = findName(sourcemap[n].name, moduleName)
      } else {
        f.name = "fn_" + toCompile.length
      }
      f.fnName = f.name
      toCompile.push(f);
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
      if (cfn == macro_modules["cobre\x1fstring"].data["new"]) {
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
          var name = "cns" + toCompile.length;
          toCompile.push({
            compile: function (writer) {
              writer.write("var " + name + " = " + expr + ";")
            }
          });
          f = {ins: [], outs: [-1], use: function () {return name;}};
        }
      }
    } else {
      throw new Error("Unsupported function kind " + fn.type);
    }
    funcache[n] = f;
    return f;
  }

  var tpcache = {};
  function get_type (n) {
    if (tpcache[n]) return tpcache[n];
    var tp = parsed.types[n];
    var mod = get_module(tp.module);
    var t = mod.get(tp.name);
    tpcache[n] = t;
    return t;
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

  var mod = get_module(1);

  var writer = new Writer();
  writer.write("Cobre.$export(", escape(moduleName), ", (function () {")
  writer.indent()

  for (var i = 0; i < toCompile.length; i++)
    toCompile[i].compile(writer)

  writer.write("return ", mod.name, ";")

  writer.dedent()
  writer.write("})());")

  return writer.text
}

exports.compile = compile
