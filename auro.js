(function () {

function $require (name) {
  if (typeof require !== "function") return null
  try { return require(name) }
  catch (e) {
    if (e.code === "MODULE_NOT_FOUND") return null
    else throw e
  }
}

var Auro = {};

Auro._modules = {};

function LazyItem (callback) {
  var item = null

  var fn = function () { return (item || (item = callback())).apply(null, arguments) }

  fn.resolve = function () { return item || (item = callback()) }

  var fields = ["get", "test", "wrap", "unwrap", "build", "equals"]
  fields.forEach(function (field) {
    fn[field] = function (...args) {
      return LazyItem(function () {
        return (item || (item = callback()))[field].apply(item, args)
      })
    }
  })

  return fn
}

Auro.$import = function $import (name) {
  return Auro._modules[name] || LazyItem(function () {
    var mod = Auro._modules[name]
    if (!mod) throw new Error("module " + name + " not found")
    return mod
  })
}

Auro.$export = function $export (name, mod) {
  if (Auro._modules[name])
    console.warn("module " + name + " already exists")
  if (typeof mod === "function") mod = LazyItem(mod)
  Auro._modules[name] = mod
}

Auro.Module = function Module (data) { this.data = data }
Auro.Module.prototype.get = function get (name) {
  if (this.data instanceof Function)
    return this.data(name)
  return this.data[name]
}

Auro.Lazy = function (fn) {
  var val = null
  return function () {
    return val || (val = fn())
  }
}

var argv
if (typeof process.argv === "undefined") argv = []
else argv = process.argv.slice(1)

Auro.system = {
  println: function (msg) {
    console.log(msg)
  },
  exit: function () {
    if (typeof process !== "undefined") process.exit()
    else throw "Auro Exit"
  },
  error: function (msg) {
    throw new Error(msg)
  },
  argv: argv
}

function teq (a, b) {
  if (a.equals) return a.equals(b)
  if (b.equals) return b.equals(a)
  return a === b
}

var typeCount = 0
Auro.Type = function (base, name, equals) {
  this.wrap = function (val) { return {type: this, value: val} }
  this.test = function (val) { return val && val.type && teq(val.type, this) }
  this.unwrap = function (val) { return val.value }
}

Auro.Any = new Auro.Type(null, "Any")
Auro.Int = {
  wrap: function (str) { return str },
  unwrap: function (any) { return any },
  test: function (any) { return typeof any === "number" }
}
Auro.Bool = {
  wrap: function (str) { return str },
  unwrap: function (any) { return any },
  test: function (any) { return typeof any === "boolean" }
}
Auro.Float = new Auro.Type(null, "Float")
Auro.Float.isInfinite = function (n) { return n == Infinity || n == -Infinity }
Auro.Float.decimal = function (n, e) {
  while (e-- > 0) { n *= 10 }
  while (e++ < 0) { n /= 10 }
  return n
}

Auro.Buffer = {
  wrap: function (x) { return x },
  unwrap: function (x) { return x },
  test: function (any) { return any instanceof Uint8Array }
}

Auro.Null = function (base) {
  Auro.Type.call(this, null, "auro.null")
  this.is_null = true
  this.base = base
  this.equals = function (t) {
    return t.is_null && teq(base, t.base)
  }
}
Auro.Null.isNull = function (x) { return (typeof x === "undefined") ? true : x === null }

Auro.Array = function (base) {
  Auro.Type.call(this, null, "auro.array")
  this.is_array = true
  this.base = base
  this.equals = function (t) {
    return t.is_array && teq(base, t.base)
  }
}
Auro.Record = function (fields) {
  Auro.Type.call(this, null, "auro.record")
  this.is_record = true
  this.fields = fields
  this.equals = function (t) {
    if (!t.is_record || (t.fields.length != fields.length))
      return false
    for (var i = 0; i < fields.length; i++)
      if (!teq(fields[i], t.fields[i]))
        return false
    return true
  }
}
Auro.Function = function (ins, outs) {
  Auro.Type.call(this, null, "auro.function")
  this.is_fn = true
  this.ins = ins
  this.outs = outs
  this.equals = function (t) {
    if (!t.is_fn
      || t.ins.length != ins.length
      || t.outs.length != outs.length)
      return false
    for (var i = 0; i < ins.length; i++)
      if (!teq(ins[i], t.ins[i]))
        return false
    for (var i = 0; i < outs.length; i++)
      if (!teq(outs[i], t.outs[i]))
        return false
    return true
  }
}

Auro.Closure = {
  build: function (arg) {
    var fn = arg.get("0")
    return new Auro.Module({
      "new": function (bound) {
        return function () {
          arguments[arguments.length++] = bound
          return fn.apply(null, arguments)
        }
      }
    })
  }
}

Auro.String = {
  wrap: function (str) { return str },
  unwrap: function (any) { return any },
  test: function (any) { return typeof any === "string" },

  $new: function (buf) {
    if (typeof buf === "string") return buf
    var str = ""
    for (var i = 0; i < buf.length; i++)
      str += String.fromCharCode(buf[i])
    return decodeURIComponent(escape(str))
  },
  tobuf: function (str) {
    str = unescape(encodeURIComponent(str))
    var buf = new Uint8Array(str.length)
    for (var i = 0; i < str.length; i++)
      buf[i] = str.charCodeAt(i)
    return buf
  },
  charat: function (str, i) { return [str[i], i+1] }
}

Auro.ArrayList = function (base) {
  Auro.Type.call(this, null, "auro.utlis.arraylist")
  this.is_arraylist = true
  this.base = base
  this.equals = function (t) {
    return t.is_arraylist && teq(base, t.base)
  }
}

Auro.StringMap = function (base) {
  Auro.Type.call(this, null, "auro.stringmap")
  this.is_strmap = true
  this.base = base
  this.equals = function (t) { return t.is_strmap && teq(base, t.base) }
  this.Iterator = new Auro.Type(null, "auro.stringmap.iterator")
}

Auro.StringMap.Iterator = function (base) {
  Auro.Type.call(this, null, "auro.stringmap.iterator")
  this.is_strmap_iter = true
  this.base = base
  this.equals = function (t) { return t.is_strmap_iter && teq(base, t.base) }
}

Auro.StringMap.Iterator.$new = function (map) {
  return {
    map: map,
    i: 0,
    keys: Object.keys(map),
    next: function () {
      if (this.i >= this.keys.length) return null
      var k = this.keys[this.i++]
      return [k, this.map[k]]
    }
  }
}

Auro.StringMap.next

var fs = $require("fs")
if (fs) Auro.$export("auro\x1fio", new Auro.Module({
  r: function () {return "r"},
  w: function () {return "w"},
  a: function () {return "a"},
  open: function (path, mode) {
    return {f: fs.openSync(path, mode), size: fs.statSync(path).size, pos: 0}
  },
  close: function (file) { fs.closeSync(file.f) },
  read: function (file, size) {
    var buf = new Uint8Array(size)
    var redd = fs.readSync(file.f, buf, 0, size, file.pos)
    file.pos += redd
    return buf.slice(0, redd)
  },
  write: function (file, buf) {
    var written = fs.writeSync(file.f, buf, 0, buf.length, file.pos)
    file.pos += written
  },
  eof: function (file) { return file.pos >= file.size },
}))

if (typeof window !== "undefined")
  window.Auro = Auro
if (typeof module !== "undefined")
  module.exports = Auro
})();