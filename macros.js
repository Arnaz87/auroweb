
var types = [];

var alphabet = ("abcdefghijklmnopqrstuvwxyz").split("")

function newType (name, line) {
  var tp = {name: name, id: types.length, compile: function (writer) {
    if (line) writer.write("var " + this.name + " = " + line + ";");
  }};
  types.push(tp)
  return tp
}

function BaseModule (data) {
  this.data = data
  this.get = function (name) {
    var val = data[name]
    if (!val) throw new Error(name + " not found in module")
    return val
  }
}

function macro (str, inc, outc) {
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

var recordcache = {}
var arraycache = {}
var arraylistcache = {}
var strmapcache = {}

var anyModule = new BaseModule({ "any": newType("Auro.Any") })

var macro_modules = {
  "auro\x1fbool": new BaseModule({
    "bool": newType("Auro.Bool"),
    "true": macro("true", 0, 1),
    "false": macro("false", 0, 1),
    "not": macro("!$1", 1, 1),
  }),
  "auro\x1fsystem": new BaseModule({
    "println": macro("Auro.system.println($1)", 1, 0),
    "error": macro("Auro.system.error($1)", 1, 0),
    "exit": macro("Auro.system.exit()", 0, 0),
    argc: macro("Auro.system.argv.length", 0, 1),
    argv: macro("Auro.system.argv[$1]", 1, 1),
  }),
  "auro\x1fint": new BaseModule({
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
  "auro\x1ffloat": new BaseModule({
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
  "auro\x1fstring": new BaseModule({
    "string": newType("Auro.String"),
    "new": macro("Auro.String.$new($1)", 1, 1),
    "itos": macro("String($1)", 1, 1),
    "ftos": macro("String($1)", 1, 1),
    "concat": macro("($1 + $2)", 2, 1),
    "slice": macro("$1.slice($2, $3)", 3, 1),
    "add": macro("($1 + $2)", 2, 1),
    "eq": macro("($1 == $2)", 2, 1),
    "length": macro("$1.length", 1, 1),
    "charat": macro("Auro.String.charat($1, $2)", 2, 2),
    "newchar": macro("String.fromCharCode($1)", 1, 1),
    "codeof": macro("$1.charCodeAt(0)", 1, 1),
    "tobuffer": macro("Auro.String.tobuf($1)", 1, 1),
  }),
  "auro\x1fmath": new BaseModule({
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
  "auro\x1fbuffer": new BaseModule({
    "new": macro("new Uint8Array($1)", 1, 1),
    get: macro("$1[$2]", 2, 1),
    set: macro("$1[$2]=$3", 3, 0),
    size: macro("$1.length", 1, 1),
    readonly: macro("false", 1, 1),
  }),
  "auro\x1farray": {build: function (arg) {
    var base = arg.get("0");
    var mod = arraycache[base.id];
    if (mod) return mod;
    var tp = newType(null, "new Auro.Array(" + base.name + ")");
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
  "auro\x1fany": {
    build: function (arg) {
      var base = arg.get("0");
      if (!base) return anyModule;
      var id = base.id;
      return { "get": function (name) {
        if (name == "new") return macro(base.name + ".wrap($1)", 1, 1);
        if (name == "test") return macro(base.name + ".test($1)", 1, 1);
        if (name == "get") return macro(base.name + ".unwrap($1)", 1, 1);
      } };
    },
    get: function (name) {
      if (name == "any") return anyModule.data.any;
    }
  },
  "auro\x1fnull": { build: function (arg) {
    var base = arg.get("0");
    var tp = newType("new Auro.Null(" + base.name + ")");
    return new BaseModule({
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

    var tp = newType(null, "new Auro.Record([" + names.join(",") + "])");

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
  "auro\x1ftypeshell": {build: function (arg) {
    // Each time it's called, a new type is created
    return new BaseModule({
      "": newType(null, "new Auro.Type()"),
      "new": macro("$1", 1, 1),
      "get": macro("$1", 1, 1),
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
          use: function (fargs) { return fn.name }
        }})
      } },
      closure: {
        name: "Auro.Closure",
        build: function (args) {
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
  "auro\x1futils\x1fstringmap": {build: function (arg) {
    var base = arg.get("0");
    var mod = strmapcache[base.id];
    if (mod) return mod;
    var tp = newType(null, "new Auro.StringMap(" + base.name + ")");
    var itertp = newType(null, "new Auro.StringMap.Iterator(" + base.name + ")")
    mod = new BaseModule({
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
    var tp = newType(null, "new Auro.ArrayList(" + base.name + ")");
    mod = new BaseModule({
      "": tp,
      "new": macro("[]", 0, 1),
      "get": macro("$1[$2]", 2, 1),
      "set": macro("$1[$2]=$3", 3, 0),
      "len": macro("$1.length", 1, 1),
      "push": macro("$1.push($2)", 2, 0),
    });
    arraylistcache[base.id] = mod;
    return mod;
  } },
}

exports.macro = macro
exports.modules = macro_modules