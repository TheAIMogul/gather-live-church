import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
async function clean(directory) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const location=join(directory,entry.name);
    if(entry.name==='.DS_Store')await rm(location);
    else if(entry.isDirectory())await clean(location);
  }
}
await clean('dist');
