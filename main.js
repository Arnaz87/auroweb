
const fs = require("fs");

const parse = require("./parse.js");
const writer = require("./writer.js")();
const Code = require("./code.js");

function putln (str) { writer.write(str); }

var toCompile = [];
var toRun = [];

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
    if (mdata.type == "import" || mdata.type == "functor") {
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
      };
      mod.build = function () { throw new Exception("module is not a functor"); }
      modcache[n] = mod;
      return mod;
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
      f.name = "fn_" + toCompile.length;
      toCompile.push(f);
    } else if (fn.type == "int") {
      f = macro(String(fn.value), 0, 1);
    } else if (fn.type == "bin") {
      var str = "\"";
      for (var j = 0; j < fn.data.length; j++) {
        var char = String.fromCharCode(fn.data[j]);
        if (char == '"') char = "\\\"";
        if (char == "\n") char = "\\n";
        str += char;
      }
      str += "\"";
      f = macro(str, 0, 1);
    } else if (fn.type == "call") {
      var cfn = get_function(fn.index);
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

  function nget (node, name) {
    if (node instanceof Object) {
      for (k in node) {
        var x = node[k];
        if (x instanceof Object && x[0] === name) {
          return x;
        }
      }
    }
  }

  var srcnode = nget(parsed.metadata, "source map");
  if (srcnode) {
    var file = nget(srcnode, "file")[1];
    for (var i = 1; i < srcnode.length; i++) {
      var item = srcnode[i]
      if (item[0] == "function") {
        var index = item[1];
        sourcemap[index] = {
          file: file,
          name: nget(item, "name")[1],
          line: nget(item, "line")[1],
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
    "new": macro("$1", 1, 1),
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
  "cobre\x1fany": { build: function (arg) {
    var base = arg.get("0");
    if (!base) return anyModule;
    var id = base.id;
    return { "get": function (name) {
      if (name == "new") return macro("{val: $1, tp: " + id + "}", 1, 1);
      if (name == "test") return macro("($1.tp == " + id + ")", 1, 1);
      if (name == "get") return macro("$1.val", 1, 1);
    } };
  } },
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
};

modules["cobre\x1fstring"].data["new"].pure = true;

function readModule (filename, name) {
  var data = parse(fs.readFileSync(filename));
  var mod = Parsed(data, name);
  modules[name] = mod;
  return mod;
}

function load_module (name) {
  if (modules[name] !== undefined) return modules[name]

  var escaped = name.replace(/\x1f/g, ".")
  var filename = "./" + escaped
  if (fs.existsSync(filename)) return readModule(filename, name)

  filename = process.env.HOME + "/.cobre/modules/" + escaped
  if (fs.existsSync(filename)) return readModule(filename, name)

  throw new Error("Cannot load module " + name)
}

function usage () {
  console.log("Usage: " + process.argv0 + " " + argv[1] + " [options] <module>");
  console.log("\n    Reads the node module and outputs the compiled javascript code to stdout.\n");
  console.log("Options:");
  console.log("  -h --help     displays this message");
  console.log("  -o <file>     outputs the compiled code to a file instead of stdout");
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
    file: newType("file"),
    readall: macro("fs.readFileSync($1, 'utf8')", 1, 1),
    exit: macro("process.exit($1)", 1, 0),
    argc: macro("argv.length", 0, 1),
    argv: macro("argv[$1]", 1, 1),
    open: macro("fs.openSync($1, $2)", 2, 1),
    write: macro("fs.writeSync($1, $2)", 2, 0),
    writebyte: macro("fs.writeSync($1, Buffer.from([$2]))", 2, 0),
  });
  putln("var argv = process.argv.slice(1);")
  putln("const fs = require('fs');");
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
