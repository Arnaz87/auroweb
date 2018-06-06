import cobre.system { void println (string); }
import cobre.string { string itos (int); }

void main () {
  int i = 1;
  while (i < 8) {
    string str = "";
    int j = 0;
    while (j < 12) {
      str = str + itos(j) + " ";
      if (j == 6) {
        str = str + ">";
        goto cont;
      }
      j = j+i;
    }
    str = str + "|";
    cont:
    i = i+1;
    println(str);
  }
}

/*
Output:
0 1 2 3 4 5 6 >
0 2 4 6 >
0 3 6 >
0 4 8 |
0 5 10 |
0 6 >
0 7 |
*/