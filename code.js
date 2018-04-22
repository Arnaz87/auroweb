
function Code (fn, getfn) {
  this._fn = fn;
  this._getfn = getfn;

  this.ins = fn.ins;
  this.outs = fn.outs;
}

function Assign (reg, expr) {
  this.reg = reg;
  this.expr = expr;
}
Assign.prototype.use = function () { return this.reg.use() + " = " + this.expr.use() }
function Call (fn, args, outs) {
  this.fn = fn;
  this.args = args;
  this.outs = outs;
}
Call.prototype.use = function () {
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
function Return (args) {
  this.args = args;
}
Return.prototype.use = function () {
  if (this.args.length == 0) return "return";
  if (this.args.length == 1) return "return " + this.args[0].use();
  return "return [" + this.args.map(function (arg) {return arg.use()}).join(", ") + "]";
}

function Label (id) { this.label = id; }
Label.prototype.use = function () { return "case " + this.label + ":" }

function expand (stmts) {
  // A register is propagated when the assignment that sets its value can be
  //   removed and the expression is moved directly where it is used.
  // An expression is expanded when any of the values it uses is a register
  //   and it is propagated.
  // Registers can only be propagated when doing so does not modify the order
  //   of execution of the expressions in the code, that is, when nothing is
  //   done between where they are evaluated and where they are used. In C-like
  //   languages, function arguments are evaluated in positional order and then
  //   the function is called with those values.
  // This is done before identifying control flow structures, so the statements
  //   with expressions are assignemnts, function calls and branches.
  // Removed statements are also processed because they contain previously
  //   propagated expressions and can be expanded further
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
    if (stmt.isBranch) insert = true;
  }

  return out;
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
      return "if (" + cond + ") {_lbl = " + this.lbl + "; break}";
    }
    return "_lbl = " + this.lbl + "; break";
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

  stmts = insertLabels(stmts, lbls);
  stmts = expand(stmts);

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
  writer.write("var _lbl = 0;");
  writer.write("while (true) {");
  writer.indent();
  writer.write("switch (_lbl) {");
  writer.indent();

  for (var i = 0; i < this.ast.length; i++) {
    writer.write(this.ast[i].use() + ";");
    //writer.write("//", JSON.stringify(this.ast[i]));
  }
  writer.dedent();
  writer.write("}");
  writer.dedent();
  writer.write("}");

  writer.dedent();
  writer.write("}");
}

Code.prototype.use = function (args) { return this.name + "(" + args.join(", ") + ")"; }

module.exports = Code;