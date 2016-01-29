#include <sys/types.h>
#include <sys/stat.h>
using namespace std;

int main() {
  dev_t dev;
  // create a fifo with read/write permissions for owner, and with read permissions for group and others
  int status = mknod("in.nod", S_IFIFO | S_IWUSR | S_IRUSR | S_IRGRP | S_IROTH, dev);   // input stream
  status = mknod("out.nod", S_IFIFO | S_IWUSR | S_IRUSR | S_IRGRP | S_IROTH, dev);      // output
  status = mknod("err.nod", S_IFIFO | S_IWUSR | S_IRUSR | S_IRGRP | S_IROTH, dev);      // error
  status = mknod("log.nod", S_IFIFO | S_IWUSR | S_IRUSR | S_IRGRP | S_IROTH, dev);      // log (not used, clog = cerr)
  return 0;
}
