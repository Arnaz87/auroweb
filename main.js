
const fs = require("fs");

const Writer = require("./writer.js")
const compiler = require("./compiler.js")

function usage () {
  console.log("Usage: " + process.argv0 + " " + argv[1] + " [options] <module>");
  console.log("\n    Reads the node module and outputs the compiled javascript code to stdout.\n");
  console.log("Options:");
  console.log("  -h --help     displays this message");
  console.log("  -o <file>     outputs the compiled code to a file instead of stdout");
  console.log("  --dir         adds the directory to the module search");
  console.log("  --lib         outputs a browser library");
  console.log("  --node        outputs a node js executable");
  console.log("  --html        outputs an html file that executes the code in the page");
  console.log("  --term        outputs an html file whose body acts like a terminal");
  console.log("  --nodelib     outputs a node js library");
  process.exit(0);
}

var paths = [process.env.HOME + "/.cobre/modules/", "./"]

var modMap = {
  "cobre\x1fio": true,
  "cobre\x1fbuffer": true,
  "cobre\x1fsystem": true,
}

var writer = new Writer();

function load_module (name) {


  if (modMap[name]) return
  var escaped = name.replace(/\x1f/g, ".")

  for (var i = paths.length-1; i >= 0; i--) {
    var filename = paths[i] + escaped
    if (fs.existsSync(filename)) {
      console.log("Getting module", name, "at", filename)
      modMap[name] = true
      var src = fs.readFileSync(filename)
      var text = compiler.compile(src, name)
      writer.append(text)
      return
    }
  }

  throw new Error("Cannot load module " + name)
}

compiler.setModuleLoader(load_module)

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
  if (arg == "--dir") { paths.push(argv[++i].replace(/\/?$/, "/")); continue; }
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

/*
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
*/

writer.write("var Cobre = require('./cobre.js');")

modname = modname.replace(/\./g, "\x1f")
load_module(modname)

writer.write("var main = Cobre.$import(", compiler.escape(modname), ").get('main');")
writer.write("main();")

output = writer.text

/*
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
*/

if (outfile) fs.writeFileSync(outfile, output);
else process.stdout.write(output);
