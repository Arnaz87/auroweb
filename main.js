function read (buffer) {
  buffer = new Uint8Array(buffer);
  var pos = 0;

  function fail (msg) { throw new Error(msg + ". at byte " + pos); }
  function unsupported (msg) { fail("Unsupported " + msg); }

  function readByte () {
    if (pos >= buffer.length)
      fail("Unexpected end of file");
    return buffer[pos++];
  }

  function readInt () {
    var n = 0;
    var b = readByte();
    while (b & 0x80) {
      n = (n << 7) | (b & 0x7f);
      b = readByte();
    }
    return (n << 7) | (b & 0x7f);
  }

  function readStr () {
    var len = readInt();
    var str = "";
    while (len > 0) {
      byte = readByte();
      str += String.fromCharCode(byte);
      len--;
    }
    return str;
  }

  function parseN (n, f) {
    var arr = [];
    for (var i = 0; i < n; i++)
      arr.push(f());
    return arr;
  }

  function readInts (n) { return parseN(n, readInt); }

  var magic = "";
  while (true) {
    var byte = readByte();
    if (byte == 0) break;
    magic += String.fromCharCode(byte);
  }
  if (magic !== "Cobre ~4") fail("Not a \"Cobre ~4\" module.");

  var modules = parseN(readInt(), function () {
    var k = readInt();
    switch (k) {
      case 0: return {
        type: "import",
        name: readStr(),
      };
      case 1: return {
        type: "define",
        items: parseN(readInt(), function () {
          var types = ["module", "type", "function", "const"];
          var k = readInt();
          if (k > 3) fail("Unknown item kind " + k);
          return {
            type: types[k],
            index: readInt(),
            name: readStr(),
          }
        })
      };
      case 2: return {
        type: "functor",
        name: readStr(),
      };
      case 3: return {
        type: "use",
        module: readInt(),
        item: readStr(),
      };
      case 4: return {
        type: "build",
        base: readInt(),
        argument: readInt(),
      };
      default: fail("Unknown import kind " + k);
    }
  });

  var types = parseN(readInt(), function () {
    var k = readInt();
    if (k == 0) fail("Null type");
    if (k != 1) fail("Unknown type kind " + k);
    return {
      type: "import",
      module: readInt(),
      name: readStr(),
    };
  });

  var functions = parseN(readInt(), function () {
    var k = readInt();
    var f;
    switch (k) {
      case 0: fail("Null function");
      case 1: f = {
        type: "import",
        module: readInt(),
        name: readStr(),
      }; break;
      case 2: f = {
        type: "code"
      }; break;
      default: fail("Unknown function kind " + k);
    }
    f.ins = parseN(readInt(), readInt);
    f.outs = parseN(readInt(), readInt);
    return f;
  });

  var statics = parseN(readInt(), function () {
    var k = readInt();
    switch (k) {
      case 0: fail("Null kind static");
      case 1: return {
        type: "import",
        module: readInt(),
        name: readStr(),
      };
      case 2: return {type: "int", value: readInt()};
      case 3:
        var len = readInt();
        var arr = [];
        for (var i = 0; i < len; i++)
          arr.push(readInt());
        return {
          type: "bin",
          data: arr,
        };
      case 4: return {type: "type", index: readInt()};
      case 5: return {type: "function", index: readInt()};
    }
    if (k < 16) fail("Unknown static kind " + k);
    return {type: "null", index: k-16};
  });

  function parseCode (fn) {
    function one (tp) { return {type: tp, a: readInt()}; }
    function two (tp) { return {type: tp, a: readInt(), b: readInt()}; }
    var count = readInt();
    return parseN(count, function () {
      var k = readInt();
      switch (k) {
        case 0: return {
          type: "end",
          args: readInts(fn.outs.length)
        };
        case 1: return {type: "var"};
        case 2: return one("dup");
        case 3: return two("set");
        case 4: return one("sgt");
        case 5: return two("sst");
        case 6: return one("jmp");
        case 7: return two("jif");
        case 8: return two("nif");
      }
      if (k < 16) fail("Unknown instruction " + k);
      var ix = k-16;
      if (ix >= functions.length)
        fail("Function index out of bounds");
      var ff = functions[ix];
      return {
        type: "call",
        index: ix,
        args: readInts(ff.ins.length),
      }
    });
  }
  
  for (var i in functions) {
    var fn = functions[i];
    if (fn.type != "code") continue;
    fn.code = parseCode(fn);
  }
  var static = {ins: [], outs: []};
  static.code = parseCode(static);

  function parseNode () {
    var n = readInt();
    if (n & 1) return n>>1;
    if (n & 2) {
      n = n >> 2;
      var str = "";
      while (n > 0) {
        byte = readByte();
        str += String.fromCharCode(byte);
        n--;
      }
      return str;
    }
    return parseN(n>>2, parseNode);
  }

  var metadata = parseNode();

  return {
    modules: modules,
    types: types,
    functions: functions,
    statics: statics,
    static: static,
    metadata: metadata,
  };
}

function macro (str) { return {type: "macro", macro: str, outs: [0]}; }

var base_modules = {
  "cobre.system": {
    "print": macro("console.log($1)"),
  },
  "cobre.int": {
    "add": macro("($1 + $2)"),
    "sub": macro("($1 - $2)"),
    "mul": macro("($1 * $2)"),
    "div": macro("($1 / $2)"),
    "eq": macro("($1 == $2)"),
    "ne": macro("($1 != $2)"),
    "gt": macro("($1 > $2)"),
    "lt": macro("($1 < $2)"),
    "gte": macro("($1 >= $2)"),
    "lte": macro("($1 <= $2)"),
  },
  "cobre.string": {
    "new": macro("$1"),
    "itos": macro("String($1)"),
    "concat": macro("($1 + $2)"),
    "eq": macro("($1 == $2)"),
  }
};

base_modules["cobre.system"]["print"].outs = [];

function compile (data) {
  var output = "";

  function putln (str) {
    output += str + "\n";
  }

  var modcache = [];
  function get_module(n) {
    if (modcache[n]) return modcache[n];
    var mdata = data.modules[n-1];
    if (mdata.type != "import")
      throw new Error("Only simple imported modules are supported");
    var mod = base_modules[mdata.name];
    if (!mod) throw new Error("Unknown module: " + mdata.name);
    mod.name = mdata.name;
    modcache[n] = mod;
    return mod;
  }

  var functions = [];
  for (var i = 0; i < data.functions.length; i++) {
    var fn = data.functions[i];
    if (fn.type == "import") {
      var mod = get_module(fn.module);
      var f = mod[fn.name];
      if (f) functions[i] = f;
      else throw new Error("Function " + fn.name + " not found in module " + mod.name);
    } else if (fn.type == "code") {
      fn.name = "_fn" + i;
      functions[i] = fn;
    } else {
      throw new Error("Unsupported function kind " + fn.type);
    }
  }
  data.static.name = "_static";


  for (var i = 0; i < data.statics.length; i++) {
    var cns = data.statics[i];
    var ln = "var cns_" + i + " = ";
    if (cns.type == "int") ln += cns.value;
    if (cns.type == "bin") {
      ln += "\"";
      for (var j = 0; j < cns.data.length; j++)
        ln += String.fromCharCode(cns.data[j]);
      ln += "\"";
    }
    if (cns.type == "null") ln += "null";
    putln(ln + ";");
  }

  function compileFn (fn) {
    var lbls = [];
    var regs = fn.ins.length;
    for (var i = 0; i < fn.code.length; i++) {
      var inst = fn.code[i];
      var k = inst.type;
      if (k == "var") regs++;
      if (k == "dup") inst.out = regs++;
      if (k == "sgt") inst.out = regs++;
      if (k == "jmp") lbls.push(inst.a);
      if (k == "jif") lbls.push(inst.a);
      if (k == "nif") lbls.push(inst.a);
      if (k == "call") {
        var ff = functions[inst.index];
        inst.outs = [];
        for (var j = 0; j < ff.outs.length; j++) {
          inst.outs.push(regs++);
        }
      }
    }

    for (var i = 0; i < lbls.length; i++) {
      fn.code[lbls[i]].lbl = true;
    }
    fn.code[0].lbl = true;

    var args = "";
    var first = true;
    for (var i = 0; i < fn.ins.length; i++) {
      if (i>0) args += ", ";
      args += "reg_" + i;
    }
    putln("function " + fn.name + "(" + args + ") {");

    var decl = "  var _result"
    for (var i = 0; i < regs; i++) {
      decl += ", reg_" + i;
    }
    putln(decl + ";");

    putln("  var _lbl = 0;")
    putln("  switch (_lbl) {");

    function reg (n) { return "reg_" + n; }

    for (var i = 0; i < fn.code.length; i++) {
      var inst = fn.code[i];
      if (inst.lbl) putln("  case " + i + ":");
      var k = inst.type;
      if (k == "dup") putln("  " + reg(inst.out) + " = " + reg(inst.a) + ";");
      if (k == "sgt") putln("  " + reg(inst.out) + " = cns_" + inst.a + ";");
      if (k == "sst") putln("  cns_" + inst.a + " = " + reg(inst.b) + ";");
      if (k == "jmp") putln("  _lbl = " + inst.a + " = " + reg(inst.b) + ";");
      if (k == "jif") putln("  if (" + reg(inst.b) + ") { _lbl = " + inst.a + "; break; }");
      if (k == "nif") putln("  if (!" + reg(inst.b) + ") { _lbl = " + inst.a + "; break; }");
      if (k == "call") {
        var ff = functions[inst.index];
        if (ff.type == "macro") {
          var call = ff.macro.replace("$1", reg(inst.args[0]));
          if (inst.args.length > 1)
            call = call.replace("$2", reg(inst.args[1]));
          if (inst.outs.length == 0) putln("  " + call + ";");
          else  putln("  " + reg(inst.outs[0]) + " = " + call + ";");
        } else {
        var args = "";
          for (var i = 0; i < inst.args.length; i++) {
            if (i > 0) args += ", ";
            args += reg(inst.args[i]);
          }
          putln("  _result = " + ff.name + "(" + args + ");")
          for (var j = 0; j < inst.outs.length; j++) {
            putln("  " + reg(inst.outs[i]) + " = _result[" + i + "]");
          }
        }
      }
    }

    putln("  }");
    putln("}");
  }

  compileFn(data.static);
  for (var i in functions) {
    var fn = functions[i];
    if (fn.type == "code") compileFn(fn);
  }

  putln("exports = {")
  for (var i = 0; i < data.modules[0].items.length; i++) {
    var item = data.modules[0].items[i];
    if (item.type == "function") {
      putln("  " + item.name + ": " + functions[item.index].name + ",");
    }
  }
  putln("};");
  putln("_static();")
  putln("exports.main();")

  console.log(output);
}


const fs = require("fs");
var parsed = read(fs.readFileSync("out"));
var compiled = compile(parsed);
