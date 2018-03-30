
const fs = require("fs");

const parse = require("./parse.js");

var output = "";

function putln (str) {
  output += str + "\n";
}

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
      f = new Code(fn, n);
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

  function Code (fn, index) {
    this.index = index;
    this.name = "fn" + toCompile.length;
    this.type = "code";
    this.ins = fn.ins;
    this.outs = fn.outs;

    this.compile = function () {
      var lbls = [];
      var regs = fn.ins.length;
      for (var i = 0; i < fn.code.length; i++) {
        var inst = fn.code[i];
        var k = inst.type;
        if (k == "var") regs++;
        if (k == "dup") inst.out = regs++;
        if (k == "jmp") lbls.push(inst.a);
        if (k == "jif") lbls.push(inst.a);
        if (k == "nif") lbls.push(inst.a);
        if (k == "call") {
          var ff = get_function(inst.index);
          inst.outs = [];
          for (var j = 0; j < ff.outs.length; j++) {
            inst.outs.push(regs++);
          }
        }
      }

      for (var i = 0; i < lbls.length; i++) {
        if (fn.code[lbls[i]]) {
          fn.code[lbls[i]].lbl = true;
        }
      }
      fn.code[0].lbl = true;

      var args = "";
      for (var i = 0; i < fn.ins.length; i++) {
        if (i>0) args += ", ";
        args += "reg_" + i;
      }
      putln("function " + this.name + "(" + args + ") {");
      if (sourcemap[this.index]) {
        var pos = sourcemap[this.index];
        putln("  // function " + pos.name + ", at file " + pos.file)
      }

      var decl = "  var _result"
      for (var i = fn.ins.length; i < regs; i++) {
        decl += ", reg_" + i;
      }
      putln(decl + ";");

      putln("  var _lbl = 0;");
      putln("  while (true) {");
      putln("  switch (_lbl) {");

      function reg (n) { return "reg_" + n; }

      for (var i = 0; i < fn.code.length; i++) {
        var inst = fn.code[i];
        if (inst.lbl) putln("  case " + i + ":");
        var k = inst.type;
        if (k == "dup") putln("  " + reg(inst.out) + " = " + reg(inst.a) + ";");
        if (k == "set") putln("  " + reg(inst.a) + " = " + reg(inst.b) + ";");
        if (k == "jmp") putln("  _lbl = " + inst.a + "; break;");
        if (k == "jif") putln("  if (" + reg(inst.b) + ") { _lbl = " + inst.a + "; break; }");
        if (k == "nif") putln("  if (!" + reg(inst.b) + ") { _lbl = " + inst.a + "; break; }");
        if (k == "call") {
          var ff = get_function(inst.index);
          var args = inst.args.map(function (x) {return reg(x);});
          var expr = ff.use(args);
          switch (inst.outs.length) {
            case 0: putln("  " + expr + ";"); break;
            case 1: putln("  " + reg(inst.outs[0]) + " = " + expr + ";"); break;
            default:
              putln("  _result = " + expr + ";")
              for (var j = 0; j < inst.outs.length; j++) {
                putln("  " + reg(inst.outs[j]) + " = _result[" + j + "];");
              }
          }
        }
        if (k == "end") {
          var expr;
          switch (inst.args.length) {
            case 0: expr = ""; break;
            case 1: expr = reg(inst.args[0]); break;
            default: expr = "[" + inst.args.map(function (a) {return reg(a);}).join(", ") + "]";
          }
          putln("  return " + expr + ";");
        }
      }

      putln("  }");
      //putln("  throw new Error('Function does not return');")
      putln("  }");
      putln("}");
    }

    this.use = function (args) {
      return this.name + "(" + args.join(", ") + ")"
    }
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

var modules = {
  "cobre.core": new BaseModule({
    "bool": newType("bool"),
    "bin": newType("bin"),
    "any": newType("any"),
  }),
  "cobre.system": new BaseModule({
    "print": macro("console.log($1)", 1, 0),
    "error": macro("_error($1)", 1, 0),
  }),
  "cobre.int": new BaseModule({
    "int": newType("int"),
    "add": macro("($1 + $2)", 2, 1),
    "sub": macro("($1 - $2)", 2, 1),
    "mul": macro("($1 * $2)", 2, 1),
    "div": macro("($1 / $2)", 2, 1),
    "eq": macro("($1 == $2)", 2, 1),
    "ne": macro("($1 != $2)", 2, 1),
    "gt": macro("($1 > $2)", 2, 1),
    "lt": macro("($1 < $2)", 2, 1),
    "gte": macro("($1 >= $2)", 2, 1),
    "lte": macro("($1 <= $2)", 2, 1),
  }),
  "cobre.string": new BaseModule({
    "string": newType("string"),
    "new": macro("$1", 1, 1),
    "itos": macro("String($1)", 1, 1),
    "concat": macro("($1 + $2)", 2, 1),
    "add": macro("($1 + $2)", 2, 1),
    "eq": macro("($1 == $2)", 2, 1),
    "length": macro("$1.length", 1, 1),
    "charat": macro("[$1[$2], $2+1]", 2, 2),
    "newchar": macro("String.fromCharCode($1)", 1, 1),
    "codeof": macro("$1.charCodeAt(0)", 1, 1),
  }),
  "cobre.array": {build: function (arg) {
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
  "cobre.any": { build: function (arg) {
    var base = arg.get("0");
    var id = base.id;
    return { "get": function (name) {
      if (name == "new") return macro("{val: $1, tp: " + id + "}", 1, 1);
      if (name == "test") return macro("($1.tp == " + id + ")", 1, 1);
      if (name == "get") return macro("$1.val", 1, 1);
    } };
  } },
  "cobre.null": { build: function (arg) {
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
  "cobre.record": { build: function (arg) {
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
  "cobre.typeshell": {build: function (arg) {
    // Each time it's called, a new type is created
    return new BaseModule({
      "": newType("typeshell"),
      "new": macro("$1", 1, 1),
      "get": macro("$1", 1, 1),
    });
  } },
};

modules["cobre.string"].data["new"].pure = true;

function readModule (filename, name) {
  var data = parse(fs.readFileSync(filename));
  var mod = Parsed(data, name);
  modules[name] = mod;
  return mod;
}

function load_module (name) {
  if (modules[name] !== undefined) return modules[name];

  var filename = "./" + name;
  if (fs.existsSync(filename)) return readModule(filename, name);

  filename = process.env.HOME + "/.cobre/modules/" + name;
  if (fs.existsSync(filename)) return readModule(filename, name);

  throw new Error("Cannot load module " + name);
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
  modules["cobre.system"].data["print"].macro = "_print($1)";
  putln("function _print (line) { document.getElementById('content').textContent += line + '\\n'; }");
}

if (mode == "node") {
  var orig = modules["cobre.system"].data;
  modules["cobre.system"] = new BaseModule({
    print: orig.print,
    error: orig.error,
    file: newType("file"),
    readall: macro("fs.readFileSync($1, 'utf8')", 1, 1),
    quit: macro("process.exit($1)", 1, 0),
    argc: macro("argv.length", 0, 1),
    args: macro("argv[$1]", 1, 1),
    open: macro("fs.openSync($1, $2)", 2, 1),
    write: macro("fs.writeSync($1, $2)", 2, 0),
    writebyte: macro("fs.writeSync($1, Buffer.from([$2]))", 2, 0),
  });
  putln("var argv = process.argv.slice(1);")
  putln("const fs = require('fs');");
  putln("function readByte (f) {}");
}

var mainmodule = load_module(modname);
var mainfn = mainmodule.get("main");

putln("function _error (msg) { throw new Error(msg); }");

for (var i = 0; i < toCompile.length; i++) {
  var fn = toCompile[i];
  fn.compile();
}

for (var i = 0; i < toRun.length; i++) {
  var fn = toRun[i];
  putln(fn.name + "();");
}

//mainmodule.compile();
putln(mainfn.name + "();");

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
