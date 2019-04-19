
const fs = require("fs");

const Writer = require("./writer.js")
const compiler = require("./compiler.js")
const macros = require("./macros.js")
const state = require("./state.js")

function usage () {
  console.log("Usage: " + process.argv0 + " " + argv[1] + " [options] <module>");
  console.log("\n    Reads the node module and outputs the compiled javascript code to stdout.\n");
  console.log("Options:");
  console.log("  -h --help     displays this message")
  console.log("  -o <file>     outputs the compiled code to a file instead of stdout")
  console.log("  --dir         adds the directory to the module search")
  console.log("  --include     compile all found dependencies into the file")
  console.log("  --node        outputs a node js executable")
  process.exit(0)
}

var paths = [process.env.HOME + "/.auro/modules/", "./"]

var modules = state.modules

for (var name in macros.modules) {
  modules[name] = macros.modules
}

var include = false

function load_module (name) {
  if (modules[name]) return modules[name]

  var escaped = name.replace(/\x1f/g, ".")

  for (var i = paths.length-1; i >= 0; i--) {
    var filename = paths[i] + escaped
    if (fs.existsSync(filename)) {
      var src = fs.readFileSync(filename)
      return modules[name] = compiler.getModule(src, name)
    }
  }

  throw new Error("module " + name + " not found")
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
  if (arg == "--include") { include = true; continue; }
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

modname = modname.replace(/\./g, "\x1f")
var main_mod = load_module(modname, true)
var main_fn = main_mod.get("main")

var writer = new Writer()
writer.write("var Auro = typeof Auro == 'undefined' ? {} : Auro;")

state.toCompile.forEach(function (item) {
  if (item.compile) item.compile(writer)
})

writer.write(main_fn.use([]))

if (outfile) fs.writeFileSync(outfile, writer.text)
else process.stdout.write(writer.text)
