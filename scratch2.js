const fs = require('fs');
let code = fs.readFileSync('apps/web/app/dashboard/scrutiny/page.tsx', 'utf8');

code = code.replace(
  /<select[^>]*name="responsibleUserId"[\s\S]*?<\/select>/g,
  '<UserSelect name="responsibleUserId" />'
);

code = code.replace(
  /<select[^>]*name="assigneeUserId"[\s\S]*?<\/select>/g,
  '<UserSelect name="assigneeUserId" />'
);

fs.writeFileSync('apps/web/app/dashboard/scrutiny/page.tsx', code);
