
var state = require("./state")
var macros = require("./macros")

var wrapperType = macros.wrapperType
var BaseModule = macros.BaseModule
var auroFn = macros.auroFn
var macro = macros.macro

var global_items = []
global_items.by_name = state.all_items

function add_item (item) {
  global_items.push(item)
  return global_items.length-1
}

function compile_code (item) {
  const Code = require("./code.js")

  var fn = {
    type: "code",
    ins: item.ins,
    outs: item.outs,
    code: []
  }

  var insts = item.code
  var i = 0

  function read_n (n) {
    var arr = [];
    for (var j = 0; j < n; j++) {
      arr.push(insts[i++]);
    }
    return arr
  }

  function push (it) { fn.code.push(it) }
  function one (tp) { push({type: tp, a: insts[i++]}) }
  function two (tp) { push({type: tp, a: insts[i++], b: insts[i++]}) }

  while (i < insts.length) {
    var k = insts[i++];
    if (typeof k == "number") {
      switch (k) {
        case 0: push({ type: "end", args: read_n(fn.outs.length) }); break;
        case 1: push({type: "hlt"}); break;
        case 2: push({type: "var"}); break;
        case 3: one("dup"); break;
        case 4: two("set"); break;
        case 5: one("jmp"); break;
        case 6: two("jif"); break;
        case 7: two("nif"); break;
        default: throw new Error("Unknown instruction kind " + k + " at instruction " + (i-1));
      }
    } else {
      push({
        type: "call",
        index: k,
        args: read_n(k.ins.length),
      })
    }
  }

  var code = new Code(fn, function (item) {
    return item
  })
  code.name = state.findName("fn")
  return code
}

function create_module (arg_module) {
  var compiler = require("./compiler")
  var state = require("./state")

  var js = compiler.compile_to_string(arg_module, "function")
  state.reset()

  // TODO: Hacky
  js = "var global_items = arguments[0];\n" + js
  console.log(js)
  var arg_fn = new Function(js)
  var arg_result = arg_fn(global_items)

  function build (arg) {
    return {
      ctx: arg_result.build(arg),
      "get": function (name) {
        var item = arg_result.get(this.ctx, name)

        if (item.is_runtime_code) {
          return compile_code(item)
        } else {
          return item
        }
      }
    }
  }

  var default_mod = null

  return {
    build: build,
    "get": function (name) {
      if (!default_mod) {
        default_mod = build({ "get": function () {} })
      }
      return default_mod.get(name)
    },
  }
}


// TODO: global_items could be shadowed by code variables
var modules = exports.modules = {
  "auro\x1fmodule": new BaseModule("auro.module", {
    "": wrapperType("Module"),
    "get": macro("#1.get(#2)", 2, 1),
    "build": macro("#1.build(#2)", 2, 1),
    "new": {
      build: function (argmod) {
        item_id = add_item(argmod)
        return new BaseModule("module.new", {
          "": macro("global_items[" + item_id + "]", 0, 1)
        })
      }
    },
    "create": {
      build: create_module
    }
  }),
  "auro\x1fmodule\x1fcode": new BaseModule("auro.module.code", {
    "": wrapperType("Code"),
    "new": macro("{ins: [], outs: [], code: [], is_runtime_code: true}"),
    "addinput": macro("#1.ins.push(#2)", 2, 0),
    "addoutput": macro("#1.outs.push(#2)", 2, 0),
    "addint": macro("#1.code.push(#2)", 2, 0),
    "addfn": macro("#1.code.push(#2)", 2, 0),
  }),
  "auro\x1ftype": new BaseModule("auro.type", {
    "": wrapperType("Type"),
    "new": {
      build: function (arg) {
        var tp = arg.get("")
        item_id = add_item(tp)
        return new BaseModule("type", {
          "": macro(item_id, 0, 1)
        })
      }
    }
  }),
  "auro\x1fmodule\x1fitem": new BaseModule("auro.item", {
    "": wrapperType("Item"),
    "null": macro("null", 0, 1),
    "type": macro.id,
    "code": macro.id,
    "module": macro.id,
    "isnull": macro("(#1 == null)", 1, 1),
    "function": {
      build: function (arg) {
        var ins = 0
        var outs = 0
        var i = 0

        while (true) {
          if (arg.get("in" + ins)) {
            ins++
          } else {
            break
          }
        }

        while (true) {
          if (arg.get("out" + outs)) {
            outs++
          } else {
            break
          }
        }
        return new BaseModule("item.function", {
          "": macro("global_items.by_name[#1.name]", 1, 1)
        })
      }
    }
  }),
}