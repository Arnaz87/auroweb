
import auro.system { void println (string); }

import auro.function (string as in0, string as in1) {
  type `` as fn2 {
    void apply (string, string);
  }
  module `new` as newfn2;
}

import auro.function (string as in0) {
  type `` as fn1 { void apply (string); }
  module closure;
}

import module newfn2 (fa) { fn2 `` () as get_fn2a; }
import module newfn2 (fb) { fn2 `` () as get_fn2b; }

import module closure (fa as `0`) { fn1 `new` (string) as fa_closure; }

void fa (string x, string y) { println("a" + x + y); }
void fb (string x, string y) { println("b" + x + y); }

void main () {
  get_fn2a().apply("1", "2");
  get_fn2b().apply("1", "2");

  fn1 aa = fa_closure("3");
  fn1 ab = fa_closure("4");
  aa.apply("1");
  ab.apply("1");
}