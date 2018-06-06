
function writeNodes (writer, nodes) {
  for (var i = 0; i < nodes.length; i++) {
    var stmt = nodes[i];
    if (stmt.write) stmt.write(writer);
    else if (stmt.use) writer.write(nodes[i].use() + ";");
    else writer.write("// ", JSON.stringify(nodes[i]));
  }
}

// Structured code generation:
// Stupid papers do not include dates god dammit
// "Taming Control Flow: A Structured Approach to Eliminating Goto Statements"
//    Ana M. Erosa and Laurie J. Hendren


//=== Nodes ===//

function Assign (reg, expr) {
  this.reg = reg;
  this.expr = expr;

  this.use = function () { return this.reg.use() + " = " + this.expr.use() }
}

function Call (fn, args, outs) {
  this.fn = fn;
  this.args = args;
  this.outs = outs;

  this.use = function () {
    var args = this.args.map(function (arg) {return arg.use()});
    var left = "", right = "";
    if (this.outs != "inline") {
      if (this.outs.length > 1) {
        left = "var _r = ";
        for (var i = 0; i < this.outs.length; i++) {
          right += "; " + this.outs[i].use() + " = _r[" + i + "]";
        }
      } else if (this.outs.length == 1) {
        left = this.outs[0].use() + " = ";
      }
    }
    return left + this.fn.use(args) + right;
  }
}

function Return (args) {
  this.args = args;

  this.use = function () {
    if (this.args.length == 0) return "return";
    if (this.args.length == 1) return "return " + this.args[0].use();
    return "return [" + this.args.map(function (arg) {return arg.use()}).join(", ") + "]";
  }
}

function Label (id) {
  this.label = id;
  this.use = function () { return "// label " + this.label }
}

function Not (expr) {
  if (expr.isNot) return expr.expr
  if (expr == True) return False
  if (expr == False) return True
  return {
    expr: expr,
    isNot: true,
    use: function () { return "!" + this.expr.use() }
  }
}

function Or (a, b) {
  this.use = function () { return "(" + a.use() + " || " + b.use() + ")" }
}

var True  = {use: function () { return "true" }}
var False = {use: function () { return "false" }}



//=== Transformations ===//

function insertLabels (old, lbls) {
  var out = [];

  var insert = true;
  for (var i = 0; i < old.length; i++) {
    var stmt = old[i];
    if (insert || lbls.indexOf(i) >= 0) {
      out.push(new Label(i));
      insert = false;
    }
    if (!stmt.nop) out.push(stmt);
    if (stmt.isBranch) {
      insert = true;
      stmt.index = i;
    }
  }

  return out;
}

function expand (stmts) {
  // A register is propagated when the assignment that sets its value can be
  //   removed and the expression is moved directly where it is used.
  // An expression is said to be expanded when any of the values it uses
  //   is a register and it has been propagated.
  // Registers can only be propagated when doing so does not modify the order
  //   of execution of the expressions in the code, that is, when nothing is
  //   done between where they are evaluated and where they are used. In C-like
  //   languages, function arguments are evaluated in positional order and then
  //   the function is called with those values.
  // This is done before identifying control flow structures, so the statements
  //   with expressions are assignemnts, function calls and branches.
  // Removed statements are also processed because they contain previously
  //   propagated expressions and can be expanded further.
  // While processing statements, no expressions have been propagated, so all
  //   expressions are registers.
  // If a register is only used once and its assignment is known to be right
  //   before the statement that uses it, previous assignments are irrelevant
  //   and it can be expanded.

  function tryPropagate (stmt, reg) {
    if (reg.uses > 1) return false;
    if (stmt instanceof Assign && stmt.reg == reg) {
      stmt.remove = true;
      reg.prev = stmt.expr;
      reg.sets--;
      reg.uses--;
      return true;
    } else if (stmt instanceof Call && stmt.outs.length == 1 && stmt.outs[0] == reg) {
      stmt.outs = "inline";
      reg.prev = stmt;
      reg.sets--;
      reg.uses--;
      return true;
    }
    return false;
  }

  function getExpanded (reg) {
    while (reg.prev) {
      var prev = reg.prev;
      reg.prev = undefined;
      reg = prev;
    }
    return reg;
  }

  for (var i = stmts.length-1; i >= 0; i--) {
    var stmt = stmts[i];
    if (stmt instanceof Assign) {
      var prev = stmts[i-1];
      var reg = stmt.expr;
      tryPropagate(prev, reg);
    } else if (stmt instanceof Call) {
      var k = 1;
      for (var j = stmt.args.length - 1; j >= 0; j--) {
        var arg = stmt.args[j];
        var prev = stmts[i-k];
        if (tryPropagate(prev, arg)) k++
      }
    } else if (stmt.isBranch && stmt.cond) {
      var prev = stmts[i-1];
      var reg = stmt.cond;
      tryPropagate(prev, reg);
    }
  }

  var old = stmts;
  stmts = [];
  for (var i = 0; i < old.length; i++) {
    var stmt = old[i];
    if (stmt instanceof Assign) {
      if (stmt.reg.prev) continue;
      stmt.expr = getExpanded(stmt.expr);
      if (stmt.reg.uses == 0) stmt = stmt.expr;
    } else if (stmt instanceof Call) {
      for (var j = 0; j < stmt.args.length; j++) {
        stmt.args[j] = getExpanded(stmt.args[j]);
      }
      if (stmt.outs === "inline") continue;
    } else if (stmt.isBranch && stmt.cond) {
      stmt.cond = getExpanded(stmt.cond);
    }
    stmts.push(stmt);
  }
  return stmts;
}

function regularizeBranches (stmts) {
  for (var i = 0; i < stmts.length; i++) {
    var stmt = stmts[i]
    if (stmt.isBranch) {
      if (!stmt.cond) {
        stmt.cond = True
      } else if (stmt.neg) {
        stmt.cond = Not(stmt.cond)
        stmt.neg = false
      }
    }
  }
}

function removeGotos (stmts) {

  var gotos = []
  var labels = {}
  var usedLabels = {}

  function getLabelReg (lbl) {
    var r = usedLabels[lbl]
    if (!r) {
      r = {use: function () {return "goto_" + lbl}}
      usedLabels[lbl] = r
    }
    return  r
  }

  function Block (stmts, parent) {
    this.stmts = stmts

    this.lineage = [this]
    this.level = 0
    this.setParent = function (parent) {
      this.parent = parent
      this.lineage = parent.lineage.slice(0)
      this.lineage.push(this)
      this.level = this.lineage.length
      for (var i = 0; i < this.stmts.length; i++) {
        if (stmt.body !== undefined) stmt.body.setParent(this)
      }
    }
    if (parent) this.setParent(parent)

    this.calculateOffsets = function () {
      for (var i = 0; i < this.stmts.length; i++) {
        var stmt = this.stmts[i]
        if (stmt.isBranch || stmt.label !== undefined) {
          stmt.offset = i
          stmt.block = this
        }
        if (stmt.body !== undefined) {
          stmt.body.offset = i
          stmt.body.setParent(this)
        }
      }
    }

    this.slice = function (start, end) { return this.stmts.slice(start, end) }

    this.replace = function (start, end, item) {
      this.stmts.splice(start, end-start, item)
      this.calculateOffsets()
    }

    this.insert = function (pos, item) {
      this.stmts.splice(pos, 0, item)
      this.calculateOffsets()
    }

    this.direct = function (other) {
      var min = Math.min(this.level, other.level)
      for (var i = 0; i < min; i++) {
        if (this.lineage[i] != other.lineage[i]) return false
      }
      return true
    }

    this.calculateOffsets()
  }

  function Break (cond, target) {
    this.cond = cond
    this.target = target
    this.use = function () { return "if (" + this.cond.use() + ") break " + this.target.name }
  }

  function Continue (cond, target) {
    this.cond = cond
    this.target = target
    this.use = function () { return "if (" + this.cond.use() + ") continue " + this.target.name }
  }

  function If (body, cond) {
    this.isIf = true
    this.body = body
    this.cond = Not(cond)
    body.container = this
    this.write = function (writer) {
      var cond = this.cond ? this.cond.use() : "true"
      writer.write("if (", cond, ") {")
      writer.indent();
      writeNodes(writer, this.body.stmts);
      writer.dedent();
      writer.write("}");
    }
  }

  var loopcount = 1
  function Loop (body, cond, startlbl, breaklbl) {
    this.isLoop = true
    this.body = body
    body.container = this
    this.name = "loop_" + (loopcount++)

    var stmts = body.stmts

    for (var i = 0; i < stmts.length; i++) {
      var stmt = stmts[i]
      if (stmt.isBranch && stmt.lbl === breaklbl) {
        stmts[i] = new Break(stmt.cond, this)
        gotos.splice(gotos.indexOf(stmt), 1)
      }
      if (stmt.isBranch && stmt.lbl === startlbl) {
        stmts[i] = new Continue(stmt.cond, this)
        gotos.splice(gotos.indexOf(stmt), 1)
      }
    }

    if (cond != True) stmts.push(new Break(Not(cond), this))

    this.cond = True
    if (stmts[0] instanceof Break && stmts[0].target == this) {
      this.cond = Not(stmts.shift().cond)
    }

    body.calculateOffsets()

    this.write = function (writer) {
      writer.write(this.name + ": while (", this.cond.use(), ") {");
      writer.indent();
      writeNodes(writer, this.body.stmts);
      writer.dedent();
      writer.write("}")
    }
  }

  for (var i = 0; i < stmts.length; i++) {
    var stmt = stmts[i]
    if (stmt.isBranch) {
      gotos.push(stmt)
    } else if (stmt.label) {
      labels[stmt.label] = stmt
    }
  }

  var topBlock = new Block(stmts)

  mainloop:
  while (gotos.length > 0) {
    var stmt = gotos.pop()
    var label = labels[stmt.lbl]

    var block = stmt.block

    // Move outwards until direct and the goto not inmost
    while (!block.direct(label.block) || block.level > label.block.level) {
      var reg = getLabelReg(label.label)
      if (block.container instanceof Loop) {
        block.replace(stmt.offset, stmt.offset+1, new Break(reg, block.container))
      } else {
        var inner = block.slice(stmt.offset+1, block.stmts.length)
        var body = new Block(inner, block)
        var ifstmt = new If(body, reg)
        block.replace(stmt.offset, block.stmts.length, ifstmt)
      }
      block.insert(stmt.offset, new Assign(reg, stmt.cond))
      stmt.cond = reg
      block.parent.insert(block.offset+1, stmt)
      block = stmt.block
    }

    // Already direct, move inwards until siblings
    while (block.level < label.block.level) {
      var nextblock = label.block.lineage[block.level]
      if (nextblock.offset < stmt.offset) {
        throw new Exception("Goto Lifting not implemented")
        continue mainloop
      } else {
        var reg = getLabelReg(label.label)
        var inner = block.slice(stmt.offset+1, nextblock.offset)
        var body = new Block(inner, block)
        var ifstmt = new If(body, reg)
        block.replace(stmt.offset, nextblock.offset, ifstmt)
        block.insert(stmt.offset, new Assign(reg, stmt.cond))
        nextblock.container.cond = new Or(reg, nextblock.container.cond)
        nextblock.insert(0, stmt)
        stmt.cond = reg
        block = stmt.block
      }
    }

    // Guaranteed to be siblings (I think...)
    if (stmt.offset < label.offset) {
      // The label must end up outside the if, because the gotos are
      // processed bottom up and no inner structure will use the labels
      // again
      var inner = block.slice(stmt.offset+1, label.offset)
      var body = new Block(inner, block)
      var ifstmt = new If(body, stmt.cond)
      block.replace(stmt.offset, label.offset, ifstmt)
    } else {
      // The label must end up outside the loop, because any inner goto
      // using it must necessarily be a continue statement
      var inner = block.slice(label.offset+1, stmt.offset)
      var body = new Block(inner, block)
      var breaklbl = block.stmts[stmt.offset+1].label
      var ifstmt = new Loop(body, stmt.cond, label.label, breaklbl)
      block.replace(label.offset+1, stmt.offset+1, ifstmt)
    }
    var reg = usedLabels[label.label]
    if (reg) {
      label.block.insert(label.offset, new Assign(reg, False))
    }
  }

  if (Object.keys(usedLabels).length) {
    topBlock.stmts.unshift({
      use: function () {
        var names = []
        for (var key in usedLabels) {
          names.push(usedLabels[key].use() + "=false")
        }
        return "var " + names.join(", ")
      }
    })
  }

  return topBlock.stmts
}

function cleanUp (old) {
  var stmts = []
  for (var i = 0; i < old.length; i++) {
    var stmt = old[i]
    if (stmt instanceof Label) continue
    if (stmt.isIf) {
      if (stmt.cond == False) continue
      var body = cleanUp(stmt.body.stmts)
      if (stmt.cond == True) {
        stmts = stmts.join(body)
        continue
      } else {
        stmt.body.stmts = body
      }
    } else if (stmt.isLoop) {
      var body = cleanUp(stmt.body.stmts)
      stmt.body.stmts = body
    }
    stmts.push(stmt)
  }
  return stmts
}


//=== Main Interface ===//

function Code (fn, getfn) {
  this._fn = fn;
  this._getfn = getfn;

  this.ins = fn.ins;
  this.outs = fn.outs;
}

Code.prototype.build = function () {
  var fn = this._fn;

  var lbls = [];
  var regs = {};
  var regc = 0;

  function Reg (id, set) {
    if (this instanceof Reg) {
      this.id = id;
      this.uses = 0;
      this.sets = 0;
    } else {
      var reg;
      if (regs[id]) {
        reg = regs[id];
      } else {
        var reg = new Reg(id);
        regs[id] = reg;
      }
      if (set) reg.sets++;
      else reg.uses++;
      return reg;
    }
  }
  Reg.prototype.use = function () { return "reg_" + this.id; }

  function Branch (lbl, cond, neg) {
    this.isBranch = true;
    this.lbl = lbl;
    this.cond = cond;
    this.neg = Boolean(neg);
    lbls.push(lbl);
  }
  Branch.prototype.use = function () {
    if (this.cond) {
      var cond = this.cond.use();
      if (this.neg) cond = "!" + cond;
      return "if (" + cond + ") { goto(" + this.lbl + "); }";
    }
    return "goto(" + this.lbl + ")";
  }

  for (var i = 0; i < fn.ins.length; i++) { Reg(regc++, true) }

  var stmts = [];

  for (var i = 0; i < fn.code.length; i++) {
    var stmt = undefined;
    var inst = fn.code[i];
    var k = inst.type;
    if (k=="hlt") stmt = new Halt();
    if (k=="var") {Reg(regc++, true); stmt = {nop: true};}
    if (k=="dup") stmt = new Assign(Reg(regc++, true), Reg(inst.a));
    if (k=="set") stmt = new Assign(Reg(inst.a, true), Reg(inst.b));
    if (k=="jmp") stmt = new Branch(inst.a);
    if (k=="jif") stmt = new Branch(inst.a, Reg(inst.b));
    if (k=="nif") stmt = new Branch(inst.a, Reg(inst.b), true);
    if (k=="call") {
      var ff = this._getfn(inst.index);
      var args = inst.args.map(function (x) {return Reg(x);});
      var outs = [];
      for (var j = 0; j < ff.outs.length; j++) {
        outs.push(Reg(regc++, true));
      }
      stmt = new Call(ff, args, outs);
    }
    if (k=="end") {
      var args = inst.args.map(function (x) {return Reg(x);});
      stmt = new Return(args);
    }
    if (stmt === undefined) throw new Error("Unknown instruction " + k);
    else if (stmt) stmts.push(stmt);
  }

  regs.length = regc;

  stmts = insertLabels(stmts, lbls)
  stmts = expand(stmts)
  regularizeBranches(stmts)

  stmts = removeGotos(stmts)
  stmts = cleanUp(stmts)

  this.ast = stmts;
  this.regs = regs;
}

Code.prototype.compile = function (writer) {
  this.build();

  var args = [], regs = [];
  for (var i = 0; i < this.ins.length; i++)
    args.push(this.regs[i].use());
  for (var i = this.ins.length; i < this.regs.length; i++) {
    var reg = this.regs[i];
    if (reg && reg.uses > 0 && reg.sets > 0) {
      regs.push(reg.use());
    }
  }

  writer.write("function ", this.name, " (" + args.join(", ") + ") {");
  writer.indent();

  if (regs.length > 0) {
    writer.write("var " + regs.join(", ") + ";");
  }
  writeNodes(writer, this.ast);
  writer.dedent();
  writer.write("}");
}

Code.prototype.use = function (args) { return this.name + "(" + args.join(", ") + ")"; }

module.exports = Code;