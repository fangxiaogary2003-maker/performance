import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
execFileSync(process.execPath,[fileURLToPath(new URL('./admin.mjs',import.meta.url)),'backup',join(process.env.BACKUP_DIR||'/var/backups/gyroor-performance','auto-'+stamp)],{stdio:'inherit',env:process.env});
