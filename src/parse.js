module.exports = function parse (buffer) {

buffer = new Uint8Array(buffer);
var pos = 0;

function fail (msg) { throw new Error(msg + ". at byte " + pos.toString(16)); }
function unsupported (msg) { fail("Unsupported " + msg); }

function readByte () {
  if (pos >= buffer.length)
    fail("Unexpected end of file");
  return buffer[pos++];
}

function readInt () {
  var n = 0;
  var b = readByte();
  while ((b & 0x80) > 0) {
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
if (magic !== "Auro 0.6") fail("Not an Auro 0.6 module");

var modules = parseN(readInt(), function () {
  var k = readInt();
  switch (k) {
    case 0: fail("Unknown import");
    case 1: return {
      type: "import",
      name: readStr(),
    };
    case 2: return {
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
  return {
    type: "import",
    module: k-1,
    name: readStr(),
  };
});

var functions = parseN(readInt(), function () {
  var k = readInt();
  var f;
  switch (k) {
    case 0: fail("Null function");
    case 1: f = {
      type: "code"
    }; break;
    default: f = {
      type: "import",
      module: k-2,
    };
  }
  f.ins = parseN(readInt(), readInt);
  f.outs = parseN(readInt(), readInt);
  if (k>1) f.name = readStr();
  return f;
});

var constCount = readInt();
for (var i = 0; i < constCount; i++) {
  var f;
  var k = readInt();
  if (k == 1) {
    f = {type: "int", value: readInt()};
  } else if (k == 2) {
    var len = readInt();
    var arr = [];
    for (var j = 0; j < len; j++)
      arr.push(readByte());
    f = {
      type: "bin",
      data: arr,
    };
  } else if (k < 16) {
    fail("Unknown constant kind " + k);
  } else {
    var ix = k-16;
    // Functions not yet in the function list are constants
    var argcount = (ix >= functions.length)? 0 : functions[ix].ins.length;
    f = {
      type: "call",
      index: ix,
      args: readInts(argcount),
    };
  }
  f.ins = [];
  f.outs = [-1];
  functions.push(f);
}

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
      case 1: return {type: "hlt"};
      case 2: return {type: "var"};
      case 3: return one("dup");
      case 4: return two("set");
      case 5: return one("jmp");
      case 6: return two("jif");
      case 7: return two("nif");
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

for (var i = 0; i < functions.length; i++) {
  var fn = functions[i];
  if (fn.type == "code")
    fn.code = parseCode(fn);
}

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
  metadata: metadata,
};

}