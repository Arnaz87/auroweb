
var state = require('./state.js')

var type_id = 0

var alphabet = "abcdefghijklmnopqrstuvwxyz"

function alphanum (n) {
  var a = alphabet[n%26]
  if (n >= 26) {
    a = alphanum(Math.floor(n/26)-1) + a
  }
  return a
}

function alphaslice (n) {
  var arr = []
  for (var i = 0; i < n; i++) {
    arr.push(alphanum(i))
  }
  return arr
}

function nativeType (name, is_class) {
  var tp = {
    name: name,
    id: type_id++,
    test: is_class ? null :
      macro("(typeof #1 === '" + name + "')", 1, 1)
  }
  return tp
}

function wrapperType (name) {
  name = name

  var tp = {
    name: name,
    id: type_id++,
    wrap: macro("new " + name + "(#1)", 1, 1),
    unwrap: macro("#1.val", 1, 1),
    compile: function (w) {
      w.write("var " + name + " = function (val) { this.val = val; }")
    }
  }

  state.toCompile.push(tp)
  return tp
}

function BaseModule (modname, data) {
  this.data = data
  this.get = function (name) {
    var val = data[name]
    if (!val) throw new Error(name + " not found in " + modname)
    if (typeof val == "function") {
      val = val()
      data[name] = val
    }
    if (val.compile) state.toCompile.push(val)
    return val
  }
}

function paramModule (mod) {
  mod._build = mod.build
  mod.cache = {}

  if (!mod.get_id) mod.get_id = function (arg) { return arg.get("0").id }

  mod.build = function (arg) {
    var id = this.get_id(arg)
    var mod = this.cache[id]
    if (!mod) {
      mod = this._build(arg, id)
      this.cache[id] = mod
    }
    return mod
  }
  return mod
}



var auroConsts = {
  args: "typeof process == \"undefined\" ? [] : process.argv.slice(1)",
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
        var patt = new RegExp("#" + (i+1) + "(?!\\d)", "g")
        expr = expr.replace(patt, args[i]);
      }
      return expr;
    },
  }
  var args = alphaslice(inc)
  m.name = "(function (" + args.join(",") + ") {return " + m.use(args) + "})"
  return m
}

macro.id = macro("#1", 1, 1)

var recordcache = {}
var arraylistcache = {}

var macro_modules = {
  "auro\x1fbool": new BaseModule("auro.bool", {
    "bool": nativeType("boolean"),
    "true": macro("true", 0, 1),
    "false": macro("false", 0, 1),
    "not": macro("!#1", 1, 1),
  }),
  "auro\x1fsystem": new BaseModule("auro.system", {
    "println": macro("console.log(#1)", 1, 0),
    "error": macro("throw new Error(#1)", 1, 0),
    "exit": auroFn("exit", ["code"], 0, "if (typeof process !== \"undefined\") process.exit(code)\nelse throw \"Auro Exit with code \" + code"),
    argc: macro("Auro.args.length", 0, 1, ["args"]),
    argv: macro("Auro.args[#1]", 1, 1, ["args"]),
  }),
  "auro\x1fint": new BaseModule("auro.int", {
    "int": wrapperType("Integer"),
    "neg": macro("-(#1)", 1, 1),
    "add": macro("(#1 + #2)", 2, 1),
    "sub": macro("(#1 - #2)", 2, 1),
    "mul": macro("(#1 * #2)", 2, 1),
    "div": macro("((#1 / #2) | 0)", 2, 1),
    "mod": macro("(#1 % #2)", 2, 1),
    "eq": macro("(#1 == #2)", 2, 1),
    "ne": macro("(#1 != #2)", 2, 1),
    "gt": macro("(#1 > #2)", 2, 1),
    "lt": macro("(#1 < #2)", 2, 1),
    "ge": macro("(#1 >= #2)", 2, 1),
    "le": macro("(#1 <= #2)", 2, 1),
    "gz": macro("(#1 > 0)", 1, 1),
    "nz": macro("(#1 != 0)", 1, 1),
  }),
  "auro\x1fint\x1fbit": new BaseModule("auro.int.bit", {
    "not": macro("~#1", 1, 1),
    "and": macro("(#1 & #2)", 2, 1),
    "or": macro("(#1 | #2)", 2, 1),
    "xor": macro("(#1 ^ #2)", 2, 1),
    "eq": macro("~(#1 ^ #2)", 2, 1),
    "shl": macro("(#1 << #2)", 2, 1),
    "shr": macro("(#1 >> #2)", 2, 1),
  }),
  "auro\x1ffloat": new BaseModule("auro.float", {
    "float": nativeType("number"),
    "neg": macro("-(#1)", 1, 1),
    "add": macro("(#1 + #2)", 2, 1),
    "sub": macro("(#1 - #2)", 2, 1),
    "mul": macro("(#1 * #2)", 2, 1),
    "div": macro("(#1 / #2)", 2, 1),
    "eq": macro("(#1 == #2)", 2, 1),
    "ne": macro("(#1 != #2)", 2, 1),
    "gt": macro("(#1 > #2)", 2, 1),
    "lt": macro("(#1 < #2)", 2, 1),
    "ge": macro("(#1 >= #2)", 2, 1),
    "le": macro("(#1 <= #2)", 2, 1),
    "gz": macro("(#1 > 0)", 1, 1),
    "nz": macro("(#1 != 0)", 1, 1),
    "itof": macro("#1", 1, 1),
    "ftoi": macro("#1", 1, 1),
    "decimal": macro("Auro.Float.decimal(#1, #2)", 2, 1),
    "nan": macro("NaN", 0, 1),
    "infinity": macro("Infinity", 0, 1),
    "isnan": macro("isNaN(#1)", 0, 1),
    "isinfinity": macro("Auro.Float.isInfinite(#1)", 1, 1),
  }),
  "auro\x1fstring": new BaseModule("auro.string", {
    "string": nativeType("string"),
    // TODO: This is fragile with wrong utf8 strings
    "new": auroFn("string_new", ["buf"], 1,
      "if (typeof buf === 'string') return buf" +
      "\nvar codes = []" +
      "\nfor (var j = 0; j < buf.length; j++) {" +
      "\n  var c = buf[j]" +
      "\n  if (c > 0xEF) {" +
      "\n    c = (c & 0xF) << 0x12 | (buf[++j] & 0x3F) << 0xC | (buf[++j] & 0x3F) << 0x6 | (buf[++j] & 0x3F)" +
      "\n  } else if (c > 0xDF) {" +
      "\n    c = (c & 0xF) << 0xC | (buf[++j] & 0x3F) << 0x6 | (buf[++j] & 0x3F)" +
      "\n  } else if (c > 0xBF) {" +
      "\n    c = (c & 0x1F) << 0x6 | (buf[++j] & 0x3F)" +
      "\n  }" +
      "\n  if (c > 0xFFFF) {" +
      "\n    c -= 0x10000" +
      "\n    codes.push(c >>> 10 & 0x3FF | 0xD800)" +
      "\n    codes.push(0xDC00 | c & 0x3FF)" +
      "\n  } else {" +
      "\n    codes.push(c)" +
      "\n  }" +
      "\n}" +
      "\nreturn String.fromCharCode.apply(String, codes)"),
    "itos": macro("String(#1)", 1, 1),
    "ftos": macro("String(#1)", 1, 1),
    "concat": macro("(#1 + #2)", 2, 1),
    "slice": macro("#1.slice(#2, #3)", 3, 1),
    "add": macro("(#1 + #2)", 2, 1),
    "eq": macro("(#1 == #2)", 2, 1),
    "length": macro("#1.length", 1, 1),
    "charat": auroFn("charat", ["str", "i"], 2, "return [str[i], i+1]"),
    "newchar": macro("String.fromCharCode(#1)", 1, 1),
    "codeof": macro("#1.charCodeAt(0)", 1, 1),
    "tobuffer": auroFn("str_tobuf", ["str"], 1,
      "bytes = []" +
      "\nfor (var i = 0; i < str.length; i++) {" +
      "\n  var c = str.charCodeAt(i)" +
      "\n  if (c >= 0xD800 && c <= 0xDFFF) {" +
      "\n    c = (c - 0xD800 << 10 | str.charCodeAt(++i) - 0xDC00) + 0x10000" +
      "\n  }" +
      "\n  if (c < 0x80) {" +
      "\n    bytes.push(c)" +
      "\n  } else if (c < 0x800) {" +
      "\n    bytes.push(c >> 0x6 | 0xC0, c & 0x3F | 0x80)" +
      "\n  } else if (c < 0x10000) {" +
      "\n    bytes.push(c >> 0xC | 0xE0, c >> 0x6 & 0x3F | 0x80, c & 0x3F | 0x80)" +
      "\n  } else {" +
      "\n    bytes.push(c >> 0x12 | 0xF0, c >> 0xC & 0x3F | 0x80, c >> 0x6 & 0x3F | 0x80, c & 0x3F | 0x80)" +
      "\n  }" +
      "\n}" +
      "\nreturn Uint8Array.from(bytes)"),
  }),
  "auro\x1fmath": new BaseModule("auro.math", {
    "pi": macro("Math.PI", 0, 1),
    "e": macro("Math.E", 0, 1),
    "sqrt2": macro("Math.SQRT2", 0, 1),
    "abs": macro("Math.abs(#1)", 1, 1),
    "ceil": macro("Math.ceil(#1)", 1, 1),
    "floor": macro("Math.floor(#1)", 1, 1),
    "round": macro("Math.round(#1)", 1, 1),
    "trunc": macro("Math.trunc(#1)", 1, 1),
    "ln": macro("Math.log(#1)", 1, 1),
    "exp": macro("Math.exp(#1)", 1, 1),
    "sqrt": macro("Math.sqrt(#1)", 1, 1),
    "cbrt": macro("Math.cbrt(#1)", 1, 1),
    "pow": macro("Math.pow(#1, #2)", 2, 1),
    "log": macro("(Math.log(#1) / Math.log(#2))", 2, 1),
    "mod": macro("(#1 % #2)", 2, 1),
    "sin": macro("Math.sin(#1)", 1, 1),
    "cos": macro("Math.cos(#1)", 1, 1),
    "tan": macro("Math.tan(#1)", 1, 1),
    "asin": macro("Math.asin(#1)", 1, 1),
    "acos": macro("Math.acos(#1)", 1, 1),
    "atan": macro("Math.atan(#1)", 1, 1),
    "sinh": macro("Math.sinh(#1)", 1, 1),
    "cosh": macro("Math.cosh(#1)", 1, 1),
    "tanh": macro("Math.tanh(#1)", 1, 1),
    "atan2": macro("Math.atan2(#1, #2)", 2, 1),
  }),
  "auro\x1fbuffer": new BaseModule("auro.buffer", {
    buffer: nativeType("Uint8Array", true),
    "new": macro("new Uint8Array(#1)", 1, 1),
    get: macro("#1[#2]", 2, 1),
    set: macro("#1[#2]=#3", 3, 0),
    size: macro("#1.length", 1, 1),
    readonly: macro("false", 1, 1),
  }),
  "auro\x1fio": new BaseModule("auro.system", {
    file: wrapperType("File"),
    r: macro("'r'", 0, 1),
    w: macro("'w'", 0, 1),
    a: macro("'a'", 0, 1),
    open: auroFn("io_open", ["path", "mode"], 1, "return {f: Auro.fs.openSync(path, mode), size: Auro.fs.statSync(path).size, pos: 0}", ["require", "fs"]),
    close: auroFn("io_close", ["file"], 0, "Auro.fs.closeSync(file.f)", ["require", "fs"]),
    read: auroFn("io_read", ["file", "size"], 1,
      "var buf = new Uint8Array(size)" +
      "\nvar redd = Auro.fs.readSync(file.f, buf, 0, size, file.pos)" +
      "\nfile.pos += redd" +
      "\nreturn buf.slice(0, redd)", ["require", "fs"]),
    write: auroFn("io_write", ["file", "buf"], 0,
      "var written = Auro.fs.writeSync(file.f, buf, 0, buf.length, file.pos)" +
      "\nfile.pos += written", ["require", "fs"]),
    eof: auroFn("io_eof", ["file"], 1, "return file.pos >= file.size"),
  }),
  "auro\x1farray": paramModule({
    build: function (arg) {
      var base = arg.get("0")
      var tp = wrapperType("Array_" + base.name);
      return  new BaseModule("auro.array", {
        "": tp,
        "new": macro("new Array(#2).fill(#1)", 2, 1),
        "empty": macro("[]", 0, 1),
        "get": macro("#1[#2]", 2, 1),
        "set": macro("#1[#2] = #3", 3, 0),
        "len": macro("#1.length", 1, 1),
        "push": macro("#1.push(#2)", 2, 0),
      });
    }
  }),
  "auro\x1fany": paramModule({
    base_mod: new BaseModule("auro.any", {
      "any": {
        name: "any",
        id: type_id++,
        test: macro("true")
      }
    }),
    build: function (arg) {
      var base = arg.get("0");
      if (!base) return this.base_mod;
      var id = base.id;
      return { "get": function (name) {
        if (name == "new") return base.wrap || macro.id
        if (name == "get") return base.unwrap  || macro.id
        if (name == "test") return base.test || macro("(#1 instanceof " + base.name + ")", 1, 1)
      } };
    },
    get: function (name) {
      if (name == "any") return this.base_mod.data.any;
    }
  }),
  "auro\x1fnull": paramModule({ build: function (arg) {
    var base = arg.get("0");
    var tp = wrapperType(state.findName("Null_" + base.name));
    return new BaseModule("auro.null", {
      "": tp,
      "null": macro("null", 0, 1),
      "new": macro.id,
      "get": macro.id,
      // null and undefined are loosely equals, so this tests both
      "isnull": macro("(#1 == null)", 1, 1),
    });
  } }),
  "auro\x1frecord": paramModule({
    get_id: function (arg) {
      var arr = [];
      var count = 0;
      while (true) {
        var a = arg.get(String(count));
        if (!a) break;
        arr.push(a.id);
        count++;
      }
      return arr.join(",");
    },
    build: function (arg, id) {
      var count = id.split(",").length
      var tname = state.findName("record_" + type_id)
      var tp = wrapperType(tname)

      var fields = []
      for (var i = 0; i < count; i++) {
        fields.push(alphanum(i) + ": #" + (i+1))
      }
      var new_macro = macro("{" + fields.join(", ") + "}", count, 1)

      return { get: function (name) {
        if (name == "new") return new_macro
        if (name == "") return tp;
        
        var a = name.slice(0, 3);
        var n = name.slice(3);
        var l = alphanum(n)
        if (a == "get") return macro("#1." + l, 1, 1);
        if (a == "set") return macro("#1." + l + " = #2", 2, 0);
      } };
    }
  }),
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
  "auro\x1ffunction": paramModule({
    get_id: function (arg) {
      var inlist = [];
      var innames = [];
      var outlist = [];
      var outnames = [];

      var i = 0;
      while (true) {
        var a = arg.get("in" + String(i));
        if (!a) break;
        inlist.push(a.id);
        i++;
      }

      var i = 0;
      while (true) {
        var a = arg.get("out" + String(i));
        if (!a) break;
        outlist.push(a.id);
        i++;
      }

      return inlist.join(",") + ":" + outlist.join(",");
    },
    build: function (arg, id) {

      var sig = id.split(":").map(function (l) {
        if (l == "") return []
        return l.split(",").map(parseInt)
      })
      var inlist = sig[0]
      var outlist = sig[1]

      var tp = wrapperType(state.findName("Function$" + type_id))

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
            ins: [],
            outs: [0],
            use: function (fargs) { return fn.name }
          }})
        } },
        closure: {
          name: "Auro.Closure",
          build: function (args) {
            var fn = args.get("0")

            return new BaseModule("closure", {"new": {
              ins: inlist.slice(0, -1),
              outs: [0],
              use: function (fargs) {
                var args = alphaslice(inlist.length)
                var inargs = args.join(",")
                args.push("this")
                var fnargs = args.join(",")

                var def = "(function (" + inargs + ") { return " + fn.name + "(" + fnargs + ") })"
                return def + ".bind(" + fargs[0] + ")"
              }
            }});
          }
        }
      });
      mod.name = "function" + tp.name
      return mod;
    }
  }),
  "auro\x1futils\x1fstringmap": paramModule({
    build: function (arg) {
      var base = arg.get("0")
      var tp = wrapperType(state.findName("StringMap_" + base.name));

      var itertp = {
        name: state.findName("StringMapIter_" + base.name),
        id: type_id++,
        compile: function (w) {
          w.write("function " + this.name + " (map) {")
          w.indent()
          w.write("this.map = map")
          w.write("this.i = 0")
          w.write("this.keys = Object.keys(map)")
          w.dedent()
          w.write("}")

          w.write(this.name + ".prototype.next = function () {")
          w.indent()
          w.write("if (this.i >= this.keys.length) return null")
          w.write("var k = this.keys[this.i++]")
          w.write("return {a: k, b: this.map[k]}")
          w.dedent()
          w.write("}")
        }
      }

      function iterfn () {
        
      }

      return new BaseModule("auro.utils.stringmap", {
        "": tp,
        "iterator": itertp,
        "new": macro("{}", 0, 1),
        "get": macro("#1[#2]", 2, 1),
        "set": macro("#1[#2] = #3", 3, 0),
        "remove": macro("delete #1[#2]", 2, 0),
        "new\x1diterator": macro("new " + itertp.name + "(#1)", 1, 1),
        "next\x1diterator": macro("#1.next()", 1, 1),
      })
    }
  }),
  "auro\x1futils\x1farraylist": paramModule({
    build: function (arg) {
      var base = arg.get("0");

      var name = state.findName("ArrayList_" + base.name)
      var tp = wrapperType(name)
      return new BaseModule("auro.utils.arraylist", {
        "": tp,
        "new": macro("[]", 0, 1),
        "get": macro("#1[#2]", 2, 1),
        "set": macro("#1[#2]=#3", 3, 0),
        "len": macro("#1.length", 1, 1),
        "push": macro("#1.push(#2)", 2, 0),
        "remove": macro("#1.splice(#2, 1)", 2, 0),
      });
    }
  }),
}

exports.macro = macro
exports.modules = macro_modules