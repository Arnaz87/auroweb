
import auro.buffer {
  type buffer;
  buffer `new` (int size) as newbuf;
  int size (buffer) as bufsize;
  int get (buffer, int index) as bufget;
  void set (buffer, int index, int value) as bufset;
}

import auro.string {
  int length (string) as strlen;
  buffer tobuffer (string) as strbuf;
}

import auro.io {
  type file as File;
  type mode as FileMode;
  FileMode r() as r_mode;
  FileMode w() as w_mode;
  FileMode a() as a_mode;
  File open (string, FileMode);
  buffer read (File, int);
  bool eof (File);
  void write (File, buffer);
  void close (File);
}

void main () {
  println("¡Curaçao!");
  buffer b = strbuf("¡Curaçao!");
  int i = 0;
  println("Length: " + itos(bufsize(b)));
  while (i < bufsize(b)) {
    println(itos(bufget(b, i)));
    i = i+1;
  }
}