
string btos (bool b) { if (b) return "1"; return "0"; }

bool, bool, bool, bool bools (int n) {
  bool d = n > 7;
  n = n - ((n/8)*8);
  bool c = n > 3;
  n = n - ((n/4)*4);
  bool b = n > 1;
  n = n - ((n/2)*2);
  bool a = n > 0;
  return a, b, c, d;
}

string f (int n) {
  
  bool a, b, c, d;
  a, b, c, d = bools(n);

  string s = itos(n) + ":";
  /*s = s + btos(d);
  s = s + btos(c);
  s = s + btos(b);
  s = s + btos(a);
  return s;*/

  if (a) {
    lbl_1:
    s = s + "a";

    lbl_2:
    s = s + "b";
    return s;
  }

  if (b) {
    s = s + "c";
    goto lbl_1;
  } else if (c) {
    s = s + "d";
    goto lbl_3;
  }

  if (d) {
    s = s + "e";
    goto lbl_2;
  }

  lbl_3:
  s = s + "f";
  return s;
}

void main () {
  int i = 0;
  while (i < 15) {
    println(f(i));
    i = i+1;
  }
}