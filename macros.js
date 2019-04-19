
var state = require('./state.js')

var type_id = 0

var alphabet = ("abcdefghijklmnopqrstuvwxyz").split("")

function nativeType (name, is_class) {
  var test = is_class ?
    "$1 instanceof " + name :
    "typeof $1 === '" + name + "'"

  var tp = {
    name: name,
    id: type_id++,
    test: macro(test, 1, 1)
  }
  return tp
}

function wrapperType (name) {
  name = name

  var tp = {
    name: name,
    id: type_id++,
    wrap: macro("new " + name + "($1)", 1, 1),
    unwrap: macro("$1.val", 1, 1),
    test: macro("$1 instanceof " + name, 1, 1),
    compile: function (w) {
      w.write("var " + name + " = function (val) { this.val = val; }")
    }
  }

  state.toCompile.push(tp)
  return tp
}

function newType (name, line) {
  return {
    name: name,
    id: type_id++,
    compile: function (writer) {
      if (line) writer.write("var " + this.name + " = " + line + ";");
    }
  }
}

function BaseModule (modname, data) {
  this.data = data
  this.get = function (name) {
    var val = data[name]
    if (!val) throw new Error(name + " not found in " + modname)
    if (val.compile) state.toCompile.push(val)
    return val
  }
}



var auroConsts = {
  args: "typeof process == \"undefined\" ? process.argv.slice(1) : []",
  require: "function (name) {" +
    "\n  if (typeof require !== 'function') return null" +
    "\n  try { return require(name) }" +
    "\n  catch (e) {" +
    "\n  if (e.code === 'MODULE_NOT_FOUND') return null" +
    "\n    else throw e" +
    "\n  }" +
    "\n}",
  fs: "Auro.require('fs')",
  record: "function ()"
}

function useConsts (consts) {
  if (!consts) return
  consts.forEach(function (name) {
    var val = auroConsts[name]
    if (typeof val == "string") {
      val = {
        name: name,
        code: val,
        compile: function (w) {
          w.write("Auro." + this.name + " = " + this.code + ";")
        }
      }
      auroConsts[name] = val
      state.toCompile.push(val)
    }
  })
}

function auroFn (name, ins, outc, code, consts) {
  useConsts(consts)
  var fn = {
    type: "function",
    code: code,
    name: "Auro." + name,
    ins: new Array(ins.length),
    outs: new Array(outc),
    use: function (args) {
      return this.name + "(" + args.join(", ") + ")"
    },
    compile: function (writer) {
      writer.write("Auro." + name + " = function (" + ins.join(", ") + ") {")
      writer.indent()
      writer.append(code)
      writer.dedent()
      writer.write("}")
    }
  }
  return fn
}

function macro (str, inc, outc, consts) {
  useConsts(consts)
  var m = {
    type: "macro", macro: str,
    ins: new Array(inc), outs: new Array(outc),
    use: function (args) {
      var expr = this.macro;
      for (var i = 0; i < this.ins.length; i++) {
        var patt = new RegExp("\\$" + (i+1), "g");
        expr = expr.replace(patt, args[i]);
      }
      return expr;
    },
  }
  var args = alphabet.slice(0, inc)
  m.name = "(function (" + args.join(",") + ") {return " + m.use(args) + "})"
  return m
}

macro.id = macro("$1", 1, 1)

var recordcache = {}
var arraycache = {}
var arraylistcache = {}
var strmapcache = {}

var anyModule = new BaseModule("auro.any", { "any": newType("Auro.Any") })

var record_count = 0
var shell_count = 0

var macro_modules = {
  "auro\x1fbool": new BaseModule("auro.bool", {
    "bool": newType("Auro.Bool"),
    "true": macro("true", 0, 1),
    "false": macro("false", 0, 1),
    "not": macro("!$1", 1, 1),
  }),
  "auro\x1fsystem": new BaseModule("auro.system", {
    "println": macro("console.log($1)", 1, 0),
    "error": macro("Auro.system.error($1)", 1, 0),
    "exit": auroFn("exit", ["code"], 0, "if (typeof process !== \"undefined\") process.exit(code)\nelse throw \"Auro Exit with code \" + code"),
    argc: macro("Auro.args.length", 0, 1, ["args"]),
    argv: macro("Auro.args[$1]", 1, 1, ["args"]),
  }),
  "auro\x1fint": new BaseModule("auro.int", {
    "int": newType("Auro.Int"),
    "neg": macro("-($1)", 1, 1),
    "add": macro("($1 + $2)", 2, 1),
    "sub": macro("($1 - $2)", 2, 1),
    "mul": macro("($1 * $2)", 2, 1),
    "div": macro("(($1 / $2) | 0)", 2, 1),
    "mod": macro("($1 % $2)", 2, 1),
    "eq": macro("($1 == $2)", 2, 1),
    "ne": macro("($1 != $2)", 2, 1),
    "gt": macro("($1 > $2)", 2, 1),
    "lt": macro("($1 < $2)", 2, 1),
    "ge": macro("($1 >= $2)", 2, 1),
    "le": macro("($1 <= $2)", 2, 1),
    "gz": macro("($1 > 0)", 1, 1),
    "nz": macro("($1 != 0)", 1, 1),
  }),
  "auro\x1fint\x1fbit": new BaseModule("auro.int.bit", {
    "not": macro("~$1", 1, 1),
    "and": macro("($1 & $2)", 2, 1),
    "or": macro("($1 | $2)", 2, 1),
    "xor": macro("($1 ^ $2)", 2, 1),
    "eq": macro("~($1 ^ $2)", 2, 1),
    "shl": macro("($1 << $2)", 2, 1),
    "shr": macro("($1 >> $2)", 2, 1),
  }),
  "auro\x1ffloat": new BaseModule("auro.float", {
    "float": newType("Auro.Float"),
    "neg": macro("-($1)", 1, 1),
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
    "gz": macro("($1 > 0)", 1, 1),
    "nz": macro("($1 != 0)", 1, 1),
    "itof": macro("$1", 1, 1),
    "ftoi": macro("$1", 1, 1),
    "decimal": macro("Auro.Float.decimal($1, $2)", 2, 1),
    "nan": macro("NaN", 0, 1),
    "infinity": macro("Infinity", 0, 1),
    "isnan": macro("isNaN($1)", 0, 1),
    "isinfinity": macro("Auro.Float.isInfinite($1)", 1, 1),
  }),
  "auro\x1fstring": new BaseModule("auro.string", {
    "string": nativeType("string"),
    "new": auroFn("string_new", ["buf"], 1,
      "if (typeof buf === 'string') return buf" +
      "\nvar str = \"\"" +
      "\nfor (var i = 0; i < buf.length; i++)" +
      "\n  str += String.fromCharCode(buf[i])" +
      "\nreturn decodeURIComponent(escape(str))" ),
    "itos": macro("String($1)", 1, 1),
    "ftos": macro("String($1)", 1, 1),
    "concat": macro("($1 + $2)", 2, 1),
    "slice": macro("$1.slice($2, $3)", 3, 1),
    "add": macro("($1 + $2)", 2, 1),
    "eq": macro("($1 == $2)", 2, 1),
    "length": macro("$1.length", 1, 1),
    "charat": auroFn("charat", ["str", "i"], 2, "return [str[i], i+1]"),
    "newchar": macro("String.fromCharCode($1)", 1, 1),
    "codeof": macro("$1.charCodeAt(0)", 1, 1),
    "tobuffer": auroFn("str_tobuf", ["str"], 1,
      "str = unescape(encodeURIComponent(str))" +
      "\nvar buf = new Uint8Array(str.length)" +
      "\nfor (var i = 0; i < str.length; i++)" +
      "\n  buf[i] = str.charCodeAt(i)" +
      "\nreturn buf" ),
  }),
  "auro\x1fmath": new BaseModule("auro.math", {
    "pi": macro("Math.PI", 0, 1),
    "e": macro("Math.E", 0, 1),
    "sqrt2": macro("Math.SQRT2", 0, 1),
    "abs": macro("Math.abs($1)", 1, 1),
    "ceil": macro("Math.ceil($1)", 1, 1),
    "floor": macro("Math.floor($1)", 1, 1),
    "round": macro("Math.round($1)", 1, 1),
    "trunc": macro("Math.trunc($1)", 1, 1),
    "ln": macro("Math.log($1)", 1, 1),
    "exp": macro("Math.exp($1)", 1, 1),
    "sqrt": macro("Math.sqrt($1)", 1, 1),
    "cbrt": macro("Math.cbrt($1)", 1, 1),
    "pow": macro("Math.pow($1, $2)", 2, 1),
    "log": macro("(Math.log($1) / Math.log($2))", 2, 1),
    "mod": macro("($1 % $2)", 2, 1),
    "sin": macro("Math.sin($1)", 1, 1),
    "cos": macro("Math.cos($1)", 1, 1),
    "tan": macro("Math.tan($1)", 1, 1),
    "asin": macro("Math.asin($1)", 1, 1),
    "acos": macro("Math.acos($1)", 1, 1),
    "atan": macro("Math.atan($1)", 1, 1),
    "sinh": macro("Math.sinh($1)", 1, 1),
    "cosh": macro("Math.cosh($1)", 1, 1),
    "tanh": macro("Math.tanh($1)", 1, 1),
    "atan2": macro("Math.atan2($1, $2)", 2, 1),
  }),
  "auro\x1fbuffer": new BaseModule("auro.buffer", {
    buffer: newType("Auro.Buffer"),
    "new": macro("new Uint8Array($1)", 1, 1),
    get: macro("$1[$2]", 2, 1),
    set: macro("$1[$2]=$3", 3, 0),
    size: macro("$1.length", 1, 1),
    readonly: macro("false", 1, 1),
  }),
  "auro\x1fio": new BaseModule("auro.system", {
    r: macro("'r'", 0, 1),
    w: macro("'w'", 0, 1),
    a: macro("'a'", 0, 1),
    open: auroFn("io_open", ["path", "mode"], 1, "return {f: Auro.fs.openSync(path, mode), size: Auro.fs.statSync(path).size, pos: 0}", ["require", "fs"]),
    close: auroFn("io_close", ["file"], 1, "Auro.fs.closeSync(a.f)", ["require", "fs"]),
    read: auroFn("io_read", ["file", "size"], 1,
      "var buf = new Uint8Array(size)" +
      "\nvar redd = Auro.fs.readSync(file.f, buf, 0, size, file.pos)" +
      "\nfile.pos += redd" +
      "\nreturn buf.slice(0, redd)", ["require", "fs"]),
    write: auroFn("io_write", ["file", "buf"], 1,
      "var written = Auro.fs.writeSync(file.f, buf, 0, buf.length, file.pos)" +
      "\nfile.pos += written", ["require", "fs"]),
    eof: auroFn("io_eof", ["file"], 1, "return file.pos >= file.size"),
  }),
  "auro\x1farray": {build: function (arg) {
    var base = arg.get("0");
    var mod = arraycache[base.id];
    if (mod) return mod;
    var tp = newType(null, "new Auro.Array(" + base.name + ")");
    mod = new BaseModule("auro.array", {
      "": tp,
      "new": macro("new Array($2).fill($1)", 2, 1),
      "empty": macro("[]", 0, 1),
      "get": macro("$1[$2]", 2, 1),
      "set": macro("$1[$2] = $3", 3, 0),
      "len": macro("$1.length", 1, 1),
      "push": macro("$1.push($2)", 2, 0),
    });
    arraycache[base.id] = mod;
    return mod;
  } },
  "auro\x1fany": {
    build: function (arg) {
      var base = arg.get("0");
      if (!base) return anyModule;
      var id = base.id;
      return { "get": function (name) {
        if (name == "new") return base.wrap || macro.id
        if (name == "get") return base.unwrap  || macro.id
        if (name == "test") return base.test || macro("$1 instanceof " + base.name)
      } };
    },
    get: function (name) {
      if (name == "any") return anyModule.data.any;
    }
  },
  "auro\x1fnull": { build: function (arg) {
    var base = arg.get("0");
    var tp = newType("new Auro.Null(" + base.name + ")");
    return new BaseModule("auro.null", {
      "": tp,
      "null": macro("null", 0, 1),
      "new": macro("$1", 1, 1),
      "get": macro("$1", 1, 1),
      "isnull": macro("Auro.Null.isNull($1)", 1, 1),
    });
  } },
  "auro\x1frecord": { build: function (arg) {
    var arr = [];
    var names = [];
    var count = 0;
    while (true) {
      var a = arg.get(String(count));
      if (!a) break;
      arr.push(a.id);
      names.push(a.name);
      count++;
    }
    var id = arr.join(",");

    var mod = recordcache[id];
    if (mod) return mod;

    var tname = state.findName("record_" + type_id)
    var tp = {
      name: tname,
      id: type_id++,
      wrap: macro.id,
      unwrap: macro.id,
      test: macro("$1 instanceof " + tname, 1, 1),
      compile: function (w) {
        w.write("function " + tname + " (" + alphabet.slice(0, count).join(", ") + ") {")
        w.indent()
        for (var j = 0; j < count; j++) {
          var l = alphabet[j]
          w.write("this." + l + " = " + l + ";")
        }
        w.dedent()
        w.write("}")
      }
    }

    state.toCompile.push(tp)

    mod = { get: function (name) {
      if (name == "new") {
        var args = []
        for (var j = 1; j <= count; j++) args.push("$" + j)
        return macro("new " + tname + "(" + args.join(", ") + ")", count, 1)
      }
      var a = name.slice(0, 3);
      var n = name.slice(3);
      var l = alphabet[n]
      if (a == "") return tp;
      if (a == "get") return macro("$1." + l, 1, 1);
      if (a == "set") return macro("$1." + l + " = $2", 2, 0);
    } };

    recordcache[id] = mod;
    return mod;
  } },
  "auro\x1ftypeshell": {build: function (arg) {
    // Each time it's called, a new type is created
    var tname = state.findName("type_" + type_id++)
    var tp = wrapperType(tname)
    return new BaseModule("auro.typeshell", {
      "": tp,
      "new": macro.id,
      "get": macro.id,
    });
  } },
  "auro\x1ffunction": { build: function (arg) {
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

    var tp = newType(null, "new Auro.Function([" + innames.join(",") + "], [" + outnames.join(",") + "])");

    var argnames = alphabet.slice(0, inlist.length)

    function createDefinition (fn, last) {
      var args = argnames.slice()
      if (last) args.push(last)
      return "(function (" + argnames.join(",") + ") {return " + fn.use(args) + "})"
    }

    mod = new BaseModule("auro.function", {
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

        return new BaseModule("function", {"": {
          ins: inlist,
          outs: outlist,
          use: function (fargs) { return fn.name }
        }})
      } },
      closure: {
        name: "Auro.Closure",
        build: function (args) {
          var fn = args.get("0")

          return new BaseModule("closure", {"new": {
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
  "auro\x1futils\x1fstringmap": {build: function (arg) {
    var base = arg.get("0");
    var mod = strmapcache[base.id];
    if (mod) return mod;
    var tp = newType(null, "new Auro.StringMap(" + base.name + ")");
    var itertp = newType(null, "new Auro.StringMap.Iterator(" + base.name + ")")
    mod = new BaseModule("auro.utils.stringmap", {
      "": tp,
      "iterator": itertp,
      "new": macro("{}", 0, 1),
      "get": macro("$1[$2]", 2, 1),
      "set": macro("$1[$2]=$3", 3, 0),
      "remove": macro("delete $1[$2]", 3, 0),
      "new\x1diterator": macro("Auro.StringMap.Iterator.$new($1)", 1, 1),
      "next\x1diterator": macro("$1.next()", 1, 1),
    })
    strmapcache[base.id] = mod;
    return mod;
  } },
  "auro\x1futils\x1farraylist": {build: function (arg) {
    var base = arg.get("0");
    var mod = arraylistcache[base.id];
    if (mod) return mod;

    var name = state.findName("ArrayList_" + base.name)
    var tp = wrapperType(name)
    mod = new BaseModule("auro.utils.arraylist", {
      "": tp,
      "new": macro("[]", 0, 1),
      "get": macro("$1[$2]", 2, 1),
      "set": macro("$1[$2]=$3", 3, 0),
      "len": macro("$1.length", 1, 1),
      "push": macro("$1.push($2)", 2, 0),
      "remove": macro("$1.splice($2, 1)", 2, 0),
    });
    arraylistcache[base.id] = mod;
    return mod;
  } },
}

exports.macro = macro
exports.modules = macro_modules