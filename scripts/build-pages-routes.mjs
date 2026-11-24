import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const html = readFileSync('dist/index.html','utf8');
const routes = ['','login','register','forgot-password','verify-email','dashboard','services','store','cart','checkout','orders','projects','messages','credits','subscriptions','invoices','payments','files','support','notifications','profile','security','settings'];
for (const route of routes) {
  const dir = 'dist/portal' + (route ? '/' + route : '');
  mkdirSync(dir,{recursive:true});
  writeFileSync(dir+'/index.html',html);
}
// Dynamic detail routes retain their original path while booting the SPA.
writeFileSync('dist/404.html',html);
