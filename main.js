
const fs = require("fs");

const parse = require("./parse.js");
const writer = require("./writer.js")();
const Code = require("./code.js");

// NOTE: This file is somewhat of a mess.

function putln (str) { writer.write(str); }

var toCompile = [];
var toRun = [];

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
  "document", "window", "console", "body",
  // NodeJS specific
  "global", "require", "module", "process", "Buffer"
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

var types = [];
function newType (name) {
  var tp = {name: name, id: types.length, compile: function () {
    putln("// type[" + this.id + "]: " + this.name);
  }};
  types.push(tp);
  toCompile.push(tp);
  return tp;
}

function BaseModule (data) {
  this.data = data;
  this.get = function (name) {
    return data[name];
  }
}

function Parsed (parsed, modulename) {
  var modcache = {};

  var sourcemap = {};

  function get_module (n) {
    if (modcache[n]) return modcache[n];
    var mdata = parsed.modules[n-1];
    if (mdata.type == "build") {
      var base = get_module(mdata.base);
      var arg = get_module(mdata.argument);
      var mod = base.build(arg);
      modcache[n] = mod;
      return mod;
    }
    if (mdata.type == "import") {
      var mod = load_module(mdata.name);
      modcache[n] = mod;
      return mod;
    }
    if (mdata.type == "define") {
      var items = {};
      for (var i = 0; i < mdata.items.length; i++) {
        var item = mdata.items[i];
        items[item.name] = item;
      }
      var mod = {items: items};
      mod.get = function (name) {
        var item = items[name];
        if (!item) return null;
        if (item.type == "function")
          return get_function(item.index);
        if (item.type == "type")
          return get_type(item.index);
        if (item.type == "module")
          return get_module(item.index);
      };
      mod.build = function () { throw new Error("module is not a functor"); }
      modcache[n] = mod;
      return mod;
    }
    if (mdata.type == "use") {
      var mod = get_module(mdata.module)
      var item = mod.get(mdata.item)
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
      var mod = get_module(fn.module);
      f = mod.get(fn.name);
      if (!f) throw new Error("No item " + fn.name + " found in module");
    } else if (fn.type == "code") {
      f = new Code(fn, get_function);
      if (sourcemap[n] && sourcemap[n].name) {
        f.name = findName(sourcemap[n].name, modulename)
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
      if (cfn == modules["cobre\x1fstring"].data["new"]) {
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
            compile: function () {
              putln("var " + name + " = " + expr + ";")
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

  /*mod.compile = function () {
    for (name in mod.items) {
      var fn = get_function(exports[name]);
      putln("exports." + name + " = " + fn.name);
    }
  }*/
  return mod;
}

function macro (str, inc, outc) { return {
  type: "macro", macro: str,
  ins: new Array(inc), outs: new Array(outc),
  use: function (args) {
    var expr = this.macro;
    for (var i = 0; i < this.ins.length; i++) {
      var patt = new RegExp("\\$" + (i+1), "g");
      expr = expr.replace(patt, args[i]);
    }
    return expr;
  }
}; }

var recordcache = {};
var arraycache = {};

var anyModule = new BaseModule({ "any": newType("any") })

var modules = {
  "cobre\x1fbool": new BaseModule({
    "bool": newType("bool"),
    "true": macro("true", 0, 1),
    "false": macro("false", 0, 1),
    "not": macro("!$1", 1, 1),
  }),
  "cobre\x1fsystem": new BaseModule({
    "println": macro("console.log($1)", 1, 0),
    "error": macro("error($1)", 1, 0),
  }),
  "cobre\x1fint": new BaseModule({
    "int": newType("int"),
    "add": macro("($1 + $2)", 2, 1),
    "sub": macro("($1 - $2)", 2, 1),
    "mul": macro("($1 * $2)", 2, 1),
    "div": macro("($1 / $2)", 2, 1),
    "eq": macro("($1 == $2)", 2, 1),
    "ne": macro("($1 != $2)", 2, 1),
    "gt": macro("($1 > $2)", 2, 1),
    "lt": macro("($1 < $2)", 2, 1),
    "ge": macro("($1 >= $2)", 2, 1),
    "le": macro("($1 <= $2)", 2, 1),
  }),
  "cobre\x1fstring": new BaseModule({
    "string": newType("string"),
    "new": macro("String($1)", 1, 1),
    "itos": macro("String($1)", 1, 1),
    "concat": macro("($1 + $2)", 2, 1),
    "add": macro("($1 + $2)", 2, 1),
    "eq": macro("($1 == $2)", 2, 1),
    "length": macro("$1.length", 1, 1),
    "charat": macro("charat($1, $2)", 2, 2),
    "newchar": macro("String.fromCharCode($1)", 1, 1),
    "codeof": macro("$1.charCodeAt(0)", 1, 1),
  }),
  "cobre\x1farray": {build: function (arg) {
    var base = arg.get("0");
    var mod = arraycache[base.id];
    if (mod) return mod;
    var tp = newType("array(" + base.name + ")");
    mod = new BaseModule({
      "": tp,
      "new": macro("new Array($2).fill($1)", 2, 1),
      "empty": macro("[]", 0, 1),
      "get": macro("$1[$2]", 2, 1),
      "set": macro("$1[$2]=$3", 3, 0),
      "len": macro("$1.length", 1, 1),
      "push": macro("$1.push($2)", 2, 0),
    });
    arraycache[base.id] = mod;
    return mod;
  } },
  "cobre\x1fany": {
    build: function (arg) {
      var base = arg.get("0");
      if (!base) return anyModule;
      var id = base.id;
      return { "get": function (name) {
        if (name == "new") return macro("{val: $1, tp: " + id + "}", 1, 1);
        if (name == "test") return macro("($1.tp == " + id + ")", 1, 1);
        if (name == "get") return macro("$1.val", 1, 1);
      } };
    },
    get: function (name) {
      if (name == "any") return anyModule.data.any;
    }
  },
  "cobre\x1fnull": { build: function (arg) {
    var base = arg.get("0");
    var tp = newType("null(" + base.name + ")");
    return new BaseModule({
      "": tp,
      "null": macro("null", 0, 1),
      "new": macro("$1", 1, 1),
      "get": macro("$1", 1, 1),
      "isnull": macro("($1 === null)", 1, 1),
    });
  } },
  "cobre\x1frecord": { build: function (arg) {
    var arr = [];
    var names = [];
    var i = 0;
    while (true) {
      var a = arg.get(String(i));
      if (!a) break;
      arr.push(a.id);
      names.push(a.name);
      i++;
    }
    var id = arr.join(",");

    var mod = recordcache[id];
    if (mod) return mod;

    var tp = newType("record(" + names.join(",") + ")");

    mod = { "get": function (name) {
      if (name == "new") {
        return {ins: [], outs: [0], use: function (args) {
          return "[" + args.join(", ") + "]";
        }};
      }
      var a = name.slice(0, 3);
      var n = name.slice(3);
      if (a == "") return tp;
      if (a == "get") return macro("$1[" + n + "]", 1, 1);
      if (a == "set") return macro("$1[" + n + "] = $2", 2, 0);
    } };

    recordcache[id] = mod;
    return mod;
  } },
  "cobre\x1ftypeshell": {build: function (arg) {
    // Each time it's called, a new type is created
    return new BaseModule({
      "": newType("typeshell"),
      "new": macro("$1", 1, 1),
      "get": macro("$1", 1, 1),
    });
  } },
  "cobre\x1ffunction": { build: function (arg) {
    var inlist = [];
    var innames = [];
    var outlist = [];
    var outnames = [];

    var i = 0;
    while (true) {
      var a = arg.get("in" + String(i));
      if (!a) break;
      inlist.push(a.id);
      innames.push(a.name);
      i++;
    }

    var i = 0;
    while (true) {
      var a = arg.get("out" + String(i));
      if (!a) break;
      outlist.push(a.id);
      outnames.push(a.name);
      i++;
    }

    var id = inlist.join(",") + "->" + outlist.join(",");

    var mod = recordcache[id];
    if (mod) return mod;

    var tp = newType("(" + innames.join(",") + ")->(" + outnames.join(",") + ")");

    var abc = "abcdefghijklmnopqrstuvwxyz"
    var argnames = abc.split("").slice(0, inlist.length)

    function createDefinition (fn, last) {
      var args = argnames.slice()
      if (last) args.push(last)
      return "(function (" + argnames.join(",") + ") {return " + fn.use(args) + "})"
    }

    mod = new BaseModule({
      "": tp,
      "apply": {
        ins: inlist,
        outs: outlist,
        use: function (fargs) {
          return fargs[0] + "(" + fargs.slice(1).join(", ") + ")"
        }
      },
      "new": { build: function (args) {
        var fn = args.get("0")

        return new BaseModule({"": {
          ins: inlist,
          outs: outlist,
          use: function (fargs) { return (fn instanceof Code)? fn.name : createDefinition(fn) }
        }})
      } },
      closure: {
        "build": function (args) {
          var fn = args.get("0")

          return new BaseModule({"new": {
            ins: inlist,
            outs: outlist,
            use: function (fargs) {
              var def = createDefinition(fn, "this")
              return def + ".bind(" + fargs[0] + ")"
            }
          }});
        }
      }
    });
    mod.name = "function" + tp.name
    recordcache[id] = mod;
    return mod;
  } },
};

modules["cobre\x1fstring"].data["new"].pure = true;

function readModule (filename, name) {
  var data = parse(fs.readFileSync(filename));
  var mod = Parsed(data, name);
  modules[name] = mod;
  return mod;
}

var paths = [process.env.HOME + "/.cobre/modules/", "./"]

function load_module (name) {
  if (modules[name] !== undefined) return modules[name]

  var escaped = name.replace(/\x1f/g, ".")
  for (var i = paths.length-1; i >= 0; i--) {
    var filename = paths[i] + escaped
    if (fs.existsSync(filename)) return readModule(filename, name)
  }

  throw new Error("Cannot load module " + name)
}

function usage () {
  console.log("Usage: " + process.argv0 + " " + argv[1] + " [options] <module>");
  console.log("\n    Reads the node module and outputs the compiled javascript code to stdout.\n");
  console.log("Options:");
  console.log("  -h --help     displays this message");
  console.log("  -o <file>     outputs the compiled code to a file instead of stdout");
  console.log("  --path        similar to cobre's --lib option");
  console.log("  --lib         outputs a browser library");
  console.log("  --node        outputs a node js executable");
  console.log("  --html        outputs an html file that executes the code in the page");
  console.log("  --term        outputs an html file whose body acts like a terminal");
  console.log("  --nodelib     outputs a node js library");
  process.exit(0);
}

const argv = process.argv;

var mode;
var modname;
var outfile;

if (argv.length < 3) usage();

for (var i = 2; i < argv.length; i++) {
  var arg = argv[i];
  if (arg == "-o") {
    if (argv.length < i+2) {
      console.log("No output filename given");
      process.exit(1);
    }
    var outfile = argv[++i];
    continue;
  }
  if (arg == "-h" || arg == "--help") usage();
  if (arg == "--path") { paths.push(argv[++i] + "/"); continue; }
  if (arg == "--lib") { mode = "lib"; continue; }
  if (arg == "--node") { mode = "node"; continue; }
  if (arg == "--term") { mode = "term"; continue; }
  if (arg == "--html") { mode = "html"; continue; }
  if (arg == "--nodelib") { mode = "nodelib"; continue; }
  if (arg[0] == "-") {
    console.log("Unknown option " + arg);
    process.exit(1);
  }
  if (modname !== undefined) {
    console.log("Only one module is allowed: \"" + modname + "\" or \"" + arg + "\"");
    process.exit(1);
  }
  modname = arg;
}

if (!modname) { console.log("No module given"); process.exit(1); }

if (!mode && outfile) {
  var parts = outfile.split(".");
  if (parts.length > 1) {
    var ext = parts[parts.length-1];
    if (ext == "html") {
      mode = "html";
    } else if (ext == "js") {
      mode = "node";
    }
  }
}
if (!mode) mode = "node";

if (mode == "term") {
  modules["cobre\x1fsystem"].data["println"].macro = "println($1)";
  putln("function println (line) { document.getElementById('content').textContent += line + '\\n'; }");
}

if (mode == "node") {
  var orig = modules["cobre\x1fsystem"].data;
  modules["cobre\x1fsystem"] = new BaseModule({
    println: orig.println,
    error: orig.error,
    exit: macro("process.exit($1)", 1, 0),
    argc: macro("argv.length", 0, 1),
    argv: macro("argv[$1]", 1, 1),
  });
  modules["cobre\x1fio"] = new BaseModule({
    file: newType("file"),
    mode: newType("mode"),
    r: macro("'r'", 0, 1),
    w: macro("'w'", 0, 1),
    a: macro("'a'", 0, 1),
    open: macro("fs_open($1, $2)", 2, 1),
    close: macro("fs_close($1)", 1, 0),
    read: macro("fs_read($1, $2)", 2, 1),
    write: macro("fs_write($1, $2)", 2, 0),
    eof: macro("fs_eof($1)", 1, 1),
  });
  modules["cobre\x1fbuffer"] = new BaseModule({
    "new": macro("Buffer.alloc($1)", 1, 1),
    get: macro("$1[$2]", 2, 1),
    set: macro("$1[$2]=$3", 3, 0),
    size: macro("$1.length", 1, 1),
    readonly: macro("false", 1, 1),
  });
  modules["cobre\x1fstring"].data.tobuffer = macro("Buffer.from($1)", 1, 1)
  putln("var argv = process.argv.slice(1);")
  putln("const fs = require('fs');");
  putln("function fs_open (path, mode) { return {f: fs.openSync(path, mode), size: fs.statSync(path).size, pos: 0} }")
  putln("function fs_close (file) { fs.closeSync(file.f) }")
  putln("function fs_read (file, size) { var buf = Buffer.alloc(size); var redd = fs.readSync(file.f, buf, 0, size, file.pos); file.pos += redd; return buf.slice(0, redd); }")
  putln("function fs_write (file, buf) { var written = fs.writeSync(file.f, buf, 0, buf.length, file.pos); file.pos += written; }")
  putln("function fs_eof (file) { return file.pos >= file.size }")
}

var mainmodule = load_module(modname);
var mainfn = mainmodule.get("main");

putln("function goto (lbl) { throw new Error('goto ' + lbl); }")
putln("function error (msg) { throw new Error(msg); }");
putln("function charat (str, i) { return [str[i], i+1]; }");

for (var i = 0; i < toCompile.length; i++) {
  var fn = toCompile[i];
  fn.compile(writer);
}

for (var i = 0; i < toRun.length; i++) {
  var fn = toRun[i];
  putln(fn.name + "();");
}

//mainmodule.compile();
putln(mainfn.name + "();");

var output = writer.text;

if (mode == "html" || mode == "term") {
  var pre = "<!DOCTYPE html>\n" +
    "<html>\n<head>\n  <meta charset=\"utf-8\">\n</head>\n<body>\n";
  if (mode == "term") { pre += "<pre id=\"content\"></pre>\n"; }
  pre += "<script type=\"text/javascript\">\n";
  var post = "<" + "/script>\n<" + "/body>\n<" + "/html>";
  output = pre + output + post;
}

if (outfile) fs.writeFileSync(outfile, output);
else process.stdout.write(output);
