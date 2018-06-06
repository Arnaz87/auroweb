import cobre.system { void println (string); }
import cobre.string {
  string itos (int);
  string `new` (buffer) as newstr;
}
import cobre.buffer {
  type buffer;
  buffer `new` (int) as newbuf;
  void set (buffer, int, int) as bufset;
}

void main () {
  buffer buf = newbuf(3);
  bufset(buf, 0, 65);
  bufset(buf, 1, 66);
  bufset(buf, 2, 67);
  println("\"Hola\" ¿cómo estás? " + newstr(buf) + itos(3));
}